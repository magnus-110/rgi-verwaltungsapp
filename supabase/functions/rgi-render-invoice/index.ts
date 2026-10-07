// rgi-render-invoice
// Erzeugt eine RGI-Rechnung als PDF im klassischen Design (siehe
// invoicePdf.ts) und legt sie in Bucket 'invoices' ab.
//
// Kein Word, kein CloudConvert, kein Zusatzserver: das PDF wird
// direkt hier in der Funktion gezeichnet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { buildInvoicePdf, type InvoiceData } from "./invoicePdf.ts";

// Logo für den Rechnungskopf. Standard ist das Logo aus dem öffentlichen
// Repo; mit RGI_LOGO_URL lässt sich eine andere Adresse setzen.
const DEFAULT_LOGO_URL =
  "https://raw.githubusercontent.com/magnus-110/rgi-verwaltungsapp/main/public/lovable-uploads/8cc4ac02-ecfc-41ef-945a-738115d31106.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Datum immer zweistellig: 01.01.2026 statt 1.1.2026. */
function fmtDate(d?: string | null): string {
  if (!d) return "";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
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
  return (s || "")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "Datei";
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


/**
 * Teilt eine Positionsbezeichnung in Hauptzeile und Zusatz.
 * „Verwaltervergütung 2025 — 26 × 28,00 € je Monat“ wird zu
 * Hauptzeile „Verwaltervergütung 2025“ und grauer Zusatzzeile.
 * Ein Zeilenumbruch in der Bezeichnung trennt genauso.
 */
function splitDescription(text: string): { main: string; detail: string } {
  const t = (text || "").trim();
  const nl = t.indexOf("\n");
  if (nl > 0) return { main: t.slice(0, nl).trim(), detail: t.slice(nl + 1).trim() };
  const m = t.split(/\s+[—–]\s+/);
  if (m.length > 1) return { main: m[0].trim(), detail: m.slice(1).join(" – ").trim() };
  return { main: t, detail: "" };
}

/** Adresszeilen aus dem Schnappschuss („Straße, PLZ Ort, DE“). */
function addressLines(snapshot: string | null | undefined, client: any): string[] {
  const parts = snapshot
    ? snapshot.split(/\s*,\s*|\n/)
    : [client?.address_line1, [client?.zip, client?.city].filter(Boolean).join(" "), client?.country];
  return parts
    .map((p: any) => String(p ?? "").trim())
    .filter((p: string) => p && !/^(de|deutschland|germany)$/i.test(p));
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
    if (!invoice_id) return json({ error: "invoice_id erforderlich" }, 400);

    const { data: invoice, error: invErr } = await admin
      .from("rgi_invoices")
      .select("*, client:rgi_clients(*), project:rgi_projects(*), items:rgi_invoice_items(*)")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !invoice) return json({ error: invErr?.message || "Rechnung nicht gefunden" }, 404);

    const { data: company } = await admin.from("rgi_company_settings").select("*").limit(1).maybeSingle();

    // ---------------- Beträge ----------------
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

    // ---------------- Zahlungsweg ----------------
    // Rechnungen an eine Gemeinschaft überweist die Hausverwaltung
    // selbst vom Gemeinschaftskonto. Ohne Objektbezug (z. B. ein
    // externer Kunde) bleibt es bei der klassischen Überweisung.
    const buildingId = invoice.building_id || invoice.client?.building_id || null;
    const payment: InvoiceData["payment"] =
      invoice.paid_by_withdrawal === true ? "withdrawal" : buildingId ? "management" : "transfer";

    const servicePeriod = invoice.service_period_from || invoice.service_period_to
      ? `${fmtDate(invoice.service_period_from)} – ${fmtDate(invoice.service_period_to)}`
      : "";
    const clientName = invoice.client_name_snapshot || invoice.client?.name || "";

    const invoiceData: InvoiceData = {
      company: {
        name: company?.legal_name || "RGI Immobilien GmbH & Co. KG",
        street: [company?.address_line1, company?.address_line2].filter(Boolean).join(", "),
        zipCity: [company?.zip, company?.city].filter(Boolean).join(" "),
        phone: company?.phone || "",
        email: company?.email || "",
        website: company?.website || "",
        court: company?.court || "",
        hrb: company?.hrb || "",
        ceo: company?.ceo || "",
        vatId: company?.vat_id || "",
        taxNo: company?.tax_no || "",
        bank: company?.bank_name || "",
        iban: company?.iban || "",
        bic: company?.bic || "",
      },
      recipient: {
        name: clientName,
        lines: addressLines(invoice.client_address_snapshot, invoice.client),
      },
      meta: {
        number: invoice.invoice_number || "Entwurf",
        date: fmtDate(invoice.issue_date),
        customerNo: invoice.client?.customer_no || "",
        servicePeriod,
        dueDate: fmtDate(invoice.due_date),
        isDraft: !invoice.invoice_number,
      },
      intro: invoice.intro_text || "",
      footerText: invoice.footer_text || company?.default_footer_text || "",
      items: items.map((it: any) => {
        const { main, detail } = splitDescription(it.description);
        return {
          pos: it.idx + 1,
          description: main,
          detail,
          quantity: `${fmtNumber(it.quantity)}${it.unit ? ` ${it.unit}` : ""}`,
          unitPrice: fmtMoney(it.unitPriceNet),
          vat: `${fmtNumber(it.vatRate, 2)} %`,
          net: fmtMoney(it.lineNet),
        };
      }),
      totals: {
        net: fmtMoney(totals.net),
        vatLines: Object.entries(vatBreakdown)
          .filter(([, v]) => v.net !== 0)
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([rate, v]) => ({
            label: Number(rate) === 0 ? "Umsatzsteuer 0 %" : `zzgl. ${fmtNumber(Number(rate), 2)} % Umsatzsteuer`,
            amount: fmtMoney(v.vat),
          })),
        gross: fmtMoney(totals.gross),
      },
      payment,
    };

    // ---------------- PDF ----------------
    const renderStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const baseName = `${sanitize(invoice.invoice_number || "Entwurf")}_${sanitize(clientName || "Kunde")}_${renderStamp}`;

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildInvoicePdf(invoiceData, Deno.env.get("RGI_LOGO_URL") || DEFAULT_LOGO_URL);
    } catch (pe: any) {
      console.error("PDF conversion failed", pe);
      return json({ error: String(pe?.message || pe), pdf_error: String(pe?.message || pe) }, 502);
    }

    const pdfPath = `pdf/${invoice.id}/${baseName}.pdf`;
    const { error: pdfUploadError } = await admin.storage.from("invoices").upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: true,
    });
    if (pdfUploadError) return json({ error: `PDF-Upload fehlgeschlagen: ${pdfUploadError.message}` }, 500);

    await admin.from("rgi_invoices").update({ pdf_storage_path: pdfPath }).eq("id", invoice.id);

    // Ab in die Zahlungsliste des Objekts. Scheitert das, ist die
    // Rechnung trotzdem erzeugt - der Hinweis geht als payment_error
    // zurueck, statt den ganzen Vorgang abzubrechen.
    let paymentResult: string | null = null;
    let paymentError: string | null = null;
    try {
      paymentResult = await pushToPayments(admin, invoice, company, items, totals, pdfPath, `${baseName}.pdf`);
    } catch (qe: any) {
      console.error("pushToPayments failed", qe);
      paymentError = String(qe?.message || qe);
    }

    return json({
      ok: true,
      docx_path: null,
      pdf_path: pdfPath,
      pdf_error: null,
      payment: paymentResult,
      payment_error: paymentError,
    });
  } catch (e: any) {
    console.error("rgi-render-invoice error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
