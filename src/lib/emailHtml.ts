// Wandelt reinen E-Mail-Text in HTML um und macht dabei URLs zu klickbaren
// Links. Wird beim Versand genutzt, damit eingefügte Links beim Empfänger
// direkt anklickbar sind (statt nur als Text zu erscheinen).

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// http(s)://… oder www.… — bis zum nächsten Whitespace/spitzen Klammern/Anführungszeichen
const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

/**
 * Escaped den Text HTML-sicher und wandelt URLs in <a>-Links um.
 * Zeilenumbrüche bleiben über white-space:pre-wrap erhalten.
 */
export function textToHtmlWithLinks(text: string): string {
  if (!text) return "";
  let html = "";
  let last = 0;
  for (const m of text.matchAll(URL_REGEX)) {
    html += escapeHtml(text.slice(last, m.index));
    let url = m[0];
    // Satzzeichen am Ende (z. B. "…siehe https://example.de.") nicht mitverlinken
    const trail = url.match(/[),.;:!?\]}>»"']+$/)?.[0] ?? "";
    if (trail) url = url.slice(0, url.length - trail.length);
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(trail)}`;
    last = (m.index ?? 0) + m[0].length;
  }
  html += escapeHtml(text.slice(last));
  return `<div style="white-space:pre-wrap;font-family:inherit">${html}</div>`;
}
