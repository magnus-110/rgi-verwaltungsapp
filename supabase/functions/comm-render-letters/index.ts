// Generate personalized DOCX letters for each recipient and bundle them as a ZIP.
// Uses docxtemplater + pizzip; runs entirely in Deno on edge.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";
import { loadRecipients, RecipientFilter } from "../_shared/comm-vars.ts";

const MEETING_TIME_ZONE = "Europe/Berlin";
const monthsDe = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

function meetingDateParts(d: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("de-DE", {
      timeZone: MEETING_TIME_ZONE,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function formatMeetingDateLong(d: Date): string {
  const parts = meetingDateParts(d);
  return `${Number(parts.day)}. ${monthsDe[Number(parts.month) - 1]} ${parts.year}`;
}

function formatMeetingDateShort(d: Date): string {
  const parts = meetingDateParts(d);
  return `${parts.day}.${parts.month}.${parts.year}`;
}

function formatMeetingTime(d: Date): string {
  const parts = meetingDateParts(d);
  return `${parts.hour}:${parts.minute}`;
}

async function loadMeetingVars(admin: any, meetingId: string): Promise<Record<string,string>> {
  const { data: meeting } = await admin.from("etv_meetings").select("*").eq("id", meetingId).maybeSingle();
  if (!meeting) return {};
  const { data: tops } = await admin.from("etv_agenda_items")
    .select("title, description, sort_order, include_description_in_invitation").eq("meeting_id", meetingId).order("sort_order");
  const items = (tops || []) as any[];
  // Beschreibung nur übernehmen, wenn die Checkbox am TOP gesetzt ist.
  const agenda = items.map((t, i) => {
    const raw = t.include_description_in_invitation ? String(t.description ?? "").trim() : "";
    // Mehrzeilige Beschreibungen behalten ihre Absätze, jede Zeile wird eingerückt.
    const beschreibung = raw
      ? raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0).map((l) => `    ${l}`).join("\n")
      : "";
    return {
      nummer: String(i + 1),
      titel: String(t.title || "").trim(),
      beschreibung: raw,
      beschreibung_eingerueckt: beschreibung,
      hat_beschreibung: beschreibung.length > 0,
    };
  });
  const agendaList = agenda
    .map((t) => `TOP ${t.nummer} – ${t.titel}${t.hat_beschreibung ? `\n${t.beschreibung_eingerueckt}` : ""}`)
    .join("\n\n");
  const agendaTitles = agenda.map((t) => `TOP ${t.nummer} – ${t.titel}`).join("\n");
  const md = meeting.meeting_date ? new Date(meeting.meeting_date) : null;
  return {
    meeting_title: meeting.title || "",
    meeting_date: md ? formatMeetingDateLong(md) : "",
    meeting_date_short: md ? formatMeetingDateShort(md) : "",
    meeting_weekday: md ? meetingDateParts(md).weekday || "" : "",
    meeting_time: md ? formatMeetingTime(md) : "",
    meeting_location: meeting.location || "",
    meeting_chair: meeting.meeting_chair || "",
    minutes_taker: meeting.minutes_taker || "",
    agenda_list: agendaList,
    agenda_titles: agendaTitles,
    top_count: String(items.length),
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Datei-Präfix aus den Einheitennummern eines Empfängers (4-stellig, z. B. "0003_").
 * Mehrere Einheiten werden verbunden ("0003-0007_"), damit der Name eindeutig bleibt
 * und Rundmails Anhänge automatisch je Einheit zuordnen können.
 */
function unitPrefixFromVars(vars: Record<string, any>): string {
  const raw = String(vars?.einheiten || vars?.einheit || "");
  const nums = Array.from(raw.matchAll(/\d+/g))
    .map((m) => Number(m[0]))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return "";
  const uniq = Array.from(new Set(nums)).sort((a, b) => a - b);
  return `${uniq.map((n) => String(n).padStart(4, "0")).join("-")}_`;
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

async function convertDocxToPdf(docxBytes: Uint8Array, filename: string, apiKey: string): Promise<Uint8Array> {
  // Base64-encode docx (chunked to avoid call stack issues on large files)
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < docxBytes.length; i += chunk) {
    binary += String.fromCharCode(...docxBytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);

  // Create job (sync wait via /v2/jobs?... is not always reliable; we poll instead)
  const jobRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: {
        "import-1": { operation: "import/base64", file: b64, filename },
        "convert-1": { operation: "convert", input: "import-1", input_format: "docx", output_format: "pdf" },
        "export-1": { operation: "export/url", input: "convert-1" },
      },
    }),
  });
  if (!jobRes.ok) throw new Error(`CloudConvert job create failed: ${jobRes.status} ${await jobRes.text()}`);
  const job = await jobRes.json();
  const jobId = job?.data?.id;
  if (!jobId) throw new Error("CloudConvert: no job id");

  // Wait for job completion (sync endpoint)
  const waitRes = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${jobId}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!waitRes.ok) throw new Error(`CloudConvert wait failed: ${waitRes.status} ${await waitRes.text()}`);
  const waited = await waitRes.json();
  if (waited?.data?.status !== "finished") {
    throw new Error(`CloudConvert job not finished: ${waited?.data?.status} – ${JSON.stringify(waited?.data?.tasks?.map((t: any) => ({ n: t.name, s: t.status, m: t.message })) || [])}`);
  }
  const exportTask = waited.data.tasks.find((t: any) => t.name === "export-1");
  const url = exportTask?.result?.files?.[0]?.url;
  if (!url) throw new Error("CloudConvert: no export url");
  const pdfRes = await fetch(url);
  if (!pdfRes.ok) throw new Error(`CloudConvert export download failed: ${pdfRes.status}`);
  return new Uint8Array(await pdfRes.arrayBuffer());
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

    const body = await req.json();
    const campaign_id = body?.campaign_id;
    const outputFormat: "docx" | "pdf" = body?.output_format === "pdf" ? "pdf" : "docx";
    const meeting_id: string | null = body?.meeting_id || null;
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    const cloudConvertKey = Deno.env.get("CLOUDCONVERT_API_KEY");
    if (outputFormat === "pdf" && !cloudConvertKey) {
      return json({ error: "CLOUDCONVERT_API_KEY nicht konfiguriert" }, 500);
    }

    const { data: campaign, error: cErr } = await admin
      .from("comm_campaigns").select("*").eq("id", campaign_id).single();
    if (cErr || !campaign) return json({ error: "Campaign not found" }, 404);

    const meetingVars = meeting_id ? await loadMeetingVars(admin, meeting_id) : {};

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
        doc.render({ ...r.vars, ...meetingVars });
        const docxBuf: Uint8Array = doc.getZip().generate({ type: "uint8array" });

        const baseName = sanitize(r.display_name) || `empfaenger_${i + 1}`;
        const unitPrefix = unitPrefixFromVars(r.vars || {});
        const prefix = `${unitPrefix || `${String(i + 1).padStart(3, "0")}_`}${baseName}`;

        let outBuf: Uint8Array = docxBuf;
        let ext = "docx";
        if (outputFormat === "pdf") {
          outBuf = await convertDocxToPdf(docxBuf, `${prefix}.docx`, cloudConvertKey!);
          ext = "pdf";
        }
        const fileName = `${prefix}.${ext}`;
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
    const formatSuffix = outputFormat === "pdf" ? "_PDF" : "";
    const zipFileName = `Serienbrief_${(campaign.name || "Kampagne").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 60)}${formatSuffix}_${new Date().toISOString().slice(0, 10)}.zip`;
    const zipPath = `campaigns/${campaign_id}/${zipFileName}`;
    const { error: upErr } = await admin.storage.from("comm-assets").upload(zipPath, zipBytes, {
      contentType: "application/zip",
      upsert: true,
    });
    if (upErr) {
      await admin.from("comm_campaigns").update({ status: "failed", error_message: upErr.message }).eq("id", campaign_id);
      return json({ error: upErr.message }, 500);
    }

    // ===== Auto-file the ZIP into the building DMS (Serienbriefe category) =====
    let dmsFileId: string | null = null;
    try {
      // 1. Find or create a "Serienbriefe" category for this building
      const { data: building } = await admin
        .from("buildings").select("management_mode").eq("id", campaign.building_id).maybeSingle();
      const mode = building?.management_mode || "weg";

      // Ensure DMS soll-structure exists, then look up "Schriftverkehr / Serienbriefe" by slug
      await admin.rpc("ensure_stammakte_categories", { p_building_id: campaign.building_id });
      const { data: cat } = await admin
        .from("building_file_categories")
        .select("id")
        .eq("building_id", campaign.building_id)
        .eq("slug", "schriftverkehr-serienbriefe")
        .maybeSingle();

      // 2. Copy ZIP from comm-assets to building-files bucket
      const dmsPath = `serienbriefe/${campaign.building_id}/${campaign_id}/${zipFileName}`;
      const { error: dmsUpErr } = await admin.storage
        .from("building-files")
        .upload(dmsPath, zipBytes, { contentType: "application/zip", upsert: true });
      if (dmsUpErr) throw dmsUpErr;

      // 3. Insert into building_files
      const { data: bf, error: bfErr } = await admin
        .from("building_files")
        .insert({
          building_id: campaign.building_id,
          category_id: cat?.id || null,
          display_name: zipFileName,
          description: `Automatisch erstellt aus Serienbrief-Kampagne "${campaign.name || campaign_id}" – ${okCount} Empfänger.`,
          file_path: dmsPath,
          file_size: zipBytes.length,
          mime_type: "application/zip",
          management_mode: mode,
          source: "manual",
          uploaded_by: campaign.created_by,
          rag_enabled: false,
          visibility_role: "intern",
          visible_to_users: false,
          tags: ["serienbrief", "kampagne"],
        })
        .select("id")
        .single();
      if (bfErr) throw bfErr;
      dmsFileId = bf?.id || null;
      console.log(`Auto-filed letter campaign ${campaign_id} ZIP into DMS as ${dmsFileId}`);
    } catch (filingError) {
      console.error("DMS auto-filing error (non-fatal):", filingError);
    }

    await admin.from("comm_campaigns").update({
      status: "done",
      result_zip_path: zipPath,
      recipient_count: recipients.length,
      sent_count: okCount,
      failed_count: failCount,
      completed_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return json({ success: true, recipient_count: recipients.length, ok: okCount, failed: failCount, zip_path: zipPath, dms_file_id: dmsFileId });
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
