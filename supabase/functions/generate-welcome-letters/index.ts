// Generate personalised welcome-letter DOCX files (one per owner) with an
// embedded magic-link QR code. Bundles them as a ZIP and files the bundle
// into the building's DMS under "Begrüßungsbriefe".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "npm:pizzip@3.1.7";
import Docxtemplater from "npm:docxtemplater@3.50.0";
import ImageModule from "npm:docxtemplater-image-module-free@1.1.1";
import QRCode from "npm:qrcode@1.5.4";
import { loadRecipients } from "../_shared/comm-vars.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

function randomToken(len = 48): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: hasAccess } = await admin.rpc("user_has_admin_access", {
      user_id: userRes.user.id,
    });
    if (!hasAccess) return json({ error: "Forbidden" }, 403);

    const {
      building_id,
      template_id,
      ttl_hours = 24 * 30, // 30 days
    } = await req.json();
    if (!building_id) return json({ error: "building_id required" }, 400);

    // Resolve template
    let docxPath: string | null = null;
    if (template_id) {
      const { data: t } = await admin
        .from("comm_templates").select("docx_path").eq("id", template_id).maybeSingle();
      docxPath = t?.docx_path ?? null;
    } else {
      const { data: b } = await admin
        .from("buildings").select("welcome_letter_template_id").eq("id", building_id).maybeSingle();
      if (b?.welcome_letter_template_id) {
        const { data: t } = await admin
          .from("comm_templates").select("docx_path")
          .eq("id", b.welcome_letter_template_id).maybeSingle();
        docxPath = t?.docx_path ?? null;
      }
    }
    if (!docxPath) {
      return json({ error: "Keine Begrüßungsbrief-Vorlage hinterlegt." }, 400);
    }

    const { data: tplFile, error: dlErr } = await admin.storage
      .from("comm-assets").download(docxPath);
    if (dlErr || !tplFile) {
      return json({ error: dlErr?.message || "Vorlage konnte nicht geladen werden" }, 500);
    }
    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());

    // Load owners (role = eigentuemer)
    const recipients = await loadRecipients(
      admin,
      building_id,
      { roles: ["eigentuemer"] },
    );
    if (recipients.length === 0) {
      return json({ error: "Keine Eigentümer gefunden." }, 400);
    }

    // Map contacts -> auth user (via contacts.user_id)
    const contactIds = Array.from(new Set(recipients.map((r) => r.contact_id)));
    const { data: contactsRows } = await admin
      .from("contacts").select("id, user_id").in("id", contactIds);
    const userByContact = new Map<string, string | null>(
      (contactsRows ?? []).map((c: any) => [c.id, c.user_id ?? null]),
    );

    const origin = req.headers.get("origin") || "https://rgi-immobilien.app";
    const expiresAt = new Date(Date.now() + Number(ttl_hours) * 3600 * 1000).toISOString();

    const bundle = new PizZip();
    let okCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Image-module config — uses {%placeholder} syntax
    const imageOpts = {
      centered: false,
      getImage: (tagValue: any) => tagValue, // already Uint8Array
      getSize: () => [180, 180] as [number, number],
    };

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      try {
        const targetUser = userByContact.get(r.contact_id);
        let magicUrl = "";
        if (targetUser) {
          const token = randomToken();
          const { error: insErr } = await admin
            .from("onboarding_magic_links").insert({
              token,
              user_id: targetUser,
              building_id,
              expires_at: expiresAt,
            });
          if (insErr) throw insErr;
          magicUrl = `${origin}/login/magic/${token}`;
        }

        // QR code as PNG (Uint8Array)
        let qrBytes: Uint8Array | null = null;
        if (magicUrl) {
          const dataUrl = await QRCode.toDataURL(magicUrl, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 360,
          });
          const b64 = dataUrl.split(",")[1] || "";
          const bin = atob(b64);
          qrBytes = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) qrBytes[j] = bin.charCodeAt(j);
        }

        const zip = new PizZip(tplBuf);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: "{{", end: "}}" },
          modules: [new (ImageModule as any)(imageOpts)],
        });

        doc.render({
          ...r.vars,
          magic_link_url: magicUrl,
          magic_link_qr: qrBytes,
        });

        const outBuf: Uint8Array = doc.getZip().generate({ type: "uint8array" });
        const baseName = sanitize(r.display_name) || `eigentuemer_${i + 1}`;
        const fileName = `${String(i + 1).padStart(3, "0")}_${baseName}.docx`;
        bundle.file(fileName, outBuf);
        okCount++;
      } catch (e: any) {
        failCount++;
        errors.push(`${r.display_name}: ${e?.message || String(e)}`);
      }
    }

    if (okCount === 0) {
      return json({ error: "Kein Brief konnte erstellt werden", details: errors }, 500);
    }

    const zipBytes = bundle.generate({ type: "uint8array" });
    const dateSlug = new Date().toISOString().slice(0, 10);
    const zipFileName = `Begruessungsbriefe_${dateSlug}.zip`;
    const zipPath = `welcome-letters/${building_id}/${Date.now()}_${zipFileName}`;

    const { error: upErr } = await admin.storage
      .from("comm-assets")
      .upload(zipPath, zipBytes, { contentType: "application/zip", upsert: true });
    if (upErr) return json({ error: upErr.message }, 500);

    // File into DMS under "Begrüßungsbriefe" category
    let dmsFileId: string | null = null;
    try {
      const { data: building } = await admin
        .from("buildings").select("management_mode").eq("id", building_id).maybeSingle();
      const mode = building?.management_mode || "weg";

      let { data: cat } = await admin
        .from("building_file_categories")
        .select("id")
        .eq("slug", "begruessungsbriefe")
        .or(`building_id.eq.${building_id},building_id.is.null`)
        .order("building_id", { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();

      if (!cat) {
        const { data: created } = await admin
          .from("building_file_categories")
          .insert({
            name: "Begrüßungsbriefe",
            slug: "begruessungsbriefe",
            building_id,
            management_mode: mode,
            icon: "mail",
            color: "#10B981",
            sort_order: 65,
            auto_rag_enabled: false,
          })
          .select("id").single();
        cat = created;
      }

      const dmsPath = `welcome-letters/${building_id}/${Date.now()}_${zipFileName}`;
      await admin.storage.from("building-files")
        .upload(dmsPath, zipBytes, { contentType: "application/zip", upsert: true });

      const { data: bf } = await admin.from("building_files").insert({
        building_id,
        category_id: cat?.id || null,
        display_name: zipFileName,
        description: `Begrüßungsbriefe für ${okCount} Eigentümer (Magic-Link gültig bis ${new Date(expiresAt).toLocaleDateString("de-DE")}).`,
        file_path: dmsPath,
        file_size: zipBytes.length,
        mime_type: "application/zip",
        management_mode: mode,
        source: "manual",
        uploaded_by: userRes.user.id,
        rag_enabled: false,
        visibility_role: "intern",
        visible_to_users: false,
        tags: ["begruessungsbrief", "onboarding"],
      }).select("id").single();
      dmsFileId = bf?.id ?? null;
    } catch (filingError) {
      console.error("DMS auto-filing error (non-fatal):", filingError);
    }

    return json({
      success: true,
      ok: okCount,
      failed: failCount,
      errors,
      zip_path: zipPath,
      dms_file_id: dmsFileId,
      expires_at: expiresAt,
    });
  } catch (e: any) {
    console.error("generate-welcome-letters error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
