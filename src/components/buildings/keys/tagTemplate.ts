import PizZip from "pizzip";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lädt die Word-Vorlage einer Liegenschaft und ersetzt den Platzhalter
 * {anhaenger} (normaler Inline-Tag) durch:
 *   ●  TAG-NR · Typ · Schließplan · Liegenschaft
 * Der Punkt ● wird in der Farbe des Schlüsseltyps gerendert.
 *
 * Vorteil ggü. raw-xml ({@anhaenger}): Der Platzhalter darf mitten in einer
 * Zeile stehen, mit beliebig vielen Leerzeichen/Tabs davor (für Einrückung).
 *
 * Funktioniert per direktem String-Replace im word/document.xml,
 * statt über docxtemplater. Dadurch keine Paragraph-Restriktion.
 */
export async function downloadFilledTagTemplate(opts: {
  templatePath: string;
  templateName: string;
  tagNumber: string;
  typeName?: string;
  typeColorHex?: string; // z.B. "#3366ff"
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

  // Infotext zusammenbauen
  const infoParts: string[] = [opts.tagNumber];
  if (opts.typeName) infoParts.push(opts.typeName);
  if (opts.closingPlanNumber) infoParts.push(`Schließplan ${opts.closingPlanNumber}`);
  if (opts.propertyNumber) infoParts.push(`Liegenschaft ${opts.propertyNumber}`);
  const infoText = infoParts.join("  ·  ");

  // Inline-Runs: farbiger Punkt + fett Tag-Nummer + Rest
  // Diese Runs ersetzen den Run, der den {anhaenger}-Tag enthält.
  const replacementRuns =
    `<w:r><w:rPr><w:color w:val="${color}"/></w:rPr><w:t xml:space="preserve">● </w:t></w:r>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(opts.tagNumber)}</w:t></w:r>` +
    (infoParts.length > 1
      ? `<w:r><w:t xml:space="preserve">  ·  ${esc(infoParts.slice(1).join("  ·  "))}</w:t></w:r>`
      : "") +
    (opts.notes
      ? `<w:r><w:br/><w:t xml:space="preserve">${esc(opts.notes)}</w:t></w:r>`
      : "");

  // Word splittet Text manchmal über mehrere <w:t> innerhalb eines <w:r>
  // oder sogar über mehrere <w:r>. Wir normalisieren erst: alle benachbarten
  // <w:t>-Inhalte innerhalb eines Paragraphs zusammenführen ist komplex.
  // Pragmatisch: wir suchen den Tag erst innerhalb eines <w:r>...</w:r>
  // und ersetzen diesen Run. Falls Word den Tag zerschnitten hat, geben wir
  // einen klaren Hinweis aus.

  const findRunWithTag = (xmlStr: string): { start: number; end: number } | null => {
    const tagIdx = xmlStr.indexOf("{anhaenger}");
    if (tagIdx === -1) return null;
    // Rückwärts nach echtem <w:r>-Run-Start suchen (nicht <w:rPr>, <w:rFonts> etc.)
    // Echter Run-Start ist "<w:r>" oder "<w:r " (mit Leerzeichen).
    let s = -1;
    const re = /<w:r(?:\s[^>]*)?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xmlStr)) !== null) {
      if (m.index > tagIdx) break;
      s = m.index;
    }
    if (s === -1) return null;
    const e = xmlStr.indexOf("</w:r>", tagIdx);
    if (e === -1) return null;
    return { start: s, end: e + "</w:r>".length };
  };

  // Tag könnte über mehrere Runs verteilt sein -> versuche zuerst, benachbarte
  // <w:t>-Fragmente in einem Paragraph zu mergen, falls nötig.
  if (xml.indexOf("{anhaenger}") === -1) {
    // Versuch: Runs innerhalb desselben Paragraphs mergen
    xml = mergeAdjacentRunsForTag(xml, "{anhaenger}");
  }

  if (xml.indexOf("{anhaenger}") === -1) {
    throw new Error(
      'Platzhalter {anhaenger} nicht gefunden. Bitte in der Word-Vorlage genau "{anhaenger}" schreiben (ohne Sonderformatierung).'
    );
  }

  // Alle Vorkommen ersetzen (es kann z.B. mehrere Etiketten in der Vorlage geben)
  let safety = 0;
  while (xml.indexOf("{anhaenger}") !== -1 && safety < 50) {
    const run = findRunWithTag(xml);
    if (!run) break;
    xml = xml.slice(0, run.start) + replacementRuns + xml.slice(run.end);
    safety++;
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

/**
 * Word splittet Tags wie {anhaenger} oft über mehrere <w:r>-Runs (z.B.
 * wegen Rechtschreibprüfung). Diese Funktion sucht innerhalb jedes Paragraphs
 * nach Fragmenten, die zusammengesetzt den Tag ergeben, und mergt die Runs.
 */
function mergeAdjacentRunsForTag(xml: string, tag: string): string {
  // Sehr einfache Heuristik: pro <w:p>-Block alle Text-Fragmente extrahieren,
  // prüfen, ob der zusammengesetzte Text den Tag enthält, und wenn ja, die
  // betroffenen Runs zu einem zusammenfügen.
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const textMatches = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
    const combined = textMatches.map((m) => m[1]).join("");
    if (!combined.includes(tag)) return paragraph;
    // Tag ist über mehrere Runs verteilt - alle Runs durch einen einzigen ersetzen,
    // der den kombinierten Text enthält.
    // Wir behalten Whitespace bei.
    const newRun = `<w:r><w:t xml:space="preserve">${combined}</w:t></w:r>`;
    // Alle <w:r>...</w:r> im Paragraph entfernen und durch den neuen Run ersetzen,
    // unter Beibehaltung von <w:pPr> falls vorhanden.
    const pPrMatch = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const openTagMatch = paragraph.match(/^<w:p\b[^>]*>/);
    const openTag = openTagMatch ? openTagMatch[0] : "<w:p>";
    return `${openTag}${pPrMatch ? pPrMatch[0] : ""}${newRun}</w:p>`;
  });
}
