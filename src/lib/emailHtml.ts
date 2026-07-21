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
 * Zeilenumbrüche werden als echte <br>-Tags ausgegeben, damit sie in ALLEN
 * Mail-Clients (auch Outlook) korrekt umbrechen. Vorher wurde nur auf
 * white-space:pre-wrap gesetzt — das ignoriert Outlook, wodurch die komplette
 * Mail zu einem einzigen Fließtext-Block ohne Umbrüche wurde.
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
  // Zeilenumbrüche in <br> wandeln (robust in allen Clients).
  // \r\n und \r zuerst normalisieren, damit keine doppelten Umbrüche entstehen.
  html = html.replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4">${html}</div>`;
}
