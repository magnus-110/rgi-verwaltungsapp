// Baut die RGI-Rechnung als HTML im klassischen Design
// (Geschäftsbrief-Aufbau, Anschrift im Fenster des Umschlags).
//
// Zwei Teile:
//   - body:   die eigentliche Rechnung, fließt bei vielen Positionen
//             auf weitere Seiten weiter (Tabellenkopf wiederholt sich)
//   - footer: Firmenangaben + Seitenzahl, erscheint auf JEDER Seite
//
// Gotenberg (Chromium) druckt beides zu einem PDF. Die Seitenränder
// setzt der Aufruf in index.ts – sie müssen zu den Maßen hier passen.

export interface InvoiceHtmlInput {
  logoDataUri: string;
  company: {
    name: string;
    street: string;
    zipCity: string;
    phone: string;
    email: string;
    website: string;
    court: string;
    hrb: string;
    ceo: string;
    vatId: string;
    taxNo: string;
    bank: string;
    iban: string;
    bic: string;
  };
  recipient: { name: string; lines: string[] };
  meta: {
    number: string;
    date: string;
    customerNo: string;
    servicePeriod: string;
    dueDate: string;
    isDraft: boolean;
  };
  intro: string;
  footerText: string;
  items: {
    pos: number;
    description: string;
    detail: string;
    quantity: string;
    unitPrice: string;
    vat: string;
    net: string;
  }[];
  totals: {
    net: string;
    vatLines: { label: string; amount: string }[];
    gross: string;
  };
  /**
   * "management": die Hausverwaltung überweist vom Gemeinschaftskonto
   * "withdrawal": alte Rechnungen mit Selbstentnahme
   * "transfer":   Empfänger überweist selbst (kein Objekt zugeordnet)
   */
  payment: "management" | "withdrawal" | "transfer";
}

const ACCENT = "#ee7202";
const INK = "#2e2c2d";
const TEXT = "#4a4849";
const MUTED = "#6b6869";
const LINE = "#e4e0db";

export function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Mehrzeiliger Text: Zeilenumbrüche bleiben erhalten. */
function multi(s: string): string {
  return esc(s).replace(/\r?\n/g, "<br>");
}

const FONTS =
  `<link rel="preconnect" href="https://fonts.googleapis.com">` +
  `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
  `<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">`;

export function buildInvoiceHtml(d: InvoiceHtmlInput): { body: string; footer: string } {
  const c = d.company;
  const senderLine = [c.name, c.street, c.zipCity].filter(Boolean).map(esc).join(" · ");

  const metaRows = [
    ["Rechnungsnr.", d.meta.number],
    ["Datum", d.meta.date],
    ["Kundennr.", d.meta.customerNo],
    ["Leistung", d.meta.servicePeriod],
    ...(d.payment === "transfer" && d.meta.dueDate ? [["Fällig am", d.meta.dueDate]] : []),
  ].filter(([, v]) => v);

  const paymentText =
    d.payment === "management"
      ? "Der Rechnungsbetrag wird durch die Hausverwaltung vom Konto der Gemeinschaft überwiesen."
      : d.payment === "withdrawal"
        ? "Der Rechnungsbetrag wird gemäß Verwaltervertrag vom Objektkonto der Gemeinschaft entnommen."
        : `Bitte überweisen Sie den Betrag${d.meta.dueDate ? ` bis zum ${esc(d.meta.dueDate)}` : ""} auf das unten genannte Konto` +
          `${c.iban ? ` (IBAN ${esc(c.iban)})` : ""} unter Angabe der Rechnungsnummer.`;

  const rows = d.items.map((it) => `
      <tr>
        <td class="c-pos">${it.pos}</td>
        <td class="c-desc"><div class="d-main">${esc(it.description)}</div>${it.detail ? `<div class="d-sub">${multi(it.detail)}</div>` : ""}</td>
        <td class="num">${esc(it.quantity)}</td>
        <td class="num">${esc(it.unitPrice)}</td>
        <td class="num">${esc(it.vat)}</td>
        <td class="num">${esc(it.net)}</td>
      </tr>`).join("");

  const vatRows = d.totals.vatLines.map((v) =>
    `<div class="t-row"><span class="muted">${esc(v.label)}</span><span>${esc(v.amount)}</span></div>`).join("");

  const body = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Rechnung ${esc(d.meta.number)}</title>
${FONTS}
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: 'Work Sans', Arial, sans-serif;
    font-size: 9.6pt; line-height: 1.5; color: ${INK};
    font-variant-numeric: tabular-nums;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .muted { color: ${MUTED}; }
  .accent-line { height: 3px; background: ${ACCENT}; margin-bottom: 7mm; }
  .head { display: flex; justify-content: flex-end; height: 19mm; }
  .head img { height: 19mm; width: auto; }
  /* Anschrift so, dass sie im Fenster eines DIN-Umschlags liegt */
  .addr-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 4mm; min-height: 40mm; }
  .addr { width: 85mm; }
  .sender { font-size: 6.8pt; color: ${MUTED}; padding-bottom: 1mm; border-bottom: 0.6pt solid #d8d4cf; margin-bottom: 3mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .recipient { font-size: 10pt; line-height: 1.5; }
  .recipient .name { font-weight: 600; }
  .meta { width: 72mm; display: grid; grid-template-columns: auto 1fr; column-gap: 4mm; row-gap: 1.2mm; font-size: 9pt; padding-top: 5mm; }
  .meta .k { color: ${MUTED}; }
  .meta .v { text-align: right; white-space: nowrap; }
  .meta .v.strong { font-weight: 600; }
  h1 { margin: 9mm 0 0; font-size: 20pt; font-weight: 600; letter-spacing: -0.02em; }
  .draft { display: inline-block; margin-left: 3mm; font-size: 8pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${ACCENT}; border: 1pt solid ${ACCENT}; border-radius: 3px; padding: 0.4mm 2mm; vertical-align: middle; }
  .intro { margin: 3.5mm 0 0; color: ${TEXT}; max-width: 150mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 7mm; }
  thead { display: table-header-group; }
  th { font-size: 7.6pt; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${TEXT}; text-align: left; padding: 0 0 2mm; border-bottom: 1.1pt solid ${INK}; }
  td { padding: 2.6mm 0; border-bottom: 0.6pt solid ${LINE}; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th.num, td.num { text-align: right; white-space: nowrap; padding-left: 3mm; }
  .c-pos { width: 9mm; color: ${MUTED}; }
  .d-main { font-weight: 500; }
  .d-sub { font-size: 8.4pt; color: ${MUTED}; }
  .totals { display: flex; justify-content: flex-end; margin-top: 4mm; break-inside: avoid; page-break-inside: avoid; }
  .totals-box { width: 78mm; }
  .t-row { display: flex; justify-content: space-between; padding: 0.8mm 0; }
  .t-sum { display: flex; justify-content: space-between; align-items: baseline; margin-top: 1.5mm; padding-top: 2.5mm; border-top: 1.1pt solid ${INK}; }
  .t-sum b { font-weight: 600; }
  .t-sum .amount { font-size: 13pt; font-weight: 600; }
  .pay { margin-top: 7mm; padding: 3.5mm 5mm; background: #faf6f1; border-radius: 4px; display: flex; gap: 3.5mm; align-items: flex-start; color: ${TEXT}; break-inside: avoid; page-break-inside: avoid; }
  .pay svg { flex: none; margin-top: 0.3mm; }
  .closing { margin-top: 6mm; color: ${TEXT}; break-inside: avoid; page-break-inside: avoid; }
  .closing .co { font-weight: 500; color: ${INK}; }
  .note { margin-top: 5mm; font-size: 8.4pt; color: ${MUTED}; }
</style>
</head>
<body>
  <div class="accent-line"></div>
  <div class="head">${d.logoDataUri
    ? `<img src="${d.logoDataUri}" alt="RGI Immobilien">`
    : `<div style="font-size:16pt;font-weight:600;color:${ACCENT}">${esc(d.company.name)}</div>`}</div>

  <div class="addr-row">
    <div class="addr">
      <div class="sender">${senderLine}</div>
      <div class="recipient">
        <div class="name">${esc(d.recipient.name)}</div>
        ${d.recipient.lines.map((l) => `<div>${esc(l)}</div>`).join("")}
      </div>
    </div>
    <div class="meta">
      ${metaRows.map(([k, v], i) => `<div class="k">${esc(k)}</div><div class="v${i === 0 ? " strong" : ""}">${esc(v)}</div>`).join("")}
    </div>
  </div>

  <h1>Rechnung${d.meta.isDraft ? `<span class="draft">Entwurf</span>` : ""}</h1>
  ${d.intro ? `<p class="intro">${multi(d.intro)}</p>` : ""}

  <table>
    <thead>
      <tr>
        <th>Pos.</th>
        <th>Beschreibung</th>
        <th class="num">Menge</th>
        <th class="num">Einzelpreis</th>
        <th class="num">USt.</th>
        <th class="num">Netto</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="t-row"><span class="muted">Summe netto</span><span>${esc(d.totals.net)}</span></div>
      ${vatRows}
      <div class="t-sum"><b>Gesamtbetrag</b><span class="amount">${esc(d.totals.gross)}</span></div>
    </div>
  </div>

  <div class="pay">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 12.5l2.5 2.5L16 9.5"></path></svg>
    <div>${paymentText}</div>
  </div>

  <div class="closing">Mit freundlichen Grüßen<br><span class="co">${esc(c.name)}</span></div>
  ${d.footerText ? `<div class="note">${multi(d.footerText)}</div>` : ""}
</body>
</html>`;

  // Fußzeile: Chromium rendert sie getrennt vom Inhalt. Schrift und
  // Größe müssen hier ausdrücklich stehen, sonst wird sie winzig.
  const col1 = [c.name, c.street, c.zipCity, [c.phone, c.email].filter(Boolean).join(" · ")];
  const col2 = [
    [c.court, c.hrb].filter(Boolean).join(" · "),
    c.ceo ? `Geschäftsführung: ${c.ceo}` : "",
    c.vatId ? `USt-IdNr.: ${c.vatId}` : "",
    c.taxNo ? `Steuernr.: ${c.taxNo}` : "",
  ];
  const col3 = [c.bank, c.iban ? `IBAN ${c.iban}` : "", c.bic ? `BIC ${c.bic}` : "", c.website];
  const col = (lines: string[], first = false) =>
    `<div style="flex:1;min-width:0">${lines.filter(Boolean).map((l, i) =>
      `<div style="${first && i === 0 ? `font-weight:600;color:${TEXT}` : ""}">${esc(l)}</div>`).join("")}</div>`;

  const footer = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Work Sans', Arial, sans-serif; font-size: 7pt; line-height: 1.55; color: ${MUTED};
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>
  <div style="margin: 0 18mm 0 20mm; border-top: 0.6pt solid #d8d4cf; padding-top: 2.5mm; display: flex; gap: 6mm;">
    ${col(col1, true)}${col(col2)}${col(col3)}
    <div style="flex:none;align-self:flex-end;white-space:nowrap">Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>
  </div>
</body>
</html>`;

  return { body, footer };
}
