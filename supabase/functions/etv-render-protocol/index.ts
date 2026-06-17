// etv-render-protocol
// Rendert ein ETV-Protokoll aus Word-Vorlage + Versammlungsdaten.
// Liefert je nach output_format DOCX oder PDF (via CloudConvert).
// Speichert die Datei in building-files unter _etv-protocol-renders/{meeting_id}/.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function appendSignaturePage(
  pdfBytes: Uint8Array,
  signatures: any[],
  meetingTitle: string,
  buildingName: string,
  meetingDateStr: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  page.drawText("Unterschriften", { x: margin, y, size: 18, font: fontBold, color: rgb(0.1, 0.25, 0.5) });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.1, 0.25, 0.5) });
  y -= 30;
  page.drawText(`Protokoll: ${meetingTitle}`, { x: margin, y, size: 11, font });
  y -= 16;
  page.drawText(`Liegenschaft: ${buildingName}`, { x: margin, y, size: 11, font });
  y -= 16;
  page.drawText(`Datum der Versammlung: ${meetingDateStr}`, { x: margin, y, size: 11, font });
  y -= 40;

  const roleLabels: Record<string, string> = {
    leiter: "Versammlungsleiter",
    protokollant: "Protokollführer",
    eigentuemer: "Eigentümer",
  };

  for (const role of ["leiter", "protokollant", "eigentuemer"] as const) {
    const sig = signatures.find((s: any) => s.role === role);
    page.drawText(roleLabels[role], { x: margin, y, size: 12, font: fontBold });
    y -= 18;
    if (sig) {
      try {
        const pngBytes = dataUrlToBytes(sig.signature_png);
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const sigW = 200;
        const ratio = pngImage.height / pngImage.width;
        const sigH = Math.min(80, sigW * ratio);
        page.drawImage(pngImage, { x: margin, y: y - sigH, width: sigW, height: sigH });
        y -= sigH + 6;
      } catch (e) {
        console.error("Signatur-PNG konnte nicht eingebettet werden", e);
      }
      page.drawLine({ start: { x: margin, y }, end: { x: margin + 260, y }, thickness: 0.7, color: rgb(0.3, 0.3, 0.3) });
      y -= 14;
      const signedAt = sig.signed_at ? new Date(sig.signed_at).toLocaleString("de-DE") : "";
      page.drawText(`${sig.signer_name}${signedAt ? " — " + signedAt : ""}`, {
        x: margin, y, size: 9, font, color: rgb(0.3, 0.3, 0.3),
      });
    } else {
      y -= 50;
      page.drawLine({ start: { x: margin, y }, end: { x: margin + 260, y }, thickness: 0.7, color: rgb(0.6, 0.6, 0.6) });
      y -= 14;
      page.drawText("(noch nicht unterschrieben)", { x: margin, y, size: 9, font, color: rgb(0.6, 0.6, 0.6) });
    }
    y -= 50;
  }

  return await pdfDoc.save();
}

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
function fmtMea(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
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

function buildErgebnisSatz(ja: number, nein: number, enth: number, result?: string | null): string {
  const total = ja + nein + enth;
  if (total === 0) return "Es wurde nicht abgestimmt.";
  const angenommen = (result === "passed") || (result == null && ja > nein);
  if (!angenommen) return "Der Beschluss wurde abgelehnt.";
  if (nein === 0 && enth === 0) return "Der Beschluss wurde einstimmig angenommen und verkündet.";
  if (nein === 0) return "Der Beschluss wurde mehrheitlich (bei Enthaltungen) angenommen und verkündet.";
  return "Der Beschluss wurde mehrheitlich angenommen und verkündet.";
}

function buildAbstimmungsMethode(principle?: string | null): string {
  if (principle === "headcount") return "Die Abstimmung erfolgte nach Köpfen.";
  if (principle === "double_qualified") return "Die Abstimmung erfolgte nach doppelt qualifizierter Mehrheit.";
  return "Die Abstimmung erfolgte nach Anteilen (MEA).";
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

    const { meeting_id, template_id, output_format = "pdf", inspect = false } = await req.json();
    if (!inspect && !meeting_id) return json({ error: "meeting_id erforderlich" }, 400);
    if (!["docx", "pdf"].includes(output_format)) return json({ error: "output_format docx|pdf" }, 400);

    if (inspect) {
      let tpl2: any = null;
      if (template_id) {
        const { data } = await admin.from("etv_protocol_templates").select("*").eq("id", template_id).maybeSingle();
        tpl2 = data;
      }
      if (!tpl2) {
        const { data } = await admin.from("etv_protocol_templates").select("*").eq("is_default", true).maybeSingle();
        tpl2 = data;
      }
      const { data: f } = await admin.storage.from("building-files").download(tpl2.storage_path);
      const z = new PizZip(new Uint8Array(await f!.arrayBuffer()));
      const xml = z.file("word/document.xml")!.asText();
      const stripped = xml.replace(/<[^>]+>/g, "");
      const placeholders = Array.from(new Set([...stripped.matchAll(/\{([^{}]+)\}/g)].map(m => m[1])));
      return json({ placeholders, raw_xml: xml.slice(0, 6000) });
    }

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
      .select(`*, contact_building_assignments(unit_number, contacts(first_name, last_name, company_name), contact_building_shares(share_type, share_value))`)
      .eq("meeting_id", meeting_id);

    const getMea = (a: any) => {
      const shares = a.contact_building_assignments?.contact_building_shares || [];
      const mea = shares.find((s: any) => s.share_type === "mea");
      return Number(mea?.share_value || 0);
    };
    const getName = (a: any) => {
      const c = a.contact_building_assignments?.contacts;
      if (!c) return "Unbekannt";
      return c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
    };
    const getUnit = (a: any) => a.contact_building_assignments?.unit_number || "";

    const present = attendees.filter((a: any) => a.attendance_type === "present");
    const proxied = attendees.filter((a: any) => a.attendance_type === "proxy");
    const absent = attendees.filter((a: any) => a.attendance_type === "absent");
    const totalMea = attendees.reduce((s: number, a: any) => s + getMea(a), 0);
    const presentMea = [...present, ...proxied].reduce((s: number, a: any) => s + getMea(a), 0);
    const anwesendProzent = totalMea > 0 ? ((presentMea / totalMea) * 100) : 0;

    // Anwesenheits-Satz (orientiert am echten RGI-Protokoll, "Tausendstel"-Sprache wenn ~1000)
    const meaUnit = totalMea > 950 && totalMea < 1050 ? "Tausendstel" : "MEA";
    const anwesenheitText =
      `Von insgesamt ${fmtMea(totalMea)} ${meaUnit} waren ${fmtMea(presentMea)} ${meaUnit} anwesend.` +
      (Math.abs(presentMea - totalMea) < 0.001 && totalMea > 0
        ? ` Es waren alle ${meaUnit} anwesend.`
        : "");

    // Stimmen pro TOP laden, um MEA-Summen zuverlässig (auch für Altdaten) zu berechnen
    const itemIds = (agendaItems || []).map((it: any) => it.id);
    let votesByItem: Record<string, any[]> = {};
    if (itemIds.length) {
      const { data: allVotes = [] } = await admin
        .from("etv_votes")
        .select("agenda_item_id, vote, mea_weight")
        .in("agenda_item_id", itemIds);
      for (const v of allVotes as any[]) {
        (votesByItem[v.agenda_item_id] ||= []).push(v);
      }
    }

    // TOPs aufbereiten
    const tops = (agendaItems || []).map((it: any, idx: number) => {
      const koepfeJa = Number(it.yes_count ?? 0);
      const koepfeNein = Number(it.no_count ?? 0);
      const koepfeEnth = Number(it.abstain_count ?? 0);
      const itemVotes = votesByItem[it.id] || [];
      const sumMea = (filter: string) => itemVotes
        .filter((v: any) => v.vote === filter)
        .reduce((s: number, v: any) => s + (Number(v.mea_weight) || 0), 0);
      const meaJa = Number(it.total_mea_yes ?? sumMea("yes"));
      const meaNein = Number(it.total_mea_no ?? sumMea("no"));
      const meaEnth = Number(it.total_mea_abstain ?? sumMea("abstain"));
      const meaGesamt = meaJa + meaNein + meaEnth;
      const isMea = it.voting_principle === "mea";
      // Primäre Ergebniswerte (MEA für mea-Prinzip, sonst Köpfe)
      const ja = isMea ? fmtMea(meaJa) : String(koepfeJa);
      const nein = isMea ? fmtMea(meaNein) : String(koepfeNein);
      const enthaltung = isMea ? fmtMea(meaEnth) : String(koepfeEnth);
      const hatBeschluss = !!(it.resolution_text && it.resolution_text.trim().length > 0);
      const hatNotizen = !!(it.admin_notes && it.admin_notes.trim().length > 0);
      return {
        nummer: String(idx + 1),
        titel: it.title || "",
        text: it.description || "",
        kategorie: it.category || "",
        status: it.status || "",
        hat_beschluss: hatBeschluss,
        beschluss_text: it.resolution_text || "",
        abstimmung_methode: buildAbstimmungsMethode(it.voting_principle),
        ja, nein, enthaltung,
        ja_koepfe: String(koepfeJa),
        nein_koepfe: String(koepfeNein),
        enth_koepfe: String(koepfeEnth),
        ja_mea: fmtMea(meaJa),
        nein_mea: fmtMea(meaNein),
        enth_mea: fmtMea(meaEnth),
        gesamt_mea: fmtMea(meaGesamt),
        ergebnis_satz: buildErgebnisSatz(koepfeJa, koepfeNein, koepfeEnth, it.result),
        hat_notizen: hatNotizen,
        notizen: it.admin_notes || "",
      };
    });

    // Anwesenheits-Listen (Mehrzeiler)
    const presentList = present.map((a: any) => `${getName(a)} (Einheit ${getUnit(a)}, ${fmtMea(getMea(a))} ${meaUnit})`).join("\n");
    const proxiedList = proxied.map((a: any) => `${getName(a)} (Einheit ${getUnit(a)}, vertreten durch Vollmacht)`).join("\n");
    const absentList = absent.map((a: any) => `${getName(a)} (Einheit ${getUnit(a)})`).join("\n");

    const building = meeting.buildings as any;
    const ortDatumStadt = (building?.address || "").split(",").pop()?.trim()?.replace(/^\d{4,5}\s*/, "") || "";
    const meetingDateStr = fmtDate(meeting.meeting_date);
    const isQuorate = (present.length + proxied.length) >= 1;

    const payload = {
      weg: {
        name: building?.name || "",
        adresse: building?.address || "",
        verwalter: building?.manager_name || "",
        anzahl_einheiten: String(building?.unit_count ?? ""),
      },
      gebaeude: {
        name: building?.name || "",
        adresse: building?.address || "",
      },
      versammlung: {
        titel: meeting.title || "",
        datum: meetingDateStr,
        ort: meeting.location || "",
        beginn: fmtTime(meeting.meeting_date),
        ende: meeting.ended_at ? fmtTime(meeting.ended_at) : "",
        leitung: meeting.meeting_chair || "",
        protokollfuehrer: meeting.minutes_taker || "",
        anwesenheit_text: anwesenheitText,
        anzahl_anwesend: String(present.length),
        anzahl_vertreten: String(proxied.length),
        anzahl_abwesend: String(absent.length),
        anzahl_stimmberechtigt: String(present.length + proxied.length),
        gesamt_mea: fmtMea(totalMea),
        anwesende_mea: fmtMea(presentMea),
        anwesenheit_prozent: anwesendProzent.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        beschlussfaehig: isQuorate ? "Ja" : "Nein",
        beschlussfaehigkeit_satz: isQuorate
          ? `Die Versammlung ist beschlussfähig (${present.length + proxied.length} Eigentümer mit ${fmtMea(presentMea)} ${meaUnit} von ${fmtMea(totalMea)} ${meaUnit}).`
          : "Die Versammlung ist nicht beschlussfähig.",
        anwesende_liste: presentList,
        vertretene_liste: proxiedList,
        abwesende_liste: absentList,
      },
      tops,
      anzahl_tops: String(tops.length),
      schlusssatz: "Die Verwaltung bedankt sich bei den anwesenden Eigentümern für ihr Erscheinen und beendet die Versammlung.",
      ort_datum: ortDatumStadt ? `${ortDatumStadt}, ${meetingDateStr}` : meetingDateStr,
    };

    // Template laden & rendern
    const { data: tplFile, error: tErr } = await admin.storage.from("building-files").download(tpl.storage_path);
    if (tErr || !tplFile) return json({ error: tErr?.message || "Vorlage nicht ladbar" }, 500);

    // Flatten payload to support both nested and dotted keys (docxtemplater nested resolution unreliable on Deno)
    const flatPayload: Record<string, any> = { ...payload };
    const flatten = (obj: any, prefix = "") => {
      for (const k of Object.keys(obj || {})) {
        const v = obj[k];
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          flatten(v, key);
        } else {
          flatPayload[key] = v;
        }
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

    const baseName = `Protokoll_${sanitize(building?.name || "ETV")}_${sanitize(meetingDateStr)}`;
    const outExt = output_format === "pdf" ? "pdf" : "docx";
    const outPath = `_etv-protocol-renders/${meeting_id}/${baseName}_${Date.now()}.${outExt}`;

    let outBytes = docxBytes;
    let contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (output_format === "pdf") {
      outBytes = await convertDocxToPdf(docxBytes, `${baseName}.docx`);
      contentType = "application/pdf";

      // Unterschriften anhängen, sofern vorhanden
      try {
        const { data: sigs = [] } = await admin
          .from("etv_protocol_signatures")
          .select("role, signer_name, signature_png, signed_at")
          .eq("meeting_id", meeting_id);
        if (sigs && sigs.length > 0) {
          outBytes = await appendSignaturePage(
            outBytes,
            sigs,
            meeting.title || "",
            building?.name || "",
            meetingDateStr,
          );
        }
      } catch (sigErr) {
        console.error("Signaturseite konnte nicht angehängt werden (nicht-fatal):", sigErr);
      }
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
