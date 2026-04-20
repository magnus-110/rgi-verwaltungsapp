// Generate personalized DOCX letters for each recipient and bundle them as a ZIP.
// Uses docxtemplater + pizzip; runs entirely in Deno on edge.
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import PizZip from "npm:pizzip@3.1.7";
import Docxtemplater from "npm:docxtemplater@3.50.0";
import { loadRecipients, RecipientFilter } from "../_shared/comm-vars.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { campaign_id } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    const { data: campaign, error: cErr } = await admin
      .from("comm_campaigns").select("*").eq("id", campaign_id).single();
    if (cErr || !campaign) return json({ error: "Campaign not found" }, 404);

    // Resolve docx path: override on campaign or template
    let docxPath = campaign.docx_path_override as string | null;
    if (!docxPath && campaign.template_id) {
      const { data: t } = await admin.from("comm_templates").select("docx_path").eq("id", campaign.template_id).single();
      docxPath = t?.docx_path || null;
    }
    if (!docxPath) return json({ error: "Keine Word-Vorlage hinterlegt" }, 400);

    await admin.from("comm_campaigns").update({ status: "generating" }).eq("id", campaign_id);

    // Load template file
    const { data: tplFile, error: dlErr } = await admin.storage.from("comm-assets").download(docxPath);
    if (dlErr || !tplFile) {
      await admin.from("comm_campaigns").update({ status: "failed", error_message: dlErr?.message || "Template download failed" }).eq("id", campaign_id);
      return json({ error: dlErr?.message || "Template download failed" }, 500);
    }
    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());

    // Load recipients
    const filter = (campaign.recipient_filter || {}) as RecipientFilter;
    const freeVars = (campaign.free_vars || {}) as Record<string, string>;
    const recipients = await loadRecipients(admin, campaign.building_id, filter, freeVars);

    if (recipients.length === 0) {
      await admin.from("comm_campaigns").update({ status: "failed", error_message: "Keine Empfänger gefunden" }).eq("id", campaign_id);
      return json({ error: "Keine Empfänger gefunden" }, 400);
    }

    // Create ZIP bundle of generated DOCX files
    const bundle = new PizZip();
    let okCount = 0;
    let failCount = 0;

    // Reset previous recipients
    await admin.from("comm_recipients").delete().eq("campaign_id", campaign_id);

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      try {
        const zip = new PizZip(tplBuf);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: "{{", end: "}}" },
        });
        doc.render(r.vars);
        const outBuf: Uint8Array = doc.getZip().generate({ type: "uint8array" });

        const baseName = sanitize(r.display_name) || `empfaenger_${i + 1}`;
        const fileName = `${String(i + 1).padStart(3, "0")}_${baseName}.docx`;
        bundle.file(fileName, outBuf);

        await admin.from("comm_recipients").insert({
          campaign_id,
          contact_id: r.contact_id,
          person_id: r.person_id,
          building_id: r.building_id,
          display_name: r.display_name,
          email: r.email,
          resolved_vars: r.vars,
          status: "done",
          generated_file_path: null,
        });
        okCount++;
      } catch (e: any) {
        failCount++;
        await admin.from("comm_recipients").insert({
          campaign_id,
          contact_id: r.contact_id,
          person_id: r.person_id,
          building_id: r.building_id,
          display_name: r.display_name,
          email: r.email,
          resolved_vars: r.vars,
          status: "failed",
          error: e?.message || "Render failed",
        });
      }
    }

    const zipBytes = bundle.generate({ type: "uint8array" });
    const zipPath = `campaigns/${campaign_id}/serienbrief_${Date.now()}.zip`;
    const { error: upErr } = await admin.storage.from("comm-assets").upload(zipPath, zipBytes, {
      contentType: "application/zip",
      upsert: true,
    });
    if (upErr) {
      await admin.from("comm_campaigns").update({ status: "failed", error_message: upErr.message }).eq("id", campaign_id);
      return json({ error: upErr.message }, 500);
    }

    await admin.from("comm_campaigns").update({
      status: "done",
      result_zip_path: zipPath,
      recipient_count: recipients.length,
      sent_count: okCount,
      failed_count: failCount,
      completed_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return json({ success: true, recipient_count: recipients.length, ok: okCount, failed: failCount, zip_path: zipPath });
  } catch (e: any) {
    console.error("comm-render-letters error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
