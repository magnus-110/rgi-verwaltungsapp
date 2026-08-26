// rgi-render-offer
// Rendert aus einem Angebot (offers + offer_items) einen Verwaltervertrags-
// Entwurf aus der Word-Vorlage, konvertiert ihn via CloudConvert nach PDF
// und legt beide Dateien im bestehenden Bucket 'invoices' unter dem
// Praefix 'offers/' ab.
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
function fmtNumber(n: number | string | null | undefined, max = 4): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return (v || 0).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: max });
}
function sanitize(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

function withDotAliases<T extends Record<string, any>>(source: T): T {
  const out: Record<string, any> = { ...source };
  for (const [group, value] of Object.entries(source)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [key, nestedValue] of Object.entries(value)) {
      out[`${group}.${key}`] = nestedValue;
    }
  }
  return out as T;
}

// --- Hilfsfunktionen fuer den Vertragsentwurf -------------------------------
// Die Vertragsvorlage fuehrt die Betraege in Spalten bzw. Saetzen, die die
// Einheit ('EUR netto', '%') schon selbst beschriften. Deshalb wird hier
// bewusst ohne Euro-Zeichen formatiert und nicht fmtMoney verwendet.

/** Wandelt einen DB-Wert in eine Zahl. Leere Werte ergeben null, nicht 0. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Betrag deutsch mit zwei Dezimalstellen, ohne Waehrung. Leer bleibt leer. */
function dec(v: unknown): string {
  const n = toNum(v);
  if (n === null) return "";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Betrag mit nachgestelltem 'EUR', z.B. '250,00 EUR'. Leer bleibt leer. */
function euro(v: unknown): string {
  const s = dec(v);
  return s ? `${s} EUR` : "";
}

/** Prozentsatz ohne Prozentzeichen, z.B. '5' oder '5,5'. Leer bleibt leer. */
function pct(v: unknown): string {
  const n = toNum(v);
  if (n === null) return "";
  return fmtNumber(n, 2);
}

/** Prozentsatz mit einer Dezimalstelle, z.B. '5,0 %'. Leer bleibt leer. */
function pct1(v: unknown): string {
  const n = toNum(v);
  if (n === null) return "";
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
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
  if (!jobResp.ok) throw new Error(`CloudConvert Job fehlgeschlagen: ${jobResp.status} ${await jobResp.text()}`);
  const jobJson = await jobResp.json();
  const jobId = jobJson?.data?.id;
  if (!jobId) throw new Error("CloudConvert: keine Job-ID");
  const waitResp = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!waitResp.ok) throw new Error(`CloudConvert Wait fehlgeschlagen: ${waitResp.status} ${await waitResp.text()}`);
  const waitJson = await waitResp.json();
  if (waitJson?.data?.status !== "finished") {
    throw new Error(`CloudConvert Job nicht erfolgreich: ${waitJson?.data?.status}`);
  }
  const exportTask = (waitJson.data.tasks || []).find((t: any) => t.name === "export-1");
  const url = exportTask?.result?.files?.[0]?.url;
  if (!url) throw new Error("CloudConvert: keine Download-URL");
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`PDF-Download fehlgeschlagen: ${dl.status}`);
  return new Uint8Array(await dl.arrayBuffer());
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { offer_id } = body;
    const formats: ("docx" | "pdf")[] = Array.isArray(body?.formats) && body.formats.length
      ? body.formats.filter((f: any) => f === "docx" || f === "pdf")
      : ["docx", "pdf"];
    if (!offer_id) return json({ error: "offer_id erforderlich" }, 400);

    const { data: offer, error: offErr } = await admin
      .from("offers")
      .select("*, template:rgi_invoice_templates(*), items:offer_items(*)")
      .eq("id", offer_id)
      .maybeSingle();
    if (offErr || !offer) return json({ error: offErr?.message || "Angebot nicht gefunden" }, 404);

    const { data: company } = await admin.from("rgi_company_settings").select("*").limit(1).maybeSingle();

    // Vorlage bestimmen: erst die am Angebot hinterlegte, sonst die
    // Standard-Vertragsvorlage, sonst die neueste Vertragsvorlage.
    let templatePath: string | null = offer.template?.storage_path || null;
    if (!templatePath) {
      const { data: defaultTpl } = await admin
        .from("rgi_invoice_templates")
        .select("storage_path")
        .eq("template_kind", "contract")
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      templatePath = defaultTpl?.storage_path || null;
    }
    if (!templatePath) {
      const { data: latestTpl } = await admin
        .from("rgi_invoice_templates")
        .select("storage_path")
        .eq("template_kind", "contract")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      templatePath = latestTpl?.storage_path || null;
    }
    if (!templatePath) return json({ error: "Keine Vertragsvorlage hinterlegt" }, 400);

    const { data: tplFile, error: tplErr } = await admin.storage
      .from("rgi-invoice-templates")
      .download(templatePath);
    if (tplErr || !tplFile) {
      const msg = /not.?found|object/i.test(tplErr?.message || "")
        ? "Die Vorlagendatei wurde im Speicher nicht gefunden. Bitte die Word-Vorlage erneut hochladen."
        : (tplErr?.message || "Vorlage nicht ladbar");
      return json({ error: msg }, 404);
    }

    // Konstanten und Rubrumsangaben lassen sich je Angebot ueber
    // offers.contract_defaults unter dem gleichnamigen Schluessel
    // ueberschreiben.
    const defaults: Record<string, any> = (offer.contract_defaults && typeof offer.contract_defaults === "object")
      ? offer.contract_defaults
      : {};
    const def = (key: string, fallback = ""): string => {
      const v = defaults[key];
      return v === null || v === undefined || v === "" ? fallback : String(v);
    };

    // --- Rubrum -------------------------------------------------------------
    const objectAddress = [
      offer.object_address,
      [offer.object_zip, offer.object_city].filter(Boolean).join(" "),
    ].filter(Boolean).join(", ");
    const wegAnschrift = offer.land_register_ref || objectAddress;

    // --- Verguetungstabelle § 3 Abs. 6 --------------------------------------
    // Eine Zeile wird nur gefuellt, wenn Satz und Anzahl gesetzt sind.
    // Sonst bleiben alle drei Felder leer, damit keine '0,00'-Zeilen im
    // Vertrag stehen.
    type FeeRow = { satz: string; anzahl: string; gesamt: string; net: number };
    const feeRow = (rate: unknown, count: unknown): FeeRow => {
      const r = toNum(rate);
      const c = toNum(count);
      if (r === null || c === null || r <= 0 || c <= 0) {
        return { satz: "", anzahl: "", gesamt: "", net: 0 };
      }
      const total = Math.round(r * c * 100) / 100;
      return { satz: dec(r), anzahl: fmtNumber(c, 0), gesamt: dec(total), net: total };
    };
    const rowApartment = feeRow(offer.rate_apartment, offer.units_apartment);
    const rowCommercial = feeRow(offer.rate_commercial, offer.units_commercial);
    const rowParking = feeRow(offer.rate_parking, offer.units_parking);
    const rowOther = feeRow(offer.rate_other, offer.units_other);

    const monthlyNet = Math.round(
      (rowApartment.net + rowCommercial.net + rowParking.net + rowOther.net) * 100,
    ) / 100;
    const VAT_RATE = 19;
    const monthlyVat = Math.round(monthlyNet * VAT_RATE) / 100;
    const monthlyGross = Math.round((monthlyNet + monthlyVat) * 100) / 100;

    // --- Zusatzverguetungen aus den Angebotspositionen ----------------------
    // Nur ausgewaehlte Positionen zaehlen. Fehlt eine Position, bleibt der
    // Platzhalter ein leerer String — niemals undefined, weil docxtemplater
    // sonst abbricht.
    const items: any[] = (offer.items || []).filter((it: any) => it.is_included === true);
    const itemOf = (feeType: string): any | null =>
      items.find((it: any) => it.fee_type === feeType) || null;
    const amountOf = (feeType: string): string => euro(itemOf(feeType)?.amount);

    const insurance = itemOf("insurance_pct");
    const cert35a = itemOf("cert_35a");
    const hourly = itemOf("hourly");

    // Bau-Staffel: mehrere Positionen desselben fee_type bilden die Stufen,
    // aufsteigend nach Untergrenze. tier_from = null bedeutet 'ab null'.
    const bauTiers = items
      .filter((it: any) => it.fee_type === "construction_pct")
      .sort((a: any, b: any) => (toNum(a.tier_from) ?? 0) - (toNum(b.tier_from) ?? 0));
    const bau1 = bauTiers[0] || null;
    const bau2 = bauTiers[1] || null;
    const bau3 = bauTiers[2] || null;
    // Die zweite Stufe beginnt einen Cent ueber der Obergrenze der ersten.
    const bau2From = bau2 && toNum(bau2.tier_from) !== null
      ? dec((toNum(bau2.tier_from) as number) + 0.01)
      : "";

    const today = new Date().toISOString().slice(0, 10);

    // Der Datensatz wird bewusst mit flachen Schluesseln inklusive Punkt
    // aufgebaut, weil die Vorlage Platzhalter wie {weg.name} verwendet und
    // docxtemplater den Tag unveraendert im Datensatz sucht. withDotAliases
    // laeuft wie im Vorbild darueber, damit zusaetzlich verschachtelte
    // Gruppen aufgeloest wuerden, falls der Datensatz spaeter welche enthaelt.
    const payload: Record<string, any> = {
      // Rubrum
      "weg.name": offer.prospect_name || "",
      "weg.anschrift": wegAnschrift,
      "weg.vertreten_durch": offer.object_representative || "",
      "bestellung.teilungserklaerung_vom": def("bestellung.teilungserklaerung_vom"),
      "bestellung.beschluss_vom": def("bestellung.beschluss_vom"),
      "bestellung.beschluss_top": def("bestellung.beschluss_top"),
      "bestellung.von": fmtDate(offer.desired_start),
      "bestellung.bis": def("bestellung.bis"),

      // Verguetungstabelle § 3 Abs. 6
      "satz.wohnung": rowApartment.satz,
      "anzahl.wohnung": rowApartment.anzahl,
      "gesamt.wohnung": rowApartment.gesamt,
      "satz.teileigentum": rowCommercial.satz,
      "anzahl.teileigentum": rowCommercial.anzahl,
      "gesamt.teileigentum": rowCommercial.gesamt,
      "satz.garage": rowParking.satz,
      "anzahl.garage": rowParking.anzahl,
      "gesamt.garage": rowParking.gesamt,
      "satz.sonstige": rowOther.satz,
      "anzahl.sonstige": rowOther.anzahl,
      "gesamt.sonstige": rowOther.gesamt,
      "summe.monat_netto": dec(monthlyNet),
      "summe.mwst_satz": `${VAT_RATE} %`,
      "summe.mwst": dec(monthlyVat),
      "summe.monat_brutto": dec(monthlyGross),

      // Zusatzverguetungen § 4
      "zusatz.ao_etv": amountOf("extra_meeting"),
      "zusatz.schluessel_bearbeitung": amountOf("key"),
      "zusatz.eigentuemerwechsel": amountOf("owner_change"),
      "zusatz.versicherung_prozent": pct(insurance?.percent),
      "zusatz.versicherung_min": euro(insurance?.min_amount),
      "zusatz.paragraf35a": euro(cert35a?.amount),
      "zusatz.stundensatz": euro(hourly?.amount),

      // Baubetreuung, Staffel
      "bau.stufe1_bis": dec(bau1?.tier_to),
      "bau.stufe1_satz": pct1(bau1?.percent),
      "bau.stufe2_von": bau2From,
      "bau.stufe2_bis": dec(bau2?.tier_to),
      "bau.stufe2_satz": pct1(bau2?.percent),
      "bau.stufe3_ueber": dec(bau3?.tier_from),
      "bau.stufe3_satz": pct1(bau3?.percent),
      "bau.schwelle": dec(bau1?.threshold),
      "bau.mindestbetrag": dec(bau1?.min_amount),

      // Konstanten, je Angebot ueberschreibbar
      "laufzeit.jahre": def("laufzeit.jahre", "drei Jahren"),
      "freigabe.grenze": def("freigabe.grenze", "1.500,00"),
      "freigabe.beirat_ab": def("freigabe.beirat_ab", "750,00"),
      "zuschlag.ohne_sepa": def("zuschlag.ohne_sepa", "5,00"),
      "entnahme.werktag": def("entnahme.werktag", "3"),
      "beirat.sitzungen_inklusive": def("beirat.sitzungen_inklusive", "vier"),
      "index.basisjahr": def("index.basisjahr", "2020"),
      "ort": def("ort", "Pfronten"),
      "datum": def("datum", fmtDate(today)),
    };

    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());
    let zip: PizZip;
    try {
      zip = new PizZip(tplBuf);
    } catch (zErr: any) {
      return json({ error: `Vorlage ist keine gültige .docx-Datei: ${zErr?.message || zErr}` }, 422);
    }
    // Word's spell-/grammar-checker injects <w:proofErr/> tags inside placeholders
    // like {weg.anschrift}, splitting them across runs and breaking docxtemplater.
    // Also strip bookmark markers for the same reason.
    const SPLIT_RE = /<w:(?:proofErr|bookmarkStart|bookmarkEnd)\b[^>]*\/>/g;
    for (const name of Object.keys(zip.files)) {
      if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) {
        const f = zip.file(name);
        if (!f) continue;
        zip.file(name, f.asText().replace(SPLIT_RE, ""));
      }
    }
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });
    try {
      doc.render(withDotAliases(payload));
    } catch (rErr: any) {
      const tplErrors = rErr?.properties?.errors;
      if (Array.isArray(tplErrors) && tplErrors.length) {
        const details = tplErrors.map((te: any) => `${te?.properties?.xtag ?? "?"}: ${te?.properties?.explanation ?? te?.message}`).join(" | ");
        return json({ error: `Vorlage enthält ungültige/unbekannte Platzhalter — ${details}` }, 422);
      }
      return json({ error: `Word-Rendering fehlgeschlagen: ${rErr?.message || rErr}` }, 500);
    }
    const docxBytes = doc.getZip().generate({ type: "uint8array" });

    const baseName = `Verwaltervertrag_${sanitize(offer.prospect_name || "Angebot")}`;
    const docxPath = `offers/docx/${offer.id}/${baseName}.docx`;

    const { error: docxUploadError } = await admin.storage.from("invoices").upload(docxPath, docxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      cacheControl: "0",
      upsert: true,
    });
    if (docxUploadError) return json({ error: `DOCX-Upload fehlgeschlagen: ${docxUploadError.message}` }, 500);

    let pdfPath: string | null = null;
    let pdfError: string | null = null;
    if (formats.includes("pdf")) {
      try {
        const pdfBytes = await convertDocxToPdf(docxBytes, `${baseName}.docx`);
        pdfPath = `offers/pdf/${offer.id}/${baseName}.pdf`;
        const { error: pdfUploadError } = await admin.storage.from("invoices").upload(pdfPath, pdfBytes, {
          contentType: "application/pdf",
          cacheControl: "0",
          upsert: true,
        });
        if (pdfUploadError) throw new Error(`PDF-Upload fehlgeschlagen: ${pdfUploadError.message}`);
      } catch (pe: any) {
        console.error("PDF conversion failed", pe);
        pdfError = String(pe?.message || pe);
      }
    }

    await admin.from("offers").update({
      docx_storage_path: docxPath,
      ...(pdfPath ? { pdf_storage_path: pdfPath } : {}),
    }).eq("id", offer.id);

    return json({ ok: true, docx_path: docxPath, pdf_path: pdfPath, pdf_error: pdfError });
  } catch (e: any) {
    console.error("rgi-render-offer error", e);
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
