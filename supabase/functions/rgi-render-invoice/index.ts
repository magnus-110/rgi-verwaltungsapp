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
function sanitize(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
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
    const items = (invoice.items || []).sort((a: any, b: any) => a.position - b.position);
    const vatBreakdown: Record<string, { net: number; vat: number }> = {};
    for (const it of items) {
      const k = String(it.vat_rate);
      vatBreakdown[k] ??= { net: 0, vat: 0 };
      vatBreakdown[k].net += Number(it.line_net);
      vatBreakdown[k].vat += Number(it.line_vat);
    }
    const payload = {
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
        name: invoice.client_name_snapshot || invoice.client?.name || "",
        adresse: invoice.client_address_snapshot || [invoice.client?.address_line1, [invoice.client?.zip, invoice.client?.city].filter(Boolean).join(" "), invoice.client?.country].filter(Boolean).join(", "),
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
        nummer: invoice.invoice_number || "ENTWURF",
        datum: fmtDate(invoice.issue_date),
        faellig: fmtDate(invoice.due_date),
        leistungszeitraum: invoice.service_period_from || invoice.service_period_to
          ? `${fmtDate(invoice.service_period_from)} – ${fmtDate(invoice.service_period_to)}`
          : "",
        intro: invoice.intro_text || "",
        footer: invoice.footer_text || company?.default_footer_text || "",
        projekt: invoice.project?.name || "",
      },
      positionen: items.map((it: any, idx: number) => ({
        nr: idx + 1,
        beschreibung: it.description,
        menge: Number(it.quantity).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 4 }),
        einheit: it.unit || "",
        einzelpreis: fmtMoney(it.unit_price_net),
        ust: `${Number(it.vat_rate)}%`,
        netto: fmtMoney(it.line_net),
        summe: fmtMoney(it.line_gross),
      })),
      summe: {
        netto: fmtMoney(invoice.subtotal_net),
        ust: fmtMoney(invoice.vat_total),
        ust19: fmtMoney(vatBreakdown["19"]?.vat || 0),
        ust7: fmtMoney(vatBreakdown["7"]?.vat || 0),
        ust0: fmtMoney(vatBreakdown["0"]?.vat || 0),
        netto19: fmtMoney(vatBreakdown["19"]?.net || 0),
        netto7: fmtMoney(vatBreakdown["7"]?.net || 0),
        netto0: fmtMoney(vatBreakdown["0"]?.net || 0),
        brutto: fmtMoney(invoice.total_gross),
      },
    };

    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());
    let zip: PizZip;
    try {
      zip = new PizZip(tplBuf);
    } catch (zErr: any) {
      return json({ error: `Vorlage ist keine gültige .docx-Datei: ${zErr?.message || zErr}` }, 422);
    }
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });
    try {
      doc.render(payload);
    } catch (rErr: any) {
      const tplErrors = rErr?.properties?.errors;
      if (Array.isArray(tplErrors) && tplErrors.length) {
        const details = tplErrors.map((te: any) => `${te?.properties?.xtag ?? "?"}: ${te?.properties?.explanation ?? te?.message}`).join(" | ");
        return json({ error: `Vorlage enthält ungültige/unbekannte Platzhalter — ${details}` }, 422);
      }
      return json({ error: `Word-Rendering fehlgeschlagen: ${rErr?.message || rErr}` }, 500);
    }
    const docxBytes = doc.getZip().generate({ type: "uint8array" });

    const baseName = `${sanitize(invoice.invoice_number || "Entwurf")}_${sanitize(invoice.client_name_snapshot || invoice.client?.name || "Kunde")}`;
    const docxPath = `docx/${invoice.id}/${baseName}.docx`;

    await admin.storage.from("invoices").upload(docxPath, docxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

    let pdfPath: string | null = null;
    let pdfError: string | null = null;
    if (formats.includes("pdf")) {
      try {
        const pdfBytes = await convertDocxToPdf(docxBytes, `${baseName}.docx`);
        pdfPath = `pdf/${invoice.id}/${baseName}.pdf`;
        await admin.storage.from("invoices").upload(pdfPath, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });
      } catch (pe: any) {
        console.error("PDF conversion failed", pe);
        pdfError = String(pe?.message || pe);
      }
    }

    await admin.from("rgi_invoices").update({
      docx_storage_path: docxPath,
      ...(pdfPath ? { pdf_storage_path: pdfPath } : {}),
    }).eq("id", invoice.id);

    return json({ ok: true, docx_path: docxPath, pdf_path: pdfPath, pdf_error: pdfError });
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
