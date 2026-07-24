import PizZip from "pizzip";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lädt die Word-Vorlage einer Liegenschaft und ersetzt zwei Platzhalter:
 *
 *   {g} → grüner Anhänger (wird mit der formatierten Nummer gefüllt,
 *         wenn die Schlüsseltyp-Farbe grün ist – sonst leer)
 *   {o} → oranger Anhänger (wird mit der formatierten Nummer gefüllt,
 *         wenn die Schlüsseltyp-Farbe orange ist – sonst leer)
 *   {r} → roter Anhänger (wird mit der formatierten Nummer gefüllt,
 *         wenn die Schlüsseltyp-Farbe rot ist – sonst leer)
 *
 * Die Hintergrund-/Schriftfarbe der Platzhalter formatiert der Nutzer
 * selbst in der Word-Vorlage. Wir ersetzen nur den Text.
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

  // Farbe entscheiden: grün, orange oder rot anhand des Hex-Werts.
  // Orange wird VOR Rot geprüft, da Orange sonst als "rötlich" erkannt würde.
  const isGreen = isGreenish(opts.typeColorHex);
  const isOrange = isOrangeish(opts.typeColorHex);
  const isRed = isReddish(opts.typeColorHex) && !isOrange;

  const fillGreen = isGreen;
  const fillOrange = isOrange;
  // Default zu rot, wenn die Farbe keiner Kategorie eindeutig zugeordnet werden kann.
  const fillRed = isRed || (!isGreen && !isOrange && !isRed);

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const greenText = fillGreen ? "GG" : "";
  const orangeText = fillOrange ? "OO" : "";
  const redText = fillRed ? "RR" : "";

  // Wenn ein Farb-Platzhalter nicht befüllt wird, aus der umschließenden
  // Tabellenzelle alle Farb-/Schattierungs-Elemente entfernen (Zellenhintergrund
  // via <w:tcPr><w:shd> sowie Run-Level <w:shd>/<w:color>/<w:highlight>).
  if (!fillGreen) xml = stripPlaceholderColoring(xml, "{g}");
  if (!fillOrange) xml = stripPlaceholderColoring(xml, "{o}");
  if (!fillRed) xml = stripPlaceholderColoring(xml, "{r}");


  xml = replaceSplitPlaceholder(xml, "{g}", greenText);
  xml = replaceSplitPlaceholder(xml, "{o}", orangeText);
  xml = replaceSplitPlaceholder(xml, "{r}", redText);
  xml = replaceSplitPlaceholder(xml, "{nummer}", esc(formattedNumber));

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

function hexToRgb(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = hex.trim().replace("#", "").match(/^([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
function isGreenish(hex?: string): boolean {
  const c = hexToRgb(hex);
  if (!c) return false;
  return c.g > c.r + 20 && c.g > c.b + 20;
}
function isReddish(hex?: string): boolean {
  const c = hexToRgb(hex);
  if (!c) return false;
  return c.r > c.g + 20 && c.r > c.b + 20;
}
function isOrangeish(hex?: string): boolean {
  const c = hexToRgb(hex);
  if (!c) return false;
  // Orange: kräftiges Rot, mittleres Grün, wenig Blau – liegt klar zwischen Rot und Grün.
  // Beispiel #FFA500 → r255 g165 b0. Grenzt gegen reines Rot (niedriges Grün) ab.
  return (
    c.r > 200 &&
    c.g >= 100 && c.g <= 210 &&
    c.b < 100 &&
    c.r - c.g > 40 &&
    c.g - c.b > 40
  );
}

/**
 * Entfernt im <w:r>, der den gegebenen Platzhalter enthält, die Schattierung
 * (<w:shd>) und die Schriftfarbe (<w:color>) aus dem <w:rPr>. Dadurch wird
 * der farbige Hintergrund unsichtbar, wenn der Platzhalter leer bleibt.
 */
function stripRunColoring(xml: string, placeholder: string): string {
  const tagIdx = xml.indexOf(placeholder);
  if (tagIdx === -1) return xml;
  // Run-Start vor dem Tag suchen
  const runRe = /<w:r(?:\s[^>]*)?>/g;
  let runStart = -1;
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(xml)) !== null) {
    if (m.index > tagIdx) break;
    runStart = m.index;
  }
  if (runStart === -1) return xml;
  const runEnd = xml.indexOf("</w:r>", tagIdx);
  if (runEnd === -1) return xml;
  const runXml = xml.slice(runStart, runEnd + "</w:r>".length);
  const cleaned = runXml
    .replace(/<w:shd\b[^/]*\/>/g, "")
    .replace(/<w:color\b[^/]*\/>/g, "")
    .replace(/<w:highlight\b[^/]*\/>/g, "");
  return xml.slice(0, runStart) + cleaned + xml.slice(runEnd + "</w:r>".length);
}

/**
 * Entfernt Farbgebung in der Tabellenzelle, die den gegebenen Platzhalter
 * enthält – sowohl die Zellen-Schattierung (<w:tcPr><w:shd>) als auch
 * alle Run-Shadings/Font-Colors/Highlights innerhalb dieser Zelle.
 * Berücksichtigt verschachtelte Tabellen via Depth-Counter. Fällt auf
 * stripRunColoring zurück, wenn keine umschließende Zelle gefunden wird.
 * Behandelt mehrfaches Vorkommen desselben Platzhalters in mehreren Zellen.
 */
function stripCellColoring(xml: string, placeholder: string): string {
  let cursor = 0;
  let result = xml;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const tagIdx = result.indexOf(placeholder, cursor);
    if (tagIdx === -1) return result;

    // Umschließendes <w:tc> rückwärts suchen (mit Depth-Counter für Nested Tables)
    const openRe = /<w:tc(?:\s[^>]*)?>/g;
    const closeRe = /<\/w:tc>/g;
    const opens: number[] = [];
    let om: RegExpExecArray | null;
    while ((om = openRe.exec(result)) !== null) {
      if (om.index >= tagIdx) break;
      opens.push(om.index);
    }
    const closesBeforeTag: number[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = closeRe.exec(result)) !== null) {
      if (cm.index >= tagIdx) break;
      closesBeforeTag.push(cm.index);
    }
    // Zell-Start = letzter offener, der nach allen bereits geschlossenen liegt.
    // Konkret: Stapel-Verfahren.
    const stack: number[] = [];
    let oi = 0;
    let ci = 0;
    while (oi < opens.length || ci < closesBeforeTag.length) {
      const nextOpen = oi < opens.length ? opens[oi] : Infinity;
      const nextClose = ci < closesBeforeTag.length ? closesBeforeTag[ci] : Infinity;
      if (nextOpen < nextClose) {
        stack.push(nextOpen);
        oi++;
      } else {
        stack.pop();
        ci++;
      }
    }
    const cellStart = stack.length > 0 ? stack[stack.length - 1] : -1;

    if (cellStart === -1) {
      // kein <w:tc> gefunden -> Fallback Run-Level
      result = stripRunColoring(result, placeholder);
      // Fallback bricht die Schleife, da stripRunColoring bereits alle Vorkommen bearbeitet.
      return result;
    }

    // Passendes </w:tc> vorwärts suchen (mit Depth-Counter)
    const afterCellStart = result.indexOf(">", cellStart) + 1;
    let depth = 1;
    let searchFrom = afterCellStart;
    let cellEnd = -1;
    const tagRe = /<w:tc(?:\s[^>]*)?>|<\/w:tc>/g;
    tagRe.lastIndex = searchFrom;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(result)) !== null) {
      if (tm[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          cellEnd = tm.index + "</w:tc>".length;
          break;
        }
      } else {
        depth++;
      }
    }
    if (cellEnd === -1) {
      result = stripRunColoring(result, placeholder);
      return result;
    }

    const cellXml = result.slice(cellStart, cellEnd);
    const cleaned = cellXml
      .replace(/<w:shd\b[^/]*\/>/g, "")
      .replace(/<w:color\b[^/]*\/>/g, "")
      .replace(/<w:highlight\b[^/]*\/>/g, "");
    result = result.slice(0, cellStart) + cleaned + result.slice(cellEnd);
    // Nach der Zelle weitersuchen (Länge kann sich geändert haben)
    cursor = cellStart + cleaned.length;
  }
}

/**
 * Entfernt für jedes Vorkommen des Platzhalters die farbliche Formatierung
 * der umschließenden Tabellenzelle:
 *   - Zellen-Schattierung <w:shd> innerhalb <w:tcPr>
 *   - alle <w:shd>, <w:color>, <w:highlight> in Runs der Zelle
 * Findet Platzhalter auch, wenn Word sie über mehrere <w:r>/<w:t> gesplittet
 * hat. Behandelt mehrfaches Vorkommen und verschachtelte Tabellen (Depth).
 */
function stripPlaceholderColoring(xml: string, placeholder: string): string {
  const cleanFragment = (s: string): string =>
    s
      .replace(/<w:shd\b[^>]*\/>/g, "")
      .replace(/<w:shd\b[^>]*>[\s\S]*?<\/w:shd>/g, "")
      .replace(/<w:color\b[^>]*\/>/g, "")
      .replace(/<w:color\b[^>]*>[\s\S]*?<\/w:color>/g, "")
      .replace(/<w:highlight\b[^>]*\/>/g, "")
      .replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, "");

  const combinedTextInCell = (cellXml: string): string => {
    let out = "";
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cellXml)) !== null) out += m[1];
    return out;
  };

  // Alle <w:tc>…</w:tc>-Bereiche mit korrekter Depth-Handhabung ermitteln.
  const findCells = (src: string): { start: number; end: number }[] => {
    const cells: { start: number; end: number }[] = [];
    const tagRe = /<w:tc(?:\s[^>]*)?>|<\/w:tc>/g;
    const stack: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(src)) !== null) {
      if (m[0].startsWith("</")) {
        const start = stack.pop();
        if (start !== undefined) {
          cells.push({ start, end: m.index + "</w:tc>".length });
        }
      } else {
        stack.push(m.index);
      }
    }

    return cells;
  };

  // Iterativ von hinten nach vorne bereinigen, damit Offsets stabil bleiben.
  const cells = findCells(xml).filter((c) => {
    const cellXml = xml.slice(c.start, c.end);
    return combinedTextInCell(cellXml).includes(placeholder);
  });

  if (cells.length === 0) {
    // Fallback: kein <w:tc> um den Platzhalter (z. B. Fließtext) –
    // wenigstens Run-Level-Farben entfernen.
    let out = xml;
    let idx = 0;
    while ((idx = out.indexOf(placeholder, idx)) !== -1) {
      out = stripRunColoring(out, placeholder);
      idx += placeholder.length;
      if (out.indexOf(placeholder, idx) === -1) break;
    }
    return out;
  }

  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    const cellXml = xml.slice(c.start, c.end);
    const cleaned = cleanFragment(cellXml);
    if (cleaned !== cellXml) {
      xml = xml.slice(0, c.start) + cleaned + xml.slice(c.end);
    }
  }
  return xml;
}


/**
 * Ersetzt einen Platzhalter im document.xml, auch wenn Word ihn über
 * mehrere <w:r>/<w:t>-Runs gesplittet hat. Es wird NUR Text manipuliert –
 * Formatierung (rPr), Tabellen, Absätze und alle anderen Elemente bleiben
 * unverändert. So entsteht garantiert valides OOXML.
 */
function replaceSplitPlaceholder(
  xml: string,
  placeholder: string,
  newText: string,
): string {
  // Wir bauen Text-Knoten aus allen <w:t>-Elementen zusammen und merken
  // uns ihre Position. Dann ersetzen wir Vorkommen des Platzhalters im
  // virtuellen "Gesamttext" und verteilen das Ergebnis zurück auf die
  // ursprünglichen <w:t>-Bereiche.
  const tNodes: { start: number; end: number; text: string }[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const innerStart = m.index + m[0].indexOf(">") + 1;
    const innerEnd = m.index + m[0].length - "</w:t>".length;
    tNodes.push({ start: innerStart, end: innerEnd, text: m[1] });
  }
  if (tNodes.length === 0) return xml;

  // Wenn Platzhalter komplett in einem einzelnen <w:t> liegt → simpler Replace.
  let touched = false;
  for (let i = tNodes.length - 1; i >= 0; i--) {
    const node = tNodes[i];
    if (node.text.includes(placeholder)) {
      const replaced = node.text.split(placeholder).join(newText);
      xml = xml.slice(0, node.start) + replaced + xml.slice(node.end);
      touched = true;
    }
  }
  if (touched) {
    // Restliche evtl. gesplittete Vorkommen prüfen → erneut indexieren.
    return replaceSplitPlaceholder(xml, placeholder, newText);
  }

  // Gesplittete Suche: konkateniere Texte und suche Platzhalter.
  const combined = tNodes.map((n) => n.text).join("");
  const idx = combined.indexOf(placeholder);
  if (idx === -1) return xml;

  // Finde, welche tNodes vom Platzhalter überdeckt werden.
  let cursor = 0;
  let firstNode = -1;
  let lastNode = -1;
  let offsetInFirst = 0;
  let offsetInLastEnd = 0;
  for (let i = 0; i < tNodes.length; i++) {
    const len = tNodes[i].text.length;
    const nodeStart = cursor;
    const nodeEnd = cursor + len;
    if (firstNode === -1 && idx >= nodeStart && idx < nodeEnd) {
      firstNode = i;
      offsetInFirst = idx - nodeStart;
    }
    if (
      idx + placeholder.length > nodeStart &&
      idx + placeholder.length <= nodeEnd
    ) {
      lastNode = i;
      offsetInLastEnd = idx + placeholder.length - nodeStart;
      break;
    }
    cursor = nodeEnd;
  }
  if (firstNode === -1 || lastNode === -1) return xml;

  // Wir lassen die <w:t>-Strukturen intakt:
  // - first Node: Text vor dem Platzhalter + neuer Ersatztext
  // - mittlere Nodes: leeren
  // - last Node: Text nach dem Platzhalter
  // Damit bleibt sämtliche Run-Formatierung erhalten.
  // Von hinten nach vorne ersetzen, damit vorherige Offsets gültig bleiben.
  for (let i = tNodes.length - 1; i >= 0; i--) {
    const node = tNodes[i];
    let replacement: string | null = null;
    if (i === firstNode && i === lastNode) {
      replacement =
        node.text.slice(0, offsetInFirst) +
        newText +
        node.text.slice(offsetInLastEnd);
    } else if (i === firstNode) {
      replacement = node.text.slice(0, offsetInFirst) + newText;
    } else if (i === lastNode) {
      replacement = node.text.slice(offsetInLastEnd);
    } else if (i > firstNode && i < lastNode) {
      replacement = "";
    }
    if (replacement !== null) {
      xml = xml.slice(0, node.start) + replacement + xml.slice(node.end);
    }
  }

  // Weitere Vorkommen rekursiv ersetzen.
  return replaceSplitPlaceholder(xml, placeholder, newText);
}