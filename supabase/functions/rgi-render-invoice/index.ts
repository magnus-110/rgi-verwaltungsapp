// rgi-render-invoice
// Rendert eine RGI-Rechnung aus Word-Vorlage + DB-Daten,
// konvertiert via CloudConvert nach PDF und legt beide Dateien
// in Bucket 'invoices' ab.
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
function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return (v || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
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

/**
 * Stellt die fertige Rechnung als Zahlungsposten beim Objekt ein.
 *
 * Sie landet in derselben Tabelle wie jede Eingangsrechnung, damit
 * sie im naechsten Ueberweisungslauf der WEG einfach mitlaeuft -
 * mit PDF als Beleg, Verwendungszweck und Bankverbindung.
 *
 * Nur fuer festgeschriebene Rechnungen: ein Entwurf ohne Nummer
 * hat in der Zahlungsliste nichts verloren. Beim erneuten Erzeugen
 * wird der vorhandene Posten aktualisiert, nie ein zweiter angelegt.
 */
async function pushToPayments(
  admin: any,
  invoice: any,
  company: any,
  items: any[],
  totals: { net: number; vat: number; gross: number },
  filePath: string | null,
  fileName: string | null,
): Promise<"created" | "updated" | "skipped"> {
  if (!invoice.invoice_number) return "skipped";

  // Ohne Objekt gibt es keine Zahlungsliste, in die der Posten
  // gehoert. Der Kunde kann das Objekt mitbringen.
  const buildingId = invoice.building_id || invoice.client?.building_id || null;
  if (!buildingId) return "skipped";

  const first = items[0]?.description?.trim() || "";
  const kurz = items.length > 1 ? `${first} u. a.` : first;
  const zweck = [`Re. Nr. ${invoice.invoice_number}`, kurz].filter(Boolean).join(", ").slice(0, 140);
  const isWithdrawal = invoice.paid_by_withdrawal === true;

  const row: Record<string, unknown> = {
    building_id: buildingId,
    rgi_invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    vendor_name: company?.legal_name || "RGI Immobilien",
    vendor_iban: company?.iban || null,
    invoice_date: invoice.issue_date,
    // Bei Selbstentnahme gibt es kein Zahlungsziel. Damit der Posten
    // trotzdem oben in der nach Faelligkeit sortierten Liste steht,
    // zaehlt das Rechnungsdatum.
    due_date: invoice.due_date || invoice.issue_date,
    gross_amount: Math.round(totals.gross * 100) / 100,
    net_amount: Math.round(totals.net * 100) / 100,
    vat_amount: Math.round(totals.vat * 100) / 100,
    description: kurz || `Rechnung ${invoice.invoice_number}`,
    payment_purpose: zweck,
    payment_notes: isWithdrawal ? "Selbstentnahme vom Objektkonto" : null,
    invoice_type: "standard",
    is_company_invoice: false,
    // Der Beleg kommt aus dem eigenen Haus - es gibt nichts
    // auszulesen und nichts zu pruefen.
    ocr_status: "done",
    review_status: "verified",
    line_items: items.map((it: any) => ({
      description: it.description || "",
      amount: it.lineNet,
      quantity: it.quantity,
      vat_rate: it.vatRate,
    })),
    ...(filePath ? { file_path: filePath, file_name: fileName } : {}),
  };

  const { data: existing } = await admin
    .from("invoices")
    .select("id, status")
    .eq("rgi_invoice_id", invoice.id)
    .maybeSingle();

  if (existing) {
    // Ein bereits bezahlter Posten wird nur noch um den frischen
    // Beleg ergaenzt - Betraege und Status bleiben, wie sie sind.
    const patch = existing.status === "paid"
      ? (filePath ? { file_path: filePath, file_name: fileName } : {})
      : row;
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("invoices").update(patch).eq("id", existing.id);
      if (error) throw error;
    }
    return "updated";
  }

  const { error } = await admin.from("invoices").insert({ ...row, status: "open" });
  if (error) throw error;
  return "created";
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
    const { invoice_id } = body;
    const formats: ("docx" | "pdf")[] = Array.isArray(body?.formats) && body.formats.length
      ? body.formats.filter((f: any) => f === "docx" || f === "pdf")
      : ["docx", "pdf"];
    if (!invoice_id) return json({ error: "invoice_id erforderlich" }, 400);

    const { data: invoice, error: invErr } = await admin
      .from("rgi_invoices")
      .select("*, client:rgi_clients(*), project:rgi_projects(*), template:rgi_invoice_templates(*), items:rgi_invoice_items(*)")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !invoice) return json({ error: invErr?.message || "Rechnung nicht gefunden" }, 404);
    if (!invoice.template?.storage_path) return json({ error: "Rechnung hat keine Vorlage" }, 400);

    const { data: company } = await admin.from("rgi_company_settings").select("*").limit(1).maybeSingle();
    const { data: tplFile, error: tplErr } = await admin.storage
      .from("rgi-invoice-templates")
      .download(invoice.template.storage_path);
    if (tplErr || !tplFile) {
      const msg = /not.?found|object/i.test(tplErr?.message || "")
        ? "Die Vorlagendatei wurde im Speicher nicht gefunden. Bitte die Word-Vorlage erneut hochladen."
        : (tplErr?.message || "Vorlage nicht ladbar");
      return json({ error: msg }, 404);
    }

    // Build payload
    const items = (invoice.items || [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((it: any, idx: number) => {
        const quantity = Number(it.quantity || 0);
        const unitPriceNet = Number(it.unit_price_net || 0);
        const vatRate = Number(it.vat_rate || 0);
        const lineNet = Math.round(quantity * unitPriceNet * 100) / 100;
        const lineVat = Math.round(lineNet * vatRate) / 100;
        const lineGross = Math.round((lineNet + lineVat) * 100) / 100;
        return { ...it, idx, quantity, unitPriceNet, vatRate, lineNet, lineVat, lineGross };
      });
    const vatBreakdown: Record<string, { net: number; vat: number }> = {};
    for (const it of items) {
      const k = String(it.vatRate);
      vatBreakdown[k] ??= { net: 0, vat: 0 };
      vatBreakdown[k].net += it.lineNet;
      vatBreakdown[k].vat += it.lineVat;
    }
    const totals = items.reduce((acc: any, it: any) => {
      acc.net += it.lineNet;
      acc.vat += it.lineVat;
      acc.gross += it.lineGross;
      return acc;
    }, { net: 0, vat: 0, gross: 0 });
    const invoiceNumber = invoice.invoice_number || "ENTWURF";
    const issueDate = fmtDate(invoice.issue_date);
    const dueDate = fmtDate(invoice.due_date);
    const servicePeriod = invoice.service_period_from || invoice.service_period_to
      ? `${fmtDate(invoice.service_period_from)} – ${fmtDate(invoice.service_period_to)}`
      : "";
    const clientName = invoice.client_name_snapshot || invoice.client?.name || "";
    const clientAddress = invoice.client_address_snapshot || [invoice.client?.address_line1, [invoice.client?.zip, invoice.client?.city].filter(Boolean).join(" "), invoice.client?.country].filter(Boolean).join(", ");
    // Selbstentnahme vom Objektkonto statt Ueberweisung. Die Word-
    // Vorlage schaltet darueber den Zahlungsblock um: {#entnahme}
    // druckt den Entnahmehinweis, {^entnahme} die Bankverbindung.
    // Ein Zahlungsziel gibt es bei Entnahme nicht.
    const isWithdrawal = invoice.paid_by_withdrawal === true;
    const withdrawnOn = fmtDate(invoice.withdrawn_on);

    const payload = {
      entnahme: isWithdrawal,
      Rechnungsnummer: invoiceNumber,
      Rechnungsdatum: issueDate,
      Faellig: isWithdrawal ? "" : dueDate,
      Fällig: isWithdrawal ? "" : dueDate,
      Faelligkeit: isWithdrawal ? "" : dueDate,
      Fälligkeit: isWithdrawal ? "" : dueDate,
      Leistungszeitraum: servicePeriod,
      Kundennummer: invoice.client?.customer_no || "",
      Kunde: clientName,
      Kundenadresse: clientAddress,
      Netto: fmtMoney(totals.net),
      Nettobetrag: fmtMoney(totals.net),
      Umsatzsteuer: fmtMoney(totals.vat),
      Gesamtbetrag: fmtMoney(totals.gross),
      Brutto: fmtMoney(totals.gross),
      IBAN: company?.iban || "",
      BIC: company?.bic || "",
      Bank: company?.bank_name || "",
      firma: {
        name: company?.legal_name || "",
        adresse: [company?.address_line1, company?.address_line2, [company?.zip, company?.city].filter(Boolean).join(" "), company?.country].filter(Boolean).join(", "),
        strasse: company?.address_line1 || "",
        plz: company?.zip || "",
        zip: company?.zip || "",
        ort: company?.city || "",
        stadt: company?.city || "",
        land: company?.country || "",
        steuernr: company?.tax_no || "",
        ustid: company?.vat_id || "",
        ceo: company?.ceo || "",
        geschaeftsfuehrer: company?.ceo || "",
        hrb: company?.hrb || "",
        amtsgericht: company?.court || "",
        iban: company?.iban || "",
        bic: company?.bic || "",
        bank: company?.bank_name || "",
        email: company?.email || "",
        telefon: company?.phone || "",
        website: company?.website || "",
      },
      kunde: {
        name: clientName,
        adresse: clientAddress,
        strasse: invoice.client?.address_line1 || "",
        plz: invoice.client?.zip || "",
        zip: invoice.client?.zip || "",
        ort: invoice.client?.city || "",
        stadt: invoice.client?.city || "",
        land: invoice.client?.country || "",
        email: invoice.client?.email || "",
        ustid: invoice.client?.vat_id || "",
        kundennr: invoice.client?.customer_no || "",
      },
      rechnung: {
        nummer: invoiceNumber,
        datum: issueDate,
        faellig: isWithdrawal ? "" : dueDate,
        entnahme: isWithdrawal,
        entnommen_am: withdrawnOn || issueDate,
        leistungszeitraum: servicePeriod,
        intro: invoice.intro_text || "",
        footer: invoice.footer_text || company?.default_footer_text || "",
        projekt: invoice.project?.name || "",
      },
      positionen: items.map((it: any) => ({
        nr: it.idx + 1,
        pos: it.idx + 1,
        beschreibung: it.description,
        menge: fmtNumber(it.quantity),
        einheit: it.unit || "",
        einzelpreis: fmtMoney(it.unitPriceNet),
        ust: `${fmtNumber(it.vatRate, 2)}%`,
        netto: fmtMoney(it.lineNet),
        summe: fmtMoney(it.lineGross),
        brutto: fmtMoney(it.lineGross),
      })),
      summe: {
        netto: fmtMoney(totals.net),
        ust: fmtMoney(totals.vat),
        ust19: fmtMoney(vatBreakdown["19"]?.vat || 0),
        ust7: fmtMoney(vatBreakdown["7"]?.vat || 0),
        ust0: fmtMoney(vatBreakdown["0"]?.vat || 0),
        netto19: fmtMoney(vatBreakdown["19"]?.net || 0),
        netto7: fmtMoney(vatBreakdown["7"]?.net || 0),
        netto0: fmtMoney(vatBreakdown["0"]?.net || 0),
        brutto: fmtMoney(totals.gross),
      },
    };

    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());
    let zip: PizZip;
    try {
      zip = new PizZip(tplBuf);
    } catch (zErr: any) {
      return json({ error: `Vorlage ist keine gültige .docx-Datei: ${zErr?.message || zErr}` }, 422);
    }
    // Word's spell-/grammar-checker injects <w:proofErr/> tags inside placeholders
    // like {firma.adresse}, splitting them across runs and breaking docxtemplater.
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

    const renderStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const baseName = `${sanitize(invoice.invoice_number || "Entwurf")}_${sanitize(invoice.client_name_snapshot || invoice.client?.name || "Kunde")}_${renderStamp}`;
    const docxPath = `docx/${invoice.id}/${baseName}.docx`;

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
        pdfPath = `pdf/${invoice.id}/${baseName}.pdf`;
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

    await admin.from("rgi_invoices").update({
      docx_storage_path: docxPath,
      ...(pdfPath ? { pdf_storage_path: pdfPath } : {}),
    }).eq("id", invoice.id);

    // Ab in die Zahlungsliste des Objekts. Scheitert das, ist die
    // Rechnung trotzdem erzeugt - der Hinweis geht als payment_error
    // zurueck, statt den ganzen Vorgang abzubrechen.
    let payment: string | null = null;
    let paymentError: string | null = null;
    try {
      payment = await pushToPayments(
        admin, invoice, company, items, totals,
        pdfPath ?? docxPath,
        `${baseName}.${pdfPath ? "pdf" : "docx"}`,
      );
    } catch (qe: any) {
      console.error("pushToPayments failed", qe);
      paymentError = String(qe?.message || qe);
    }

    return json({
      ok: true,
      docx_path: docxPath,
      pdf_path: pdfPath,
      pdf_error: pdfError,
      payment,
      payment_error: paymentError,
    });
  } catch (e: any) {
    console.error("rgi-render-invoice error", e);
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
