import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lädt die Word-Vorlage einer Liegenschaft, ersetzt den Platzhalter
 * {@anhaenger} (raw-xml) durch eine farbig formatierte Zeile mit
 * ●  TAG-NR · Typ · Schließplan-Nr und gibt das fertige Docx zurück.
 *
 * In der Vorlage einfach an gewünschter Stelle schreiben:   {@anhaenger}
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

  // Farbpunkt + Infos als reines OOXML (wird via {@anhaenger} ersetzt)
  const color = (opts.typeColorHex ?? "#999999").replace("#", "").toUpperCase();
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const parts: string[] = [];
  parts.push(
    `<w:r><w:rPr><w:color w:val="${color}"/><w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">● </w:t></w:r>`
  );
  parts.push(
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(opts.tagNumber)}</w:t></w:r>`
  );
  if (opts.typeName) {
    parts.push(
      `<w:r><w:t xml:space="preserve">  ·  ${esc(opts.typeName)}</w:t></w:r>`
    );
  }
  if (opts.closingPlanNumber) {
    parts.push(
      `<w:r><w:t xml:space="preserve">  ·  Schließplan ${esc(opts.closingPlanNumber)}</w:t></w:r>`
    );
  }
  if (opts.propertyNumber) {
    parts.push(
      `<w:r><w:t xml:space="preserve">  ·  Liegenschaft ${esc(opts.propertyNumber)}</w:t></w:r>`
    );
  }
  if (opts.notes) {
    parts.push(
      `<w:r><w:br/><w:t xml:space="preserve">${esc(opts.notes)}</w:t></w:r>`
    );
  }
  // docxtemplater raw-xml ersetzt den umschließenden <w:p>; wir liefern selbst einen Absatz
  const rawXml = `<w:p>${parts.join("")}</w:p>`;

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });

  try {
    doc.render({ anhaenger: rawXml });
  } catch (err: any) {
    const props = err?.properties?.errors?.[0]?.properties ?? err?.properties;
    if (props?.id === "raw_xml_tag_should_be_only_text_in_paragraph") {
      throw new Error(
        'Der Platzhalter {@anhaenger} muss alleine in einer eigenen Zeile stehen (keine weiteren Texte oder Leerzeichen in derselben Zeile). Bitte in der Vorlage eine leere Zeile einfügen und dort nur {@anhaenger} schreiben.'
      );
    }
    throw err;
  }

  const out = doc.getZip().generate({
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
