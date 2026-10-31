// Setzt in einer HTML-Mail die HTML-Signatur des Postfachs ein.
// Der Text des Editors enthält die Signatur als Text; nach der Umwandlung in
// HTML wird genau diese Stelle durch die HTML-Signatur ersetzt. Steht keine
// Textsignatur im Text, wird die HTML-Signatur unten angehängt.

import { textToHtmlWithLinks } from "./text-to-html.ts";

const MARKER = "<!-- rgi-signatur -->";

export function applyRichSignature(
  html: string,
  textSignatures: (string | null | undefined)[],
  richSignature: string | null | undefined,
): string {
  const rich = (richSignature || "").trim();
  if (!rich) return html;
  if (html.includes(MARKER)) return html;
  for (const raw of textSignatures) {
    const sig = (raw || "").trim();
    if (!sig) continue;
    const asHtml = textToHtmlWithLinks(sig);
    const idx = html.lastIndexOf(asHtml);
    if (idx !== -1) return html.slice(0, idx) + rich + html.slice(idx + asHtml.length);
    const rawIdx = html.lastIndexOf(sig);
    if (rawIdx !== -1) return html.slice(0, rawIdx) + rich + html.slice(rawIdx + sig.length);
  }
  return `${html}<br /><br />${rich}`;
}
