// etv-render-protocol
// Rendert ein ETV-Protokoll aus Word-Vorlage + Versammlungsdaten.
// Liefert je nach output_format DOCX oder PDF (via CloudConvert).
// Speichert die Datei in building-files unter _etv-protocol-renders/{meeting_id}/.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtDate(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("de-DE");
}
function fmtTime(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
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

    const { meeting_id, template_id, output_format = "pdf" } = await req.json();
    if (!meeting_id) return json({ error: "meeting_id erforderlich" }, 400);
    if (!["docx", "pdf"].includes(output_format)) return json({ error: "output_format docx|pdf" }, 400);

    // Vorlage laden (gewählt oder Standard)
    let tpl: any = null;
    if (template_id) {
      const { data } = await admin.from("etv_protocol_templates").select("*").eq("id", template_id).maybeSingle();
      tpl = data;
    }
    if (!tpl) {
      const { data } = await admin.from("etv_protocol_templates").select("*").eq("is_default", true).maybeSingle();
      tpl = data;
    }
    if (!tpl) return json({ error: "Keine Protokoll-Vorlage gefunden. Bitte zuerst eine Vorlage hochladen und als Standard markieren." }, 400);

    // Daten laden
    const { data: meeting, error: mErr } = await admin
      .from("etv_meetings")
      .select("*, buildings(name, address, manager_name, unit_count)")
      .eq("id", meeting_id)
      .single();
    if (mErr || !meeting) return json({ error: mErr?.message || "Versammlung nicht gefunden" }, 404);

    const { data: agendaItems = [] } = await admin
      .from("etv_agenda_items").select("*").eq("meeting_id", meeting_id).order("sort_order");

    const { data: attendees = [] } = await admin
      .from("etv_attendees")
      .select(`*, contact_building_assignments!inner(unit_number, contacts!inner(first_name, last_name, company_name), contact_building_shares(share_type, share_value))`)
      .eq("meeting_id", meeting_id);

    const { data: signatures = [] } = await admin
      .from("etv_protocol_signatures").select("*").eq("meeting_id", meeting_id).order("signed_at");

    const building = meeting.buildings as any;
    const getName = (a: any) => {
      const c = a.contact_building_assignments?.contacts;
      if (!c) return "Unbekannt";
      return c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
    };
    const getUnit = (a: any) => a.contact_building_assignments?.unit_number || "";
    const getMea = (a: any) => {
      const shares = a.contact_building_assignments?.contact_building_shares || [];
      const mea = shares.find((s: any) => s.share_type === "mea");
      return Number(mea?.share_value || 0);
    };

    const present = attendees.filter((a: any) => a.attendance_type === "present");
    const proxied = attendees.filter((a: any) => a.attendance_type === "proxy");
    const totalMea = attendees.reduce((s: number, a: any) => s + getMea(a), 0);
    const presentMea = [...present, ...proxied].reduce((s: number, a: any) => s + getMea(a), 0);
    const anwesendCount = present.length + proxied.length;

    const anwesendeRows = [...present, ...proxied].map((a: any) => ({
      name: getName(a),
      einheit: getUnit(a),
      mea: getMea(a).toFixed(4),
      anwesenheit_typ: a.attendance_type === "present" ? "persönlich" : "Vollmacht",
    }));

    const topsRows = (agendaItems || []).map((it: any, idx: number) => ({
      nummer: String(idx + 1),
      titel: it.title || "",
      beschreibung: it.description || "",
      diskussion: it.admin_notes || "",
      beschlusstext: it.resolution_text || "",
      ergebnis: it.result === "passed" ? "ANGENOMMEN" : it.result === "failed" ? "ABGELEHNT" : "—",
      ja_stimmen: String(it.yes_count ?? 0),
      nein_stimmen: String(it.no_count ?? 0),
      enthaltungen: String(it.abstain_count ?? 0),
      mehrheit_typ:
        it.voting_principle === "mea" ? "MEA"
        : it.voting_principle === "headcount" ? "Kopf"
        : it.voting_principle === "double_qualified" ? "Doppelt qualifiziert"
        : (it.voting_principle || ""),
      angenommen: it.result === "passed" ? "Ja" : "Nein",
    }));

    const beschluesseRows = topsRows.filter((t) => t.beschlusstext).map((t) => ({
      nummer: t.nummer,
      text: t.beschlusstext,
      ergebnis: t.ergebnis,
    }));

    const sigText = (role: string) => {
      const s = signatures.find((x: any) => x.role === role);
      if (!s) return "";
      return `${s.signer_name}  (unterschrieben am ${fmtDate(s.signed_at)})`;
    };

    const payload = {
      versammlung: {
        titel: meeting.title || "",
        datum: fmtDate(meeting.meeting_date),
        uhrzeit_beginn: fmtTime(meeting.meeting_date),
        uhrzeit_ende: "",
        ort: meeting.location || "",
        art: meeting.title?.toLowerCase().includes("außer") ? "außerordentlich" : "ordentlich",
        beschlussfaehig: meeting.quorum_reached ? "Ja" : (anwesendCount >= 1 ? "Ja" : "Nein"),
      },
      liegenschaft: {
        name: building?.name || "",
        adresse: building?.address || "",
        plz: "",
        ort: "",
      },
      verwaltung: {
        name: building?.manager_name || "RGI Immobilien GmbH & Co. KG",
        adresse: "",
        telefon: "08363 960656",
        email: "info@rgi-immobilien.de",
      },
      versammlungsleiter: { name: meeting.meeting_chair || "" },
      protokollfuehrer: { name: meeting.minutes_taker || "" },
      stimmzaehler: { name: "" },
      anwesenheit: {
        anzahl_anwesend: String(present.length),
        anzahl_vertreten: String(proxied.length),
        anzahl_gesamt: String(attendees.length),
        mea_anwesend: presentMea.toFixed(4),
        mea_gesamt: totalMea.toFixed(4),
        quote_prozent: totalMea > 0 ? ((presentMea / totalMea) * 100).toFixed(1) : "0",
      },
      anwesende: anwesendeRows,
      tops: topsRows,
      beschluesse: beschluesseRows,
      einleitung: "",
      abschluss: "",
      ki_protokoll_volltext: meeting.protocol_text || "",
      erstellt_am: new Date().toLocaleDateString("de-DE"),
      naechster_termin: "",
      signature_leiter: sigText("leiter"),
      signature_protokollant: sigText("protokollant"),
      signature_eigentuemer: sigText("eigentuemer"),
    };

    // Template laden
    const { data: tplFile, error: tErr } = await admin.storage.from("building-files").download(tpl.storage_path);
    if (tErr || !tplFile) return json({ error: tErr?.message || "Vorlage nicht ladbar" }, 500);

    const zip = new PizZip(new Uint8Array(await tplFile.arrayBuffer()));
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });
    doc.render(payload);
    const docxBytes = doc.getZip().generate({ type: "uint8array" });

    const baseName = `Protokoll_${sanitize(meeting.title || "ETV")}_${sanitize(building?.name || "")}`;
    const outExt = output_format === "pdf" ? "pdf" : "docx";
    const outPath = `_etv-protocol-renders/${meeting_id}/${baseName}_${Date.now()}.${outExt}`;

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

    const { data: render } = await admin.from("etv_protocol_renders").insert({
      meeting_id,
      template_id: tpl.id,
      format: output_format,
      storage_path: outPath,
    }).select("id").single();

    const { data: signed } = await admin.storage.from("building-files").createSignedUrl(outPath, 60 * 60);

    return json({ ok: true, render_id: render?.id, storage_path: outPath, signed_url: signed?.signedUrl });
  } catch (e: any) {
    console.error("etv-render-protocol error", e);
    const tplErrors = e?.properties?.errors;
    if (Array.isArray(tplErrors) && tplErrors.length) {
      return json({
        error: "DOCX-Vorlage enthält ungültige Platzhalter",
        details: tplErrors.map((te: any) => ({
          message: te?.message,
          explanation: te?.properties?.explanation,
          tag: te?.properties?.xtag,
        })),
      }, 422);
    }
    return json({ error: String(e?.message || e) }, 500);
  }
});
