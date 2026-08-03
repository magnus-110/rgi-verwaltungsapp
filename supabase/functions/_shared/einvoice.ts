// Shared E-Rechnung Parser: XRechnung (UBL/CII) + ZUGFeRD/Factur-X (PDF/A-3 mit eingebettetem XML)

/**
 * Entfernt Namespace-Präfixe: <ram:ID> → <ram_ID>, </ram:ID> → </ram_ID>.
 * WICHTIG: Öffnende und schließende Tags getrennt behandeln — sonst wird aus
 * "</ram:ID>" ein "<ram_ID>" (Slash verloren) und sämtliche Paar-Regexe
 * greifen nicht mehr (das war die Ursache für komplett leere ZUGFeRD-Parses).
 */
function stripNs(xml: string): string {
  return xml
    .replace(/<\/\s*([a-zA-Z0-9]+):/g, "</$1_")
    .replace(/<([a-zA-Z0-9]+):/g, "<$1_")
    .replace(/xmlns(:[a-zA-Z0-9]+)?="[^"]*"/g, "")
    .replace(/<([a-zA-Z0-9_]+)([^>]*?)\/>/g, "<$1$2></$1>");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

/** Inhalt des ersten Tags, dessen Name auf einen der Suffixe endet. */
function findFirst(xml: string, tagSuffixes: string[]): string | null {
  for (const suffix of tagSuffixes) {
    const re = new RegExp(`<([a-zA-Z0-9_]*${suffix})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
    const m = xml.match(re);
    if (m) {
      const v = decodeEntities(m[2]).trim();
      if (v) return v;
    }
  }
  return null;
}

function findAll(xml: string, tagSuffix: string): string[] {
  const re = new RegExp(`<([a-zA-Z0-9_]*${tagSuffix})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[2]);
  return out;
}

function toNum(s: string | null): number | null {
  if (s == null) return null;
  const cleaned = String(s)
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function toIsoDate(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  const compact = t.match(/(\d{4})(\d{2})(\d{2})/);
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (compact && /^\d{8}$/.test(t.replace(/\s/g, ""))) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }
  const de = t.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (de) return `${de[3]}-${de[2]}-${de[1]}`;
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

/** Datum aus CII-Blöcken: <ram:IssueDateTime><udt:DateTimeString format="102">20260731 */
function dateFromBlock(xml: string, blockSuffixes: string[]): string | null {
  for (const suffix of blockSuffixes) {
    const block = findFirst(xml, [suffix]);
    if (!block) continue;
    const inner = findFirst(block, ["DateTimeString", "Date"]);
    const d = toIsoDate(inner || block);
    if (d) return d;
  }
  return null;
}

export interface EInvoiceLineItem {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  net_amount: number | null;
  amount: number | null;
  vat_rate: number | null;
}

export interface ParsedEInvoice {
  format: "xrechnung" | "zugferd";
  vendor_name: string | null;
  vendor_iban: string | null;
  vendor_bic: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  net_amount: number | null;
  vat_amount: number | null;
  gross_amount: number | null;
  currency: string;
  description: string | null;
  recipient_name: string | null;
  recipient_address: string | null;
  leitweg_id: string | null;
  payment_purpose: string | null;
  line_items: EInvoiceLineItem[];
}

/** True, wenn genug Kerndaten erkannt wurden, um die OCR überspringen zu können. */
export function isEInvoiceComplete(e: ParsedEInvoice | null): boolean {
  return !!(e && e.invoice_number && e.invoice_date && e.gross_amount != null);
}

function parseAddress(partyBlock: string): string | null {
  const addr = findFirst(partyBlock, ["PostalTradeAddress", "PostalAddress", "Address"]) || "";
  if (!addr) return null;
  const street = findFirst(addr, ["LineOne", "StreetName"]);
  const street2 = findFirst(addr, ["LineTwo", "AdditionalStreetName"]);
  const zip = findFirst(addr, ["PostcodeCode", "PostalZone"]);
  const city = findFirst(addr, ["CityName"]);
  const parts = [street, street2, [zip, city].filter(Boolean).join(" ")].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function parseLineItems(xml: string): EInvoiceLineItem[] {
  const ciiBlocks = findAll(xml, "IncludedSupplyChainTradeLineItem");
  const ublBlocks = findAll(xml, "InvoiceLine");
  const blocks = ciiBlocks.length ? ciiBlocks : ublBlocks;

  return blocks.slice(0, 100).map((block) => {
    const product = findFirst(block, ["SpecifiedTradeProduct", "Item"]) || block;
    const description =
      findFirst(product, ["Name", "Description"]) ||
      findFirst(block, ["Name", "Description"]) ||
      "";

    const quantity = toNum(findFirst(block, ["BilledQuantity", "InvoicedQuantity", "Quantity"]));

    const priceBlock =
      findFirst(block, ["NetPriceProductTradePrice", "Price"]) || block;
    const unit_price = toNum(findFirst(priceBlock, ["ChargeAmount", "PriceAmount"]));

    const sumBlock =
      findFirst(block, ["SpecifiedTradeSettlementLineMonetarySummation"]) || block;
    const net = toNum(findFirst(sumBlock, ["LineTotalAmount", "LineExtensionAmount"]));

    const taxBlock = findFirst(block, ["ApplicableTradeTax", "TaxCategory", "ClassifiedTaxCategory"]) || "";
    const vat_rate = toNum(findFirst(taxBlock, ["RateApplicablePercent", "Percent"]));

    return {
      description: description.replace(/\s+/g, " ").trim(),
      quantity,
      unit_price,
      net_amount: net,
      // "amount" wird von der bestehenden UI/Buchungslogik gelesen (Netto-Betrag)
      amount: net,
      vat_rate,
    };
  }).filter((i) => i.description || i.net_amount != null);
}

function parseEInvoiceXml(xmlRaw: string, formatHint: "xrechnung" | "zugferd"): ParsedEInvoice {
  const xml = stripNs(xmlRaw);

  // ── Kopfdaten ──────────────────────────────────────────────────────────────
  const headerBlock =
    findFirst(xml, ["ExchangedDocument"]) || xml; // CII; bei UBL steht alles auf Root-Ebene

  let invoice_number: string | null = null;
  const ciiHeader = findFirst(xml, ["ExchangedDocument"]);
  if (ciiHeader) {
    invoice_number = findFirst(ciiHeader, ["ID"]);
  } else {
    // UBL: erstes cbc:ID direkt unter <Invoice> (vor der ersten InvoiceLine)
    const beforeLines = xml.split(/<[a-zA-Z0-9_]*InvoiceLine\b/i)[0];
    invoice_number = findFirst(beforeLines, ["ID"]);
  }

  const invoice_date =
    dateFromBlock(headerBlock, ["IssueDateTime"]) ||
    toIsoDate(findFirst(xml, ["IssueDate"])) ||
    dateFromBlock(xml, ["IssueDateTime"]);

  // ── Parteien ───────────────────────────────────────────────────────────────
  const sellerBlock =
    findFirst(xml, ["SellerTradeParty", "AccountingSupplierParty"]) || "";
  const vendor_name =
    findFirst(sellerBlock, ["Name", "RegistrationName"]) ||
    findFirst(findFirst(sellerBlock, ["Party"]) || "", ["Name", "RegistrationName"]);

  const buyerBlock =
    findFirst(xml, ["BuyerTradeParty", "AccountingCustomerParty"]) || "";
  const buyerParty = findFirst(buyerBlock, ["Party"]) || buyerBlock;
  const recipient_name = findFirst(buyerParty, ["Name", "RegistrationName"]);
  const recipient_address = parseAddress(buyerParty);

  const leitweg_id = findFirst(xml, ["BuyerReference"]);

  // ── Zahlung ────────────────────────────────────────────────────────────────
  const paymentBlocks = findAll(xml, "SpecifiedTradeSettlementPaymentMeans")
    .concat(findAll(xml, "PaymentMeans"));
  let vendor_iban: string | null = null;
  let vendor_bic: string | null = null;
  for (const pb of paymentBlocks) {
    const acc = findFirst(pb, ["PayeePartyCreditorFinancialAccount", "PayeeFinancialAccount"]) || pb;
    const cand = (findFirst(acc, ["IBANID", "ID"]) || "").replace(/\s/g, "");
    if (!vendor_iban && /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(cand)) vendor_iban = cand.toUpperCase();
    const inst = findFirst(pb, ["PayeeSpecifiedCreditorFinancialInstitution", "FinancialInstitutionBranch"]) || "";
    if (!vendor_bic) {
      const bic = (findFirst(inst, ["BICID", "ID"]) || "").replace(/\s/g, "");
      if (/^[A-Z]{6}[A-Z0-9]{2,5}$/i.test(bic)) vendor_bic = bic.toUpperCase();
    }
  }
  if (!vendor_iban) {
    vendor_iban = xml.replace(/\s/g, "").match(/\b(DE\d{20}|[A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/)?.[1] || null;
  }

  const due_date =
    dateFromBlock(xml, ["DueDateDateTime"]) ||
    toIsoDate(findFirst(xml, ["DueDate"]));

  // ── Summen ─────────────────────────────────────────────────────────────────
  const summary =
    findFirst(xml, ["SpecifiedTradeSettlementHeaderMonetarySummation", "LegalMonetaryTotal"]) || xml;
  const net_amount =
    toNum(findFirst(summary, ["TaxBasisTotalAmount", "TaxExclusiveAmount"])) ??
    toNum(findFirst(summary, ["LineTotalAmount", "LineExtensionAmount"]));
  const gross_amount =
    toNum(findFirst(summary, ["GrandTotalAmount", "TaxInclusiveAmount"])) ??
    toNum(findFirst(summary, ["DuePayableAmount", "PayableAmount"]));
  let vat_amount = toNum(findFirst(summary, ["TaxTotalAmount"]));
  if (vat_amount == null) {
    const taxBlock = findFirst(xml, ["ApplicableTradeTax", "TaxTotal"]) || "";
    vat_amount = toNum(findFirst(taxBlock, ["CalculatedAmount", "TaxAmount"]));
  }
  if (vat_amount == null && net_amount != null && gross_amount != null) {
    vat_amount = Math.round((gross_amount - net_amount) * 100) / 100;
  }

  const currency =
    xmlRaw.match(/currencyID="([A-Z]{3})"/)?.[1] ||
    findFirst(xml, ["InvoiceCurrencyCode", "DocumentCurrencyCode"]) ||
    "EUR";

  // ── Texte ──────────────────────────────────────────────────────────────────
  const included = findAll(xml, "IncludedNote");
  const noteBlocks = included.length ? included : findAll(xml, "Note");
  const notes = [...new Set(
    noteBlocks
      .map((b) => (findFirst(b, ["Content"]) || decodeEntities(b)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  )];
  const line_items = parseLineItems(xml);
  const description =
    (notes.length ? notes.join(" | ") : null) ||
    (line_items.length ? line_items.map((i) => i.description).filter(Boolean).join(", ") : null);

  const payment_purpose =
    findFirst(xml, ["PaymentReference", "RemittanceInformation", "PaymentID"]) || invoice_number;

  return {
    format: formatHint,
    vendor_name: vendor_name?.trim() || null,
    vendor_iban,
    vendor_bic,
    invoice_number: invoice_number?.trim() || null,
    invoice_date,
    due_date,
    net_amount,
    vat_amount,
    gross_amount,
    currency: currency.trim(),
    description: description ? description.slice(0, 2000) : null,
    recipient_name: recipient_name?.trim() || null,
    recipient_address,
    leitweg_id: leitweg_id?.trim() || null,
    payment_purpose: payment_purpose?.trim() || null,
    line_items,
  };
}

// ───────────────────────── PDF-Anhang-Extraktion ─────────────────────────────

function looksLikeInvoiceXml(s: string): boolean {
  return /CrossIndustryInvoice|<[a-zA-Z0-9]*:?Invoice[\s>]|CrossIndustryDocument/.test(s);
}

async function inflate(bytes: Uint8Array, format: "deflate" | "deflate-raw" | "gzip"): Promise<string | null> {
  try {
    const ds = new DecompressionStream(format);
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

function latin1ToBytes(raw: string): Uint8Array {
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Sucht das eingebettete Rechnungs-XML in einem ZUGFeRD/Factur-X-PDF.
 * Robust gegenüber: zlib- und raw-deflate, unkomprimierten Streams,
 * mehreren Anhängen und Streams ohne /Type /EmbeddedFile-Markierung.
 */
async function extractZugferdXml(pdfBytes: Uint8Array): Promise<string | null> {
  const txt = new TextDecoder("latin1").decode(pdfBytes);

  const candidates: string[] = [];

  // 1) Explizit als EmbeddedFile markierte Streams
  const embeddedRe = /\/Type\s*\/EmbeddedFile[\s\S]{0,800}?stream\r?\n?([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = embeddedRe.exec(txt)) !== null) candidates.push(m[1]);

  // 2) Fallback: alle Streams (ZUGFeRD-XML ist meist klein, daher Größenfilter)
  if (candidates.length < 12) {
    const anyStreamRe = /stream\r?\n?([\s\S]*?)endstream/g;
    let s: RegExpExecArray | null;
    while ((s = anyStreamRe.exec(txt)) !== null) {
      if (s[1].length > 8 && s[1].length < 4_000_000) candidates.push(s[1]);
    }
  }

  for (const raw of candidates) {
    const trimmed = raw.replace(/^[\r\n]+/, "").replace(/[\r\n]+$/, "");
    if (looksLikeInvoiceXml(trimmed)) return trimmed;

    const bytes = latin1ToBytes(trimmed);
    for (const fmt of ["deflate", "deflate-raw", "gzip"] as const) {
      const out = await inflate(bytes, fmt);
      if (out && looksLikeInvoiceXml(out)) return out;
    }
  }
  return null;
}

export async function detectAndParseEInvoice(
  fileBytes: Uint8Array,
  fileName: string,
): Promise<ParsedEInvoice | null> {
  const lowerName = (fileName || "").toLowerCase();
  const head = new TextDecoder("utf-8", { fatal: false }).decode(fileBytes.slice(0, 400)).trim();

  if (lowerName.endsWith(".xml") || head.startsWith("<?xml") || head.startsWith("<")) {
    const xml = new TextDecoder("utf-8").decode(fileBytes);
    if (looksLikeInvoiceXml(xml)) {
      return parseEInvoiceXml(xml, "xrechnung");
    }
    return null;
  }

  if (lowerName.endsWith(".pdf") || head.startsWith("%PDF")) {
    const xml = await extractZugferdXml(fileBytes);
    if (xml) return parseEInvoiceXml(xml, "zugferd");
  }

  return null;
}
