// etv-render-report
// Rendert den "Bericht der Verwaltung" eines TOPs aus einer Word-Vorlage.
// Liefert DOCX oder PDF (PDF via CloudConvert) und legt die Datei unter
// building-files/_etv-report-renders/{meeting_id}/ ab.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TZ = "Europe/Berlin";
function fmtDate(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("de-DE", { timeZone: TZ });
}
function fmtTime(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
function sanitize(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function convertDocxToPdf(docxBytes: Uint8Array, filename: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get("CLOUDCONVERT_API_KEY");
  if (!apiKey) throw new Error("CLOUDCONVERT_API_KEY ist nicht konfiguriert");
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < docxBytes.length; i += chunk) {
    bin += String.fromCharCode(...docxBytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const jobResp = await fetch("https://api.cloudconvert.com/v2/jobs", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: {
        "import-1": { operation: "import/base64", file: b64, filename },
        "convert-1": { operation: "convert", input: "import-1", output_format: "pdf", engine: "libreoffice" },
        "export-1": { operation: "export/url", input: "convert-1" },
      },
    }),
  });
  if (!jobResp.ok) throw new Error(`CloudConvert Job: ${jobResp.status} ${await jobResp.text()}`);
  const jobJson = await jobResp.json();
  const jobId = jobJson?.data?.id;
  if (!jobId) throw new Error("CloudConvert: keine Job-ID");
  const waitResp = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!waitResp.ok) throw new Error(`CloudConvert Wait: ${waitResp.status} ${await waitResp.text()}`);
  const waitJson = await waitResp.json();
  if (waitJson?.data?.status !== "finished") {
    throw new Error(`CloudConvert nicht erfolgreich: ${waitJson?.data?.status}`);
  }
  const exportTask = (waitJson.data.tasks || []).find((t: any) => t.name === "export-1");
  const url = exportTask?.result?.files?.[0]?.url;
  if (!url) throw new Error("CloudConvert: keine URL");
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`PDF-Download: ${dl.status}`);
  return new Uint8Array(await dl.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { agenda_item_id, template_id, output_format = "pdf", inspect = false } = body ?? {};
    if (!["docx", "pdf"].includes(output_format)) return json({ error: "output_format docx|pdf" }, 400);
    if (!inspect && !agenda_item_id) return json({ error: "agenda_item_id erforderlich" }, 400);

    // Vorlage laden (gewählt oder Standard)
    let tpl: any = null;
    if (template_id) {
      const { data } = await admin.from("etv_report_templates").select("*").eq("id", template_id).maybeSingle();
      tpl = data;
    }
    if (!tpl) {
      const { data } = await admin.from("etv_report_templates").select("*").eq("is_default", true).maybeSingle();
      tpl = data;
    }
    if (!tpl) return json({ error: "Keine Bericht-Vorlage gefunden. Bitte zuerst eine Vorlage hochladen und als Standard markieren." }, 400);

    if (inspect) {
      const { data: f } = await admin.storage.from("building-files").download(tpl.storage_path);
      const z = new PizZip(new Uint8Array(await f!.arrayBuffer()));
      const xml = z.file("word/document.xml")!.asText();
      const stripped = xml.replace(/<[^>]+>/g, "");
      const placeholders = Array.from(new Set([...stripped.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1])));
      return json({ placeholders });
    }

    const { data: item, error: iErr } = await admin
      .from("etv_agenda_items")
      .select("id, meeting_id, title, sort_order, report_sections")
      .eq("id", agenda_item_id)
      .single();
    if (iErr || !item) return json({ error: iErr?.message || "TOP nicht gefunden" }, 404);

    const { data: meeting, error: mErr } = await admin
      .from("etv_meetings")
      .select("*, buildings(name, address, postal_code, city, manager_name, unit_count)")
      .eq("id", item.meeting_id)
      .single();
    if (mErr || !meeting) return json({ error: mErr?.message || "Versammlung nicht gefunden" }, 404);

    const building: any = (meeting as any).buildings;
    const meetingDateStr = fmtDate(meeting.meeting_date);
    const gebAdresse = [building?.address, [building?.postal_code, building?.city].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
    const sections = (item.report_sections ?? {}) as Record<string, string>;

    const payload: Record<string, any> = {
      weg: {
        name: building?.name || "",
        adresse: gebAdresse,
        verwalter: building?.manager_name || "",
        anzahl_einheiten: String(building?.unit_count ?? ""),
      },
      gebaeude: { name: building?.name || "", adresse: gebAdresse },
      versammlung: {
        titel: meeting.title || "",
        datum: meetingDateStr,
        ort: meeting.location || "",
        beginn: fmtTime(meeting.start_time ?? meeting.started_at),
        leitung: meeting.chairperson || meeting.leader_name || "",
      },
      top: { nummer: String((item.sort_order ?? 0) + 1), titel: item.title || "" },
      bericht: {
        sachstand: sections.sachstand || "",
        instandhaltung: sections.instandhaltung || "",
        vermoegen: sections.vermoegen || "",
        sonstiges: sections.sonstiges || "",
      },
      ort_datum: building?.city ? `${building.city}, ${fmtDate(new Date().toISOString())}` : fmtDate(new Date().toISOString()),
    };

    const { data: tplFile, error: tErr } = await admin.storage.from("building-files").download(tpl.storage_path);
    if (tErr || !tplFile) return json({ error: tErr?.message || "Vorlage nicht ladbar" }, 500);

    // Flatten (dotted keys) für zuverlässiges Rendering in Deno
    const flatPayload: Record<string, any> = { ...payload };
    const flatten = (obj: any, prefix = "") => {
      for (const k of Object.keys(obj || {})) {
        const v = obj[k];
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key);
        else flatPayload[key] = v;
      }
    };
    flatten(payload);

    const zip = new PizZip(new Uint8Array(await tplFile.arrayBuffer()));
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });
    doc.render(flatPayload);
    const docxBytes = doc.getZip().generate({ type: "uint8array" });

    const baseName = `Verwaltungsbericht_${sanitize(building?.name || "ETV")}_${sanitize(meetingDateStr)}`;
    const outExt = output_format === "pdf" ? "pdf" : "docx";
    const outPath = `_etv-report-renders/${item.meeting_id}/${baseName}_${Date.now()}.${outExt}`;

    let outBytes = docxBytes;
    let contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (output_format === "pdf") {
      outBytes = await convertDocxToPdf(docxBytes, `${baseName}.docx`);
      contentType = "application/pdf";
    }

    const { error: upErr } = await admin.storage.from("building-files").upload(outPath, outBytes, {
      contentType, upsert: true,
    });
    if (upErr) return json({ error: upErr.message }, 500);

    const { data: render } = await admin.from("etv_report_renders").insert({
      meeting_id: item.meeting_id,
      agenda_item_id: item.id,
      template_id: tpl.id,
      format: output_format,
      storage_path: outPath,
    }).select("id").single();

    const { data: signed } = await admin.storage.from("building-files").createSignedUrl(outPath, 60 * 60);
    return json({ ok: true, render_id: render?.id, storage_path: outPath, signed_url: signed?.signedUrl, file_name: `${baseName}.${outExt}` });
  } catch (e: any) {
    console.error("etv-render-report Fehler:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
