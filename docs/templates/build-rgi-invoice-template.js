// RGI Immobilien - Rechnungsvorlage (Word / docxtemplater)
//
// Erzeugt RGI_Rechnung_Vorlage.docx im RGI Corporate Design. Die
// fertige Datei wird in RGI Intern unter "Word-Vorlagen" hochgeladen
// und dann in der Rechnung ausgewaehlt.
//
// Ausfuehren:
//   node docs/templates/build-rgi-invoice-template.js
//
// Erwartet rgi-logo.png (728 x 274, transparent) im selben Ordner -
// die Datei liegt im rgi-design-Skill unter assets/rgi-logo.png.
// Braucht das npm-Paket "docx".
//
// Die Platzhalter sind in RGI_Rechnungsvorlage_Platzhalter.md
// dokumentiert.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, Header, Footer,
  VerticalAlign, PageNumber, convertMillimetersToTwip,
} = require("docx");

const HEAD = "Century Gothic";
const BODY = "Work Sans";

const ORANGE = "F08C1F";
const ORANGE_L = "E8893A";
const ANTHRA = "2B2B2B";
const ANTHRA_M = "595959";
const GREY = "888888";
const GREY_L = "999999";
const CREME = "FAFAFA";
const LINE = "E4E4E4";
const WHITE = "FFFFFF";

const cm = (v) => Math.round(v * 566.93);

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = {
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
};

// ---------- kleine Helfer ----------
const t = (text, o = {}) => new TextRun({
  text, font: o.font || BODY, size: o.size || 20,
  color: o.color || ANTHRA, bold: !!o.bold, allCaps: !!o.caps,
  characterSpacing: o.spacing,
});

const p = (runs, o = {}) => new Paragraph({
  children: Array.isArray(runs) ? runs : [runs],
  alignment: o.align,
  spacing: { before: o.before || 0, after: o.after === undefined ? 0 : o.after, line: o.line || 260 },
  border: o.border,
  indent: o.indent,
});

const spacer = (h = 120) => new Paragraph({ children: [], spacing: { after: h, line: 120 } });

const cell = (children, o = {}) => new TableCell({
  children,
  width: { size: o.width, type: WidthType.DXA },
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
  margins: {
    top: o.mt === undefined ? 60 : o.mt,
    bottom: o.mb === undefined ? 60 : o.mb,
    left: o.ml === undefined ? 90 : o.ml,
    right: o.mr === undefined ? 90 : o.mr,
  },
  verticalAlign: o.valign || VerticalAlign.TOP,
  borders: o.borders || noBorders,
  columnSpan: o.span,
});

// ---------- Seitenmaße ----------
// A4 mit Fensterumschlag-tauglichem linken Rand.
const MARGIN_L = cm(2.5);
const MARGIN_R = cm(2.0);
const CONTENT = cm(21.0) - MARGIN_L - MARGIN_R; // 9354 dxa = 16,5 cm

// ---------- Logo ----------
const logoData = fs.readFileSync(path.join(__dirname, "rgi-logo.png"));
const pngW = logoData.readUInt32BE(16);
const pngH = logoData.readUInt32BE(20);
const logoWidthPx = 170;                                     // 4,5 cm @ 96 dpi
const logoHeightPx = Math.round(logoWidthPx * pngH / pngW);  // proportional

// ================= KOPFZEILE =================
const header = new Header({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 6 } },
      children: [
        new ImageRun({
          type: "png",
          data: logoData,
          transformation: { width: logoWidthPx, height: logoHeightPx },
          altText: { title: "RGI Logo", description: "RGI Immobilien Logo", name: "RGILogo" },
        }),
      ],
    }),
  ],
});

// ================= FUSSZEILE =================
const footer = new Footer({
  children: [
    p([t("RGI Immobilien GmbH & Co. KG  ·  Vilstalstr. 4  ·  87459 Pfronten  ·  Tel. 08363 / 960656  ·  info@rgi-immobilien.de",
      { size: 15, color: GREY_L })],
      {
        align: AlignmentType.CENTER, after: 20, line: 200,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 6 } },
      }),
    p([t("{firma.bank}  ·  IBAN {firma.iban}  ·  BIC {firma.bic}  ·  USt-IdNr. {firma.ustid}  ·  Steuernr. {firma.steuernr}",
      { size: 15, color: GREY_L })], { align: AlignmentType.CENTER, after: 20, line: 200 }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 200 },
      children: [
        new TextRun({ text: "Seite ", font: BODY, size: 15, color: GREY_L }),
        new TextRun({ children: [PageNumber.CURRENT], font: BODY, size: 15, color: GREY_L }),
        new TextRun({ text: " von ", font: BODY, size: 15, color: GREY_L }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: BODY, size: 15, color: GREY_L }),
      ],
    }),
  ],
});

// ================= ANSCHRIFT + INFOBLOCK =================
const W_ADDR = cm(9.6);
const W_INFO = CONTENT - W_ADDR;

// Innere Tabelle des Infoblocks: Label | Wert
const infoRow = (label, value, o = {}) => new TableRow({
  children: [
    cell([p([t(label, { size: 16, color: GREY })], { line: 220 })],
      { width: cm(2.9), ml: 0, mr: 60, mt: 30, mb: 30 }),
    cell([p([t(value, { size: 17, color: ANTHRA, bold: !!o.bold })], { line: 220, align: AlignmentType.RIGHT })],
      { width: W_INFO - cm(2.9) - 300, ml: 0, mr: 0, mt: 30, mb: 30 }),
  ],
});

const infoTable = new Table({
  width: { size: W_INFO - 300, type: WidthType.DXA },
  columnWidths: [cm(2.9), W_INFO - cm(2.9) - 300],
  borders: noBorders,
  rows: [
    infoRow("Rechnung", "{rechnung.nummer}", { bold: true }),
    infoRow("Datum", "{rechnung.datum}"),
    infoRow("Kundennr.", "{kunde.kundennr}"),
    infoRow("Leistung", "{rechnung.leistungszeitraum}"),
    // Zahlungsziel nur, wenn die Rechnung NICHT per Selbstentnahme beglichen wird
    new TableRow({
      children: [
        cell([p([t("{^entnahme}Fällig", { size: 16, color: GREY })], { line: 220 })],
          { width: cm(2.9), ml: 0, mr: 60, mt: 30, mb: 30 }),
        cell([p([t("{rechnung.faellig}{/entnahme}", { size: 17, color: ANTHRA })], { line: 220, align: AlignmentType.RIGHT })],
          { width: W_INFO - cm(2.9) - 300, ml: 0, mr: 0, mt: 30, mb: 30 }),
      ],
    }),
  ],
});

const addressBlock = new Table({
  width: { size: CONTENT, type: WidthType.DXA },
  columnWidths: [W_ADDR, W_INFO],
  borders: noBorders,
  rows: [
    new TableRow({
      children: [
        cell([
          p([t("RGI Immobilien GmbH & Co. KG · Vilstalstr. 4 · 87459 Pfronten", { size: 13, color: GREY_L })],
            {
              after: 200, line: 200,
              border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE, space: 3 } },
            }),
          p([t("{kunde.name}", { size: 21 })], { after: 0, line: 260 }),
          p([t("{kunde.strasse}", { size: 21 })], { after: 0, line: 260 }),
          p([t("{kunde.plz} {kunde.ort}", { size: 21 })], { after: 0, line: 260 }),
        ], { width: W_ADDR, ml: 0, mr: cm(0.6), mt: 0, mb: 0 }),
        cell([infoTable], { width: W_INFO, fill: CREME, ml: 150, mr: 150, mt: 150, mb: 150 }),
      ],
    }),
  ],
});

// ================= POSITIONSTABELLE =================
const COLS = [cm(0.85), cm(6.35), cm(1.5), cm(1.95), cm(2.25), cm(1.05), cm(2.55)];
const colSum = COLS.reduce((a, b) => a + b, 0);
COLS[1] += CONTENT - colSum; // Beschreibung nimmt die Restbreite auf

const headCell = (text, align) => cell(
  [p([t(text, { font: HEAD, size: 15, bold: true, color: WHITE })], { align, line: 210 })],
  { width: 0, fill: ORANGE_L, mt: 90, mb: 90, ml: 70, mr: 70 },
);

const headRow = new TableRow({
  tableHeader: true,
  children: [
    headCell("Nr.", AlignmentType.LEFT),
    headCell("Beschreibung", AlignmentType.LEFT),
    headCell("Menge", AlignmentType.RIGHT),
    headCell("Einheit", AlignmentType.LEFT),
    headCell("Einzelpreis", AlignmentType.RIGHT),
    headCell("USt", AlignmentType.RIGHT),
    headCell("Betrag netto", AlignmentType.RIGHT),
  ],
});

const rowBorders = {
  top: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
};

const bodyCell = (text, align, o = {}) => cell(
  [p([t(text, { size: 19, color: o.color || ANTHRA })], { align, line: 240 })],
  { width: 0, mt: 95, mb: 95, ml: 70, mr: 70, borders: rowBorders },
);

const loopRow = new TableRow({
  children: [
    bodyCell("{#positionen}{nr}", AlignmentType.LEFT, { color: GREY }),
    bodyCell("{beschreibung}", AlignmentType.LEFT),
    bodyCell("{menge}", AlignmentType.RIGHT),
    bodyCell("{einheit}", AlignmentType.LEFT),
    bodyCell("{einzelpreis}", AlignmentType.RIGHT),
    bodyCell("{ust}", AlignmentType.RIGHT, { color: GREY }),
    bodyCell("{netto}{/positionen}", AlignmentType.RIGHT),
  ],
});

const itemsTable = new Table({
  width: { size: CONTENT, type: WidthType.DXA },
  columnWidths: COLS,
  borders: noBorders,
  rows: [headRow, loopRow],
});

// ================= SUMMENBLOCK =================
const W_SUM = cm(7.4);
const W_SUM_L = cm(4.3);
const W_SUM_R = W_SUM - W_SUM_L;

const sumRow = (label, value, o = {}) => new TableRow({
  cantSplit: true,
  children: [
    cell([p([t(label, { size: o.size || 19, bold: !!o.bold, color: o.color || ANTHRA_M })], { line: 240 })],
      {
        width: W_SUM_L, ml: 0, mr: 60, mt: o.pad || 70, mb: o.pad || 70,
        borders: o.borders || noBorders,
      }),
    cell([p([t(value, { size: o.size || 19, bold: !!o.bold, color: o.color || ANTHRA })], { line: 240, align: AlignmentType.RIGHT })],
      {
        width: W_SUM_R, ml: 60, mr: 0, mt: o.pad || 70, mb: o.pad || 70,
        borders: o.borders || noBorders,
      }),
  ],
});

const topLine = {
  top: { style: BorderStyle.SINGLE, size: 8, color: ORANGE },
  bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
};
const thinLine = {
  top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
  bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
};

const totalsTable = new Table({
  width: { size: W_SUM, type: WidthType.DXA },
  columnWidths: [W_SUM_L, W_SUM_R],
  alignment: AlignmentType.RIGHT,
  indent: { size: CONTENT - W_SUM, type: WidthType.DXA },
  borders: noBorders,
  rows: [
    sumRow("Zwischensumme netto", "{summe.netto}"),
    sumRow("zzgl. Umsatzsteuer", "{summe.ust}", { borders: thinLine }),
    sumRow("Gesamtbetrag", "{summe.brutto}", { bold: true, size: 23, color: ANTHRA, borders: topLine, pad: 110 }),
  ],
});

// ================= ZAHLUNGSHINWEIS =================
const payBoxBorders = {
  top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER,
  left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE },
};

const payBox = new Table({
  width: { size: CONTENT, type: WidthType.DXA },
  columnWidths: [CONTENT],
  borders: noBorders,
  rows: [
    new TableRow({
      cantSplit: true,
      children: [
        cell([
          p([t("Zahlung", { font: HEAD, size: 17, bold: true, color: ORANGE_L })], { after: 60, line: 220 }),

          // Variante A – Ueberweisung. Greift, solange kein Entnahme-Kennzeichen gesetzt ist.
          p([t("{^entnahme}", { size: 2 })], { after: 0, line: 20 }),
          p([t("Bitte überweisen Sie den Gesamtbetrag bis zum {rechnung.faellig} ohne Abzug auf das folgende Konto:", { size: 18 })],
            { after: 40, line: 240 }),
          p([t("{firma.bank}  ·  IBAN {firma.iban}  ·  BIC {firma.bic}", { size: 18, bold: true })],
            { after: 60, line: 240 }),
          p([t("Bitte geben Sie bei Zahlungen die Rechnungsnummer {rechnung.nummer} an.", { size: 16, color: GREY })],
            { after: 0, line: 220 }),
          p([t("{/entnahme}", { size: 2 })], { after: 0, line: 20 }),

          // Variante B – Selbstentnahme vom Objektkonto.
          p([t("{#entnahme}", { size: 2 })], { after: 0, line: 20 }),
          p([t("Der Gesamtbetrag wird gemäß Verwaltervertrag vom Objektkonto entnommen. Eine Überweisung ist nicht erforderlich.", { size: 18 })],
            { after: 0, line: 240 }),
          p([t("{/entnahme}", { size: 2 })], { after: 0, line: 20 }),
        ], { width: CONTENT, fill: CREME, ml: 220, mr: 200, mt: 130, mb: 130, borders: payBoxBorders }),
      ],
    }),
  ],
});

// ================= DOKUMENT =================
const doc = new Document({
  creator: "RGI Immobilien GmbH & Co. KG",
  title: "RGI Rechnungsvorlage",
  description: "Word-Vorlage für Ausgangsrechnungen (docxtemplater-Platzhalter)",
  styles: {
    default: {
      document: { run: { font: BODY, size: 20, color: ANTHRA } },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: cm(2.9), bottom: cm(2.0), left: MARGIN_L, right: MARGIN_R,
          header: cm(0.9), footer: cm(0.9),
        },
      },
    },
    headers: { default: header },
    footers: { default: footer },
    children: [
      spacer(60),
      addressBlock,

      spacer(220),
      // Betreff
      p([t("Rechnung {rechnung.nummer}", { font: HEAD, size: 28, bold: true, color: ORANGE })],
        { after: 40, line: 300 }),
      p([t("{rechnung.projekt}", { size: 18, color: GREY })], { after: 220, line: 240 }),

      // Einleitungstext
      p([t("{rechnung.intro}", { size: 20 })], { after: 220, line: 285 }),

      itemsTable,
      spacer(160),
      totalsTable,
      spacer(180),
      payBox,
      spacer(220),

      // Fußtext
      p([t("{rechnung.footer}", { size: 18, color: ANTHRA_M })], { after: 280, line: 270 }),

      p([t("Mit freundlichen Grüßen", { size: 20 })], { after: 340, line: 260 }),
      p([t("{firma.name}", { size: 20, bold: true })], { after: 0, line: 240 }),
      p([t("{firma.geschaeftsfuehrer}", { size: 17, color: GREY })], { after: 0, line: 240 }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "RGI_Rechnung_Vorlage.docx");
  fs.writeFileSync(out, buf);
  console.log("geschrieben:", out, buf.length, "bytes");
});
