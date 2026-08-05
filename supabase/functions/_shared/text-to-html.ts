// Wandelt reinen Text in HTML: escaped, verlinkt URLs und macht aus \n echte
// <br>-Tags. Nötig, weil der Rundmail-Editor reinen Text liefert, der Versand
// aber als HTML erfolgt — sonst gehen alle Zeilenumbrüche verloren.

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

/** Grobe Heuristik: enthält der Text bereits HTML-Markup? */
export function looksLikeHtml(text: string): boolean {
  return /<(br|p|div|table|ul|ol|li|a|span|strong|em|h[1-6]|img)\b[^>]*>/i.test(text);
}

export function textToHtmlWithLinks(text: string): string {
  if (!text) return "";
  let html = "";
  let last = 0;
  for (const m of text.matchAll(URL_REGEX)) {
    html += escapeHtml(text.slice(last, m.index));
    let url = m[0];
    const trail = url.match(/[),.;:!?\]}>»"']+$/)?.[0] ?? "";
    if (trail) url = url.slice(0, url.length - trail.length);
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(trail)}`;
    last = (m.index ?? 0) + m[0].length;
  }
  html += escapeHtml(text.slice(last));
  return html.replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
}

/**
 * Sorgt dafür, dass der übergebene Text als HTML korrekt umbricht.
 * Bereits vorhandenes HTML bleibt unverändert.
 */
export function ensureHtmlBody(text: string): string {
  if (!text) return "";
  const inner = looksLikeHtml(text) ? text : textToHtmlWithLinks(text);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4">${inner}</div>`;
}
