// E-Mail-Vorlagen für die Benachrichtigungen an Eigentümer.
// Aussehen wie in der App: Creme-Hintergrund, weiße Karte, oranger Streifen,
// Logo mit Bereichs-Schild, Anrede in eigener Zeile, „Mit freundlichen Grüßen“.
// Alles mit Tabellen und Inline-Styles, damit es auch in Outlook passt.
import { esc } from "./mail-templates.ts";

const LOGO = "https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/Logo/RGI%20Logo.png";
const F = "font-family:'Work Sans',Arial,Helvetica,sans-serif;";
const H = "font-family:'Century Gothic',Arial,Helvetica,sans-serif;";
const DUNKEL = "#2B2622";
const GRAU = "#5B534C";
const HELL = "#6B625A";
const KNOPF = "#BA5600";

export interface Mail {
  subject: string;
  html: string;
}

export const absatz = (html: string, extra = "") =>
  `<p style="margin:12px 0 0 0;${F}font-size:16px;line-height:1.6;color:${GRAU};${extra}">${html}</p>`;

export function knopf(text: string, href: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px"><tr><td bgcolor="${KNOPF}" style="border-radius:12px;">
<a href="${esc(href)}" style="display:inline-block;padding:15px 26px;${F}font-size:16px;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:12px;background-color:${KNOPF};font-weight:600;">${esc(text)}</a>
</td></tr></table>`;
}

export function knopfZweit(text: string, href: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:10px"><tr><td style="border-radius:12px;border:1px solid #D8CFC6;">
<a href="${esc(href)}" style="display:inline-block;padding:14px 24px;${F}font-size:16px;line-height:1;color:${DUNKEL};text-decoration:none;border-radius:12px;font-weight:600;">${esc(text)}</a>
</td></tr></table>`;
}

/** Kasten mit Zeilen „Bezeichnung – Wert“. */
export function zeilen(rows: [string, unknown][]) {
  const r = rows
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:11px 12px 11px 0;${i ? "border-top:1px solid #F2ECE6;" : ""}${F}font-size:14px;color:${HELL};vertical-align:top;">${esc(k)}</td><td align="right" style="padding:11px 0;${i ? "border-top:1px solid #F2ECE6;" : ""}${F}font-size:14px;color:${DUNKEL};font-weight:600;vertical-align:top;">${esc(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;border:1px solid #EFE8E1;border-radius:16px;"><tr><td style="padding:6px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${r}</table></td></tr></table>`;
}

/** Heller Hinweis-Kasten (orange getönt). */
export function kasten(innen: string, hell = false) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;background-color:${hell ? "#FAF7F3" : "#FFF1E3"};border-radius:16px;${hell ? "border:1px solid #EFE8E1;" : "border:1px solid #F6D3AE;"}"><tr><td style="padding:16px 18px;">${innen}</td></tr></table>`;
}

export function liste(eintraege: { titel: string; info?: string | null }[]) {
  return eintraege
    .map(
      (e) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;border:1px solid #EFE8E1;border-radius:14px;"><tr>
<td width="52" style="padding:12px 0 12px 14px;vertical-align:middle;"><div style="width:40px;height:40px;border-radius:10px;background-color:#FFF1E3;text-align:center;line-height:40px;${F}font-size:12px;font-weight:700;color:#8A4100;">PDF</div></td>
<td style="padding:12px 14px;vertical-align:middle;"><div style="${F}font-size:15px;font-weight:600;color:${DUNKEL};">${esc(e.titel)}</div>${e.info ? `<div style="${F}font-size:13px;color:${HELL};margin-top:2px;">${esc(e.info)}</div>` : ""}</td>
</tr></table>`,
    )
    .join("");
}

export const zwischen = (text: string) =>
  `<p style="margin:22px 0 0 0;${F}font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8A4100;">${esc(text)}</p>`;

/** Rahmen jeder Benachrichtigung. */
export function rahmen(o: {
  schild: string;
  titel: string;
  vorschau: string;
  anrede: string;
  inhalt: string;
  fuss: string;
}) {
  return `<!DOCTYPE html>
<html lang="de"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><title>${esc(o.titel)}</title></head>
<body style="margin:0;padding:0;background-color:#F6F2ED;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.vorschau)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F6F2ED;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#FFFFFF;border-radius:20px;overflow:hidden;">
<tr><td style="height:5px;line-height:5px;font-size:0;background-color:#EE7202;">&nbsp;</td></tr>
<tr><td style="padding:26px 32px 0 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td><img src="${LOGO}" alt="RGI Immobilien" width="112" style="display:block;border:0;height:auto;width:112px;"></td>
<td align="right"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:#FFF1E3;color:#8A4100;${F}font-size:12px;font-weight:700;">${esc(o.schild)}</span></td>
</tr></table></td></tr>
<tr><td style="padding:26px 32px 8px 32px;">
<h1 style="margin:0;${H}font-size:28px;line-height:1.2;color:${DUNKEL};font-weight:bold;">${esc(o.titel)}</h1>
<p style="margin:16px 0 0 0;${F}font-size:16px;line-height:1.6;color:${DUNKEL};">${esc(o.anrede)}</p>
${o.inhalt}
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;"><p style="margin:0;${F}font-size:15px;line-height:1.6;color:${GRAU};">Mit freundlichen Grüßen<br><strong style="color:${DUNKEL};">RGI Immobilien</strong></p></td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;"><tr><td align="center" style="padding:18px 16px 0 16px;">
<p style="margin:0;${F}font-size:12px;line-height:1.6;color:${HELL};text-align:center;">${o.fuss}<br>RGI-Immobilien GmbH &amp; Co. KG · Sitz: Pfronten · Amtsgericht Kempten (Allgäu) HRA11535</p>
</td></tr></table>
</td></tr></table></body></html>`;
}

export const fussEinstellungen = (link: string) =>
  `Diese E-Mail kommt aus Ihrer RGI-App. <a href="${esc(link)}" style="color:#8A4100;">Benachrichtigungen ändern</a>`;
