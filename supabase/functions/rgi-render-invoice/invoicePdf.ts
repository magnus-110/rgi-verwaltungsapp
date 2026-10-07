// Zeichnet die RGI-Rechnung direkt als PDF – klassisches Design
// (Geschäftsbrief-Aufbau, Anschrift im Fenster des Umschlags).
//
// Kein Word, kein CloudConvert, kein Zusatzserver: pdf-lib läuft
// direkt in der Supabase-Funktion. Schrift ist Helvetica (in jedem
// PDF-Betrachter vorhanden), Umlaute, €, „“ und – werden unterstützt.
//
// Bei vielen Positionen geht die Tabelle auf weitere Seiten weiter,
// der Tabellenkopf wird wiederholt. Firmenangaben und „Seite x von y“
// stehen unten auf jeder Seite.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "https://esm.sh/pdf-lib@1.17.1";

export interface InvoiceData {
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

// ---------------------------------------------------------------
// Maße und Farben
// ---------------------------------------------------------------

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const LEFT = 20 * MM;          // Lochrand
const RIGHT = PAGE_W - 18 * MM;
const WIDTH = RIGHT - LEFT;
const TOP = PAGE_H - 12 * MM;
const BOTTOM = 32 * MM;        // darunter liegt die Fußzeile

const hex = (h: string) => rgb(
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
);
const ACCENT = hex("#ee7202");
const INK = hex("#2e2c2d");
const TEXT = hex("#4a4849");
const MUTED = hex("#6b6869");
const LINE = hex("#e4e0db");
const RULE = hex("#d8d4cf");
const PAPER = hex("#faf6f1");

// Spalten der Positionstabelle (rechte Kante der Zahlen-Spalten)
const COL_POS = LEFT;
const COL_DESC = LEFT + 9 * MM;
const COL_NET_R = RIGHT;
const COL_VAT_R = RIGHT - 27 * MM;
const COL_PRICE_R = COL_VAT_R - 15 * MM;
const COL_QTY_R = COL_PRICE_R - 25 * MM;
const DESC_W = COL_QTY_R - 25 * MM - COL_DESC;

// ---------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------

/**
 * Helvetica kennt nur den westeuropäischen Zeichensatz. Zeichen, die
 * es nicht gibt (z. B. Emojis), werden ersetzt statt dass die ganze
 * Rechnung scheitert.
 */
function makeSafe(font: PDFFont) {
  const ok = new Map<string, boolean>();
  const replace: Record<string, string> = { " ": " ", " ": " ", "‑": "-", "−": "-", "→": "->" };
  return (s: string) =>
    Array.from(String(s ?? "")).map((ch) => {
      if (ch === "\n" || ch === "\r") return ch;
      if (replace[ch]) return replace[ch];
      if (!ok.has(ch)) {
        try { font.encodeText(ch); ok.set(ch, true); } catch { ok.set(ch, false); }
      }
      return ok.get(ch) ? ch : "?";
    }).join("");
}

/** Bricht Text auf die angegebene Breite um (an Leerzeichen, notfalls hart). */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxW) { line = test; continue; }
      if (line) out.push(line);
      // Ein einzelnes Wort, das zu lang ist, wird hart geteilt.
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > maxW && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > maxW) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

async function fetchLogo(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    // Nur PNG und JPG lassen sich einbetten (kein WebP).
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------
// Rechnung zeichnen
// ---------------------------------------------------------------

export async function buildInvoicePdf(d: InvoiceData, logoUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rechnung ${d.meta.number}`);
  pdf.setAuthor(d.company.name);
  pdf.setLanguage("de-DE");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafe(regular);
  const logo = await fetchLogo(pdf, logoUrl);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const text = (
    s: string, x: number, yy: number,
    o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {},
  ) => {
    const size = o.size ?? 9.6;
    const font = o.font ?? regular;
    const t = safe(s);
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: o.align === "right" ? x - w : x, y: yy, size, font, color: o.color ?? INK });
    return w;
  };
  const hline = (x1: number, x2: number, yy: number, thickness: number, color = LINE) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = TOP;
  };

  const tableHead = () => {
    const size = 7.4;
    const head = (s: string, x: number, align: "left" | "right" = "left") =>
      text(s.toUpperCase(), x, y - size, { size, font: bold, color: TEXT, align });
    head("Pos.", COL_POS);
    head("Beschreibung", COL_DESC);
    head("Menge", COL_QTY_R, "right");
    head("Einzelpreis", COL_PRICE_R, "right");
    head("USt.", COL_VAT_R, "right");
    head("Netto", COL_NET_R, "right");
    y -= size + 2.2 * MM;
    hline(LEFT, RIGHT, y, 1.1, INK);
  };

  /** Neue Seite, falls weniger als `need` Punkte Platz sind. */
  const ensure = (need: number, withHead = false) => {
    if (y - need >= BOTTOM) return;
    newPage();
    if (withHead) tableHead();
  };

  // ---------------- Seite 1: Kopf ----------------
  newPage();

  page.drawRectangle({ x: LEFT, y: y - 3, width: WIDTH, height: 2.4, color: ACCENT });
  y -= 3 + 7 * MM;

  const logoH = 19 * MM;
  if (logo) {
    const w = (logo.width / logo.height) * logoH;
    page.drawImage(logo, { x: RIGHT - w, y: y - logoH, width: w, height: logoH });
  } else {
    text(d.company.name, RIGHT, y - 16, { size: 16, font: bold, color: ACCENT, align: "right" });
  }

  // Anschriftfeld: beginnt 45 mm unter der Blattkante (DIN 5008)
  const addrTop = PAGE_H - 45 * MM;
  const addrW = 85 * MM;
  const sender = [d.company.name, d.company.street, d.company.zipCity].filter(Boolean).join(" · ");
  let senderSize = 6.8;
  while (regular.widthOfTextAtSize(safe(sender), senderSize) > addrW && senderSize > 5) senderSize -= 0.2;
  text(sender, LEFT, addrTop - senderSize, { size: senderSize, color: MUTED });
  page.drawLine({ start: { x: LEFT, y: addrTop - senderSize - 1.2 * MM }, end: { x: LEFT + addrW, y: addrTop - senderSize - 1.2 * MM }, thickness: 0.6, color: RULE });

  let ay = addrTop - senderSize - 4.5 * MM;
  for (const [i, l] of [d.recipient.name, ...d.recipient.lines].filter(Boolean).entries()) {
    for (const part of wrap(safe(l), i === 0 ? bold : regular, 10, addrW)) {
      ay -= 10;
      text(part, LEFT, ay, { size: 10, font: i === 0 ? bold : regular });
      ay -= 5;
    }
  }

  // Rechnungsdaten rechts neben der Anschrift
  const metaRows: [string, string][] = ([
    ["Rechnungsnr.", d.meta.number],
    ["Datum", d.meta.date],
    ["Kundennr.", d.meta.customerNo],
    ["Leistung", d.meta.servicePeriod],
    ...(d.payment === "transfer" && d.meta.dueDate ? [["Fällig am", d.meta.dueDate]] : []),
  ] as [string, string][]).filter(([, v]) => v);
  const metaX = RIGHT - 72 * MM;
  let my = addrTop - 5 * MM;
  metaRows.forEach(([k, v], i) => {
    my -= 9;
    text(k, metaX, my, { size: 9, color: MUTED });
    text(v, RIGHT, my, { size: 9, font: i === 0 ? bold : regular, align: "right" });
    my -= 4.5;
  });

  y = Math.min(ay, my, addrTop - 40 * MM) - 9 * MM;

  // ---------------- Titel und Einleitung ----------------
  text("Rechnung", LEFT, y - 20, { size: 20, font: bold });
  if (d.meta.isDraft) {
    const x = LEFT + bold.widthOfTextAtSize("Rechnung", 20) + 3 * MM;
    const label = "ENTWURF";
    const w = bold.widthOfTextAtSize(label, 8) + 4 * MM;
    page.drawRectangle({ x, y: y - 18, width: w, height: 13, borderColor: ACCENT, borderWidth: 1 });
    text(label, x + 2 * MM, y - 14.5, { size: 8, font: bold, color: ACCENT });
  }
  y -= 20 + 3.5 * MM;

  if (d.intro) {
    for (const l of wrap(safe(d.intro), regular, 9.6, 150 * MM)) {
      y -= 9.6;
      if (l) text(l, LEFT, y, { color: TEXT });
      y -= 4.8;
    }
  }

  // ---------------- Positionen ----------------
  y -= 6 * MM;
  tableHead();

  for (const it of d.items) {
    const mainLines = wrap(safe(it.description), bold, 9.6, DESC_W);
    const subLines = it.detail ? wrap(safe(it.detail), regular, 8.4, DESC_W) : [];
    const rowH = 2.6 * MM * 2 + mainLines.length * 13 + subLines.length * 11;
    ensure(rowH, true);

    const top = y - 2.6 * MM;
    text(String(it.pos), COL_POS, top - 9.6, { color: MUTED });
    text(it.quantity, COL_QTY_R, top - 9.6, { align: "right" });
    text(it.unitPrice, COL_PRICE_R, top - 9.6, { align: "right" });
    text(it.vat, COL_VAT_R, top - 9.6, { align: "right" });
    text(it.net, COL_NET_R, top - 9.6, { align: "right" });

    let ly = top;
    for (const l of mainLines) { ly -= 9.6; text(l, COL_DESC, ly, { font: bold }); ly -= 3.4; }
    for (const l of subLines) { ly -= 8.4; text(l, COL_DESC, ly, { size: 8.4, color: MUTED }); ly -= 2.6; }

    y -= rowH;
    hline(LEFT, RIGHT, y, 0.6);
  }

  // ---------------- Summen ----------------
  const totalsH = 4 * MM + (2 + d.totals.vatLines.length) * 14 + 8 * MM;
  ensure(totalsH);
  y -= 4 * MM;
  const tx = RIGHT - 78 * MM;
  const tRow = (label: string, value: string) => {
    y -= 9.6;
    text(label, tx, y, { color: MUTED });
    text(value, RIGHT, y, { align: "right" });
    y -= 4.4;
  };
  tRow("Summe netto", d.totals.net);
  for (const v of d.totals.vatLines) tRow(v.label, v.amount);
  y -= 1.5 * MM;
  hline(tx, RIGHT, y, 1.1, INK);
  y -= 2.5 * MM + 13;
  text("Gesamtbetrag", tx, y + 1, { font: bold });
  text(d.totals.gross, RIGHT, y, { size: 13, font: bold, align: "right" });

  // ---------------- Zahlungshinweis ----------------
  const payText =
    d.payment === "management"
      ? "Der Rechnungsbetrag wird durch die Hausverwaltung vom Konto der Gemeinschaft überwiesen."
      : d.payment === "withdrawal"
        ? "Der Rechnungsbetrag wird gemäß Verwaltervertrag vom Objektkonto der Gemeinschaft entnommen."
        : `Bitte überweisen Sie den Betrag${d.meta.dueDate ? ` bis zum ${d.meta.dueDate}` : ""} auf das unten genannte Konto` +
          `${d.company.iban ? ` (IBAN ${d.company.iban})` : ""} unter Angabe der Rechnungsnummer.`;
  const payLines = wrap(safe(payText), regular, 9.6, WIDTH - 18 * MM);
  const payH = 3.5 * MM * 2 + payLines.length * 14;
  ensure(7 * MM + payH);
  y -= 7 * MM;
  page.drawRectangle({ x: LEFT, y: y - payH, width: WIDTH, height: payH, color: PAPER });
  // Haken im Kreis
  const cx = LEFT + 5 * MM + 6, cy = y - 3.5 * MM - 6;
  page.drawCircle({ x: cx, y: cy, size: 5.6, borderColor: ACCENT, borderWidth: 1.2 });
  page.drawLine({ start: { x: cx - 2.6, y: cy - 0.2 }, end: { x: cx - 0.8, y: cy - 2 }, thickness: 1.2, color: ACCENT });
  page.drawLine({ start: { x: cx - 0.8, y: cy - 2 }, end: { x: cx + 2.8, y: cy + 2 }, thickness: 1.2, color: ACCENT });
  let py = y - 3.5 * MM;
  for (const l of payLines) { py -= 9.6; text(l, LEFT + 13 * MM, py, { color: TEXT }); py -= 4.4; }
  y -= payH;

  // ---------------- Gruß und Fußtext ----------------
  const noteLines = d.footerText ? wrap(safe(d.footerText), regular, 8.4, WIDTH) : [];
  ensure(6 * MM + 30 + (noteLines.length ? 5 * MM + noteLines.length * 12 : 0));
  y -= 6 * MM + 9.6;
  text("Mit freundlichen Grüßen", LEFT, y, { color: TEXT });
  y -= 14;
  text(d.company.name, LEFT, y, { font: bold });
  if (noteLines.length) {
    y -= 5 * MM;
    for (const l of noteLines) { y -= 8.4; text(l, LEFT, y, { size: 8.4, color: MUTED }); y -= 3.6; }
  }

  // ---------------- Fußzeile auf jeder Seite ----------------
  const c = d.company;
  const cols: string[][] = [
    [c.name, c.street, c.zipCity, [c.phone, c.email].filter(Boolean).join(" · ")],
    [
      [c.court, c.hrb].filter(Boolean).join(" · "),
      c.ceo ? `Geschäftsführung: ${c.ceo}` : "",
      c.vatId ? `USt-IdNr.: ${c.vatId}` : "",
      c.taxNo ? `Steuernr.: ${c.taxNo}` : "",
    ],
    [c.bank, c.iban ? `IBAN ${c.iban}` : "", c.bic ? `BIC ${c.bic}` : "", c.website],
  ].map((col) => col.filter(Boolean));
  const colW = (WIDTH - 24 * MM) / 3;

  pages.forEach((p, i) => {
    page = p;
    const fy = 26 * MM;
    hline(LEFT, RIGHT, fy, 0.6, RULE);
    cols.forEach((lines, ci) => {
      const x = LEFT + ci * (colW + 4 * MM);
      lines.forEach((l, li) => {
        let s = safe(l);
        const f = ci === 0 && li === 0 ? bold : regular;
        while (s.length > 3 && f.widthOfTextAtSize(s, 7) > colW) s = s.slice(0, -2) + "…";
        page.drawText(s, { x, y: fy - 2.5 * MM - 7 - li * 10.5, size: 7, font: f, color: ci === 0 && li === 0 ? TEXT : MUTED });
      });
    });
    const label = `Seite ${i + 1} von ${pages.length}`;
    page.drawText(label, {
      x: RIGHT - regular.widthOfTextAtSize(label, 7), y: fy - 2.5 * MM - 7 - 3 * 10.5,
      size: 7, font: regular, color: MUTED,
    });
  });

  return await pdf.save();
}
