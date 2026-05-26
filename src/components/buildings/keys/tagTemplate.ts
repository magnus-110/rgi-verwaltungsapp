import PizZip from "pizzip";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lädt die Word-Vorlage einer Liegenschaft und ersetzt Inline-Platzhalter.
 *
 * Unterstützte Platzhalter (jeweils mit beliebiger Einrückung in der Zeile):
 *   {dot}       → farbiger Punkt "●" in der Farbe des Schlüsseltyps
 *                 (Schriftgröße/Schriftart wird aus der Vorlage übernommen)
 *   {nummer}    → formatierte Nummer, z.B. "1 / 0002 - 01"
 *                 (Formatierung aus der Vorlage übernommen)
 *   {anhaenger} → Kombi-Platzhalter: großer farbiger Punkt + fette Nummer
 *                 (für Rückwärtskompatibilität / Single-Tag-Variante)
 */
export async function downloadFilledTagTemplate(opts: {
  templatePath: string;
  templateName: string;
  tagNumber: string;
  typeName?: string;
  typeColorHex?: string;
  closingPlanNumber?: string | null;
  notes?: string | null;
  propertyNumber?: string | null;
}) {
  const { data, error } = await supabase.storage
    .from("key-files")
    .download(opts.templatePath);
  if (error || !data) throw error ?? new Error("Vorlage konnte nicht geladen werden");

  const buf = await data.arrayBuffer();
  const zip = new PizZip(buf);

  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("Ungültige Word-Datei: word/document.xml fehlt");
  let xml = docXmlFile.asText();

  const color = (opts.typeColorHex ?? "#999999").replace("#", "").toUpperCase();
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Tag-Nummer formatieren: "1/002-01G" -> "1 / 0002 - 01"
  const formatTagNumber = (raw: string): string => {
    const m = raw.match(/^\s*([^/]+)\/([^-\s]+)(?:-([^/\s]+))?\s*$/);
    if (!m) return raw;
    const a = m[1].trim();
    const b = m[2].trim().replace(/\D+$/g, "").padStart(4, "0");
    const c = m[3] ? m[3].trim().replace(/[A-Za-z]+$/g, "") : "";
    return c ? `${a} / ${b} - ${c}` : `${a} / ${b}`;
  };
  const formattedNumber = formatTagNumber(opts.tagNumber);

  // Combo-Run für {anhaenger}: Großer farbiger Punkt + fette Nummer
  const comboRuns =
    `<w:r><w:rPr><w:color w:val="${color}"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr><w:t xml:space="preserve">● </w:t></w:r>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(formattedNumber)}</w:t></w:r>`;

  // 1) Falls Tags von Word in mehrere <w:t> zerschnitten wurden, mergen
  for (const tag of ["{anhaenger}", "{dot}", "{nummer}"]) {
    if (xml.indexOf(tag) === -1) xml = mergeAdjacentRunsForTag(xml, tag);
  }

  // 2) {anhaenger} → kompletter Run-Block ersetzen (mehrere Runs auf einmal)
  let safety = 0;
  while (xml.indexOf("{anhaenger}") !== -1 && safety++ < 50) {
    const run = findRunContaining(xml, "{anhaenger}");
    if (!run) break;
    xml = xml.slice(0, run.start) + comboRuns + xml.slice(run.end);
  }

  // 3) {dot} → Text in "●" ersetzen + Farbe in rPr injizieren,
  //    Formatierung (Größe/Font) der Vorlage bleibt erhalten
  safety = 0;
  while (xml.indexOf("{dot}") !== -1 && safety++ < 50) {
    const run = findRunContaining(xml, "{dot}");
    if (!run) break;
    const runXml = xml.slice(run.start, run.end);
    const replaced = replacePlaceholderInRun(runXml, "{dot}", "●", color);
    xml = xml.slice(0, run.start) + replaced + xml.slice(run.end);
  }

  // 4) {nummer} → nur Text ersetzen, gesamte Formatierung der Vorlage bleibt
  safety = 0;
  while (xml.indexOf("{nummer}") !== -1 && safety++ < 50) {
    const run = findRunContaining(xml, "{nummer}");
    if (!run) break;
    const runXml = xml.slice(run.start, run.end);
    const replaced = replacePlaceholderInRun(runXml, "{nummer}", formattedNumber);
    xml = xml.slice(0, run.start) + replaced + xml.slice(run.end);
  }

  zip.file("word/document.xml", xml);

  const out = zip.generate({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Anhaenger_${opts.tagNumber}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- Helper -----------------------------------------------------------------

function findRunContaining(
  xml: string,
  tag: string,
): { start: number; end: number } | null {
  const tagIdx = xml.indexOf(tag);
  if (tagIdx === -1) return null;
  // Echten <w:r>-Start suchen (nicht <w:rPr>, <w:rFonts>, ...)
  const re = /<w:r(?:\s[^>]*)?>/g;
  let s = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m.index > tagIdx) break;
    s = m.index;
  }
  if (s === -1) return null;
  const e = xml.indexOf("</w:r>", tagIdx);
  if (e === -1) return null;
  return { start: s, end: e + "</w:r>".length };
}

/**
 * Ersetzt im gegebenen <w:r>...</w:r>-Block den Platzhalter durch den Text.
 * Optional wird im <w:rPr> die Schriftfarbe gesetzt/überschrieben.
 */
function replacePlaceholderInRun(
  runXml: string,
  tag: string,
  newText: string,
  forceColor?: string,
): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Text in allen <w:t>-Tags ersetzen
  let out = runXml.replace(
    /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,
    (_full, open, inner, close) => {
      if (!inner.includes(tag)) return _full;
      const newInner = inner.split(tag).join(esc(newText));
      // xml:space preserve sicherstellen, falls Whitespace im Text
      const openEnsured = /xml:space=/.test(open)
        ? open
        : open.replace(/<w:t\b/, '<w:t xml:space="preserve"');
      return `${openEnsured}${newInner}${close}`;
    },
  );

  if (forceColor) {
    // Farbe in <w:rPr> setzen/überschreiben
    if (/<w:rPr>[\s\S]*?<\/w:rPr>/.test(out)) {
      out = out.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (_f, inner) => {
        const cleaned = inner.replace(/<w:color\b[^/]*\/>/g, "");
        return `<w:rPr><w:color w:val="${forceColor}"/>${cleaned}</w:rPr>`;
      });
    } else {
      // Kein rPr vorhanden → einfügen direkt nach <w:r ...>
      out = out.replace(
        /<w:r(\s[^>]*)?>/,
        (_f, attrs) =>
          `<w:r${attrs ?? ""}><w:rPr><w:color w:val="${forceColor}"/></w:rPr>`,
      );
    }
  }
  return out;
}

/**
 * Word splittet Tags wie {anhaenger} oft über mehrere <w:r>-Runs.
 * Diese Funktion sucht innerhalb jedes Paragraphs nach Fragmenten, die
 * zusammengesetzt den Tag ergeben, und mergt die Runs zu einem einzigen.
 */
function mergeAdjacentRunsForTag(xml: string, tag: string): string {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const textMatches = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
    const combined = textMatches.map((m) => m[1]).join("");
    if (!combined.includes(tag)) return paragraph;
    const newRun = `<w:r><w:t xml:space="preserve">${combined}</w:t></w:r>`;
    const pPrMatch = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const openTagMatch = paragraph.match(/^<w:p\b[^>]*>/);
    const openTag = openTagMatch ? openTagMatch[0] : "<w:p>";
    return `${openTag}${pPrMatch ? pPrMatch[0] : ""}${newRun}</w:p>`;
  });
}
