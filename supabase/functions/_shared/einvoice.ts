// Shared E-Rechnung Parser: XRechnung (UBL/CII) + ZUGFeRD (PDF/A-3 mit eingebettetem XML)

function stripNs(xml: string): string {
  return xml
    .replace(/<\/?([a-zA-Z0-9]+):/g, "<$1_")
    .replace(/xmlns(:[a-zA-Z0-9]+)?="[^"]*"/g, "")
    .replace(/<([a-zA-Z0-9_]+)([^>]*)\/>/g, "<$1$2></$1>");
}

function findFirst(xml: string, tagSuffixes: string[]): string | null {
  for (const suffix of tagSuffixes) {
    const re = new RegExp(`<([a-zA-Z0-9_]*${suffix})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
    const m = xml.match(re);
    if (m) return m[2].trim();
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
  if (!s) return null;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(?:[,.]|$))/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function toIsoDate(s: string | null): string | null {
  if (!s) return null;
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
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
  line_items: Array<{ description: string; quantity: number | null; unit_price: number | null; net_amount: number | null }>;
}

function parseEInvoiceXml(xmlRaw: string, formatHint: "xrechnung" | "zugferd"): ParsedEInvoice {
  const xml = stripNs(xmlRaw);

  const sellerBlock = findFirst(xml, ["SellerTradeParty", "AccountingSupplierParty"]) || "";
  const vendor_name =
    findFirst(sellerBlock, ["Name", "RegistrationName"]) ||
    findFirst(xml, ["SellerTradeParty_Name"]);

  const buyerBlock = findFirst(xml, ["BuyerTradeParty", "AccountingCustomerParty"]) || "";
  const recipient_name = findFirst(buyerBlock, ["Name", "RegistrationName"]);
  const buyerAddress = findFirst(buyerBlock, ["PostalTradeAddress", "PostalAddress"]) || "";
  const recipient_address = [
    findFirst(buyerAddress, ["LineOne", "StreetName"]),
    findFirst(buyerAddress, ["PostcodeCode", "PostalZone"]),
    findFirst(buyerAddress, ["CityName"]),
  ].filter(Boolean).join(", ") || null;

  const leitweg_id = findFirst(xml, ["BuyerReference", "BuyerOrderReferencedDocument"]);

  const invoice_number = findFirst(xml, ["ID", "InvoiceID", "Invoice_ID"]);
  const invoice_date = toIsoDate(
    findFirst(xml, ["IssueDate"]) ||
    findFirst(findFirst(xml, ["IssueDateTime"]) || "", ["DateTimeString"]) ||
    findFirst(xml, ["DateTimeString"])
  );
  const due_date = toIsoDate(
    findFirst(xml, ["DueDate"]) ||
    findFirst(findFirst(xml, ["DueDateDateTime"]) || "", ["DateTimeString"])
  );

  const paymentBlock = findFirst(xml, ["PayeeFinancialAccount", "SpecifiedTradeSettlementPaymentMeans"]) || xml;
  const vendor_iban =
    findFirst(paymentBlock, ["IBANID", "ID"])?.replace(/\s/g, "").match(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i)?.[0] ||
    xml.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/)?.[1] || null;
  const vendor_bic = findFirst(xml, ["BICID", "FinancialInstitutionBranch"]) || null;

  const summary = findFirst(xml, ["LegalMonetaryTotal", "SpecifiedTradeSettlementHeaderMonetarySummation"]) || xml;
  const net_amount = toNum(findFirst(summary, ["TaxBasisTotalAmount", "TaxExclusiveAmount", "LineTotalAmount"]));
  const vat_amount = toNum(findFirst(summary, ["TaxTotalAmount"])) ?? toNum(findFirst(xml, ["TaxAmount"]));
  const gross_amount = toNum(findFirst(summary, ["GrandTotalAmount", "TaxInclusiveAmount", "PayableAmount"]));

  const currency =
    xml.match(/currencyID="([A-Z]{3})"/)?.[1] ||
    findFirst(xml, ["DocumentCurrencyCode", "InvoiceCurrencyCode"]) || "EUR";

  const description = findFirst(xml, ["Note", "IncludedNote", "Content"]);
  const payment_purpose = findFirst(xml, ["PaymentReference", "PaymentID", "RemittanceInformation"]) || invoice_number;

  const lineBlocks = findAll(xml, "IncludedSupplyChainTradeLineItem").concat(findAll(xml, "InvoiceLine"));
  const line_items = lineBlocks.slice(0, 50).map((block) => ({
    description: findFirst(block, ["Name", "Description"]) || "",
    quantity: toNum(findFirst(block, ["BilledQuantity", "InvoicedQuantity"])),
    unit_price: toNum(findFirst(block, ["ChargeAmount", "PriceAmount"])),
    net_amount: toNum(findFirst(block, ["LineTotalAmount", "LineExtensionAmount"])),
  }));

  return {
    format: formatHint,
    vendor_name: vendor_name?.trim() || null,
    vendor_iban: vendor_iban || null,
    vendor_bic: vendor_bic?.trim() || null,
    invoice_number: invoice_number?.trim() || null,
    invoice_date,
    due_date,
    net_amount,
    vat_amount,
    gross_amount,
    currency: currency.trim(),
    description: description?.trim() || null,
    recipient_name: recipient_name?.trim() || null,
    recipient_address,
    leitweg_id: leitweg_id?.trim() || null,
    payment_purpose: payment_purpose?.trim() || null,
    line_items,
  };
}

async function extractZugferdXml(pdfBytes: Uint8Array): Promise<string | null> {
  const txt = new TextDecoder("latin1").decode(pdfBytes);
  const filenamePatterns = [/factur-x\.xml/i, /zugferd-invoice\.xml/i, /xrechnung\.xml/i, /ZUGFeRD-invoice\.xml/i];
  const hasEmbedded = filenamePatterns.some((p) => p.test(txt));
  if (!hasEmbedded) return null;

  const streamRe = /\/Type\s*\/EmbeddedFile[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(txt)) !== null) {
    const raw = m[1];
    try {
      const compressed = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) compressed[i] = raw.charCodeAt(i) & 0xff;
      const ds = new DecompressionStream("deflate");
      const stream = new Blob([compressed]).stream().pipeThrough(ds);
      const decompressed = await new Response(stream).text();
      if (decompressed.includes("CrossIndustryInvoice") || decompressed.includes("<Invoice")) return decompressed;
    } catch {
      if (raw.includes("CrossIndustryInvoice") || raw.includes("<Invoice")) return raw;
    }
  }
  return null;
}

export async function detectAndParseEInvoice(
  fileBytes: Uint8Array,
  fileName: string,
): Promise<ParsedEInvoice | null> {
  const lowerName = fileName.toLowerCase();
  const head = new TextDecoder("utf-8", { fatal: false }).decode(fileBytes.slice(0, 200)).trim();

  if (lowerName.endsWith(".xml") || head.startsWith("<?xml") || head.startsWith("<")) {
    const xml = new TextDecoder("utf-8").decode(fileBytes);
    if (xml.includes("CrossIndustryInvoice") || xml.includes("<Invoice") || xml.includes(":Invoice ")) {
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
