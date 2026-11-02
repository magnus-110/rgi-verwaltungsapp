// Elektronische Unterschrift – E-Mails.
// Versand über das App-Postfach info@rgi-immobilien.de (email_accounts), gleiche
// SMTP-Logik wie send-email: Passwort/Host direkt aus email_accounts, Port 465 = SSL,
// sonst STARTTLS. Wie bei send-email wird die gesendete Mail NICHT per IMAP abgelegt,
// sondern in public.emails (Ordner „Gesendet“) + email_attachments gespeichert, damit sie
// im App-Postfach erscheint.
// HTML exakt nach Mockup v03: oranger Balken, Logo rechts, Überschrift, Text, Infobox,
// Button (Outlook-tauglich, table + bgcolor + VML), Papier-Link, Hinweis, Grüße, Fußzeile.
import nodemailer from "npm:nodemailer@6.9.16";
import {
  ABSENDER_ADRESSE,
  DATENSCHUTZ_URL,
  Db,
  FIRMA,
  Fehler,
  LOGO_URL,
  datum,
  pfadSegment,
  zeile,
} from "./basis.ts";

// ---------------------------------------------------------------- Versand

export interface SignMail {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Uint8Array; contentType?: string }[];
  buildingId?: string | null;
}

// deno-lint-ignore no-explicit-any
let kontoCache: any = null;

// deno-lint-ignore no-explicit-any
async function konto(db: Db): Promise<any> {
  if (kontoCache) return kontoCache;
  const { data } = await db.from("email_accounts").select("*").eq("email_address", ABSENDER_ADRESSE).maybeSingle();
  if (!data?.smtp_host) throw new Fehler(500, `E-Mail-Konto ${ABSENDER_ADRESSE} ist nicht eingerichtet.`);
  kontoCache = data;
  return data;
}

/** Postfach-ID des Absenderkontos (für die Zuordnung eingehender Antworten). */
export async function absenderKontoId(db: Db): Promise<string> {
  return (await konto(db)).id;
}

/** Sendet die Mail und legt sie im App-Postfach (Gesendet) ab. Liefert die emails.id. */
export async function sendeMail(db: Db, m: SignMail): Promise<string | null> {
  const acc = await konto(db);
  const transporter = nodemailer.createTransport({
    host: acc.smtp_host,
    port: acc.smtp_port,
    secure: acc.smtp_port === 465,
    auth: { user: acc.smtp_user, pass: acc.smtp_password },
    tls: { rejectUnauthorized: Deno.env.get("SMTP_ALLOW_SELF_SIGNED") === "true" ? false : true },
  });
  const toName = zeile(m.toName ?? "", 120).replace(/["<>]/g, "");
  const info = await transporter.sendMail({
    from: `"${FIRMA.name}" <${acc.email_address}>`,
    to: toName ? `"${toName}" <${m.to}>` : m.to,
    subject: m.subject,
    html: m.html,
    text: m.text,
    attachments: (m.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType ?? "application/pdf",
    })),
  });

  // Ablage im App-Postfach (wie send-email)
  let emailId: string | null = null;
  try {
    const { data: ordner } = await db.from("email_folders").select("id").eq("name", "Gesendet").maybeSingle();
    const { data: row, error } = await db.from("emails").insert({
      account_id: acc.id,
      folder_id: ordner?.id ?? null,
      subject: m.subject,
      from_address: acc.email_address,
      from_name: FIRMA.name,
      to_addresses: [m.to],
      to_names: toName ? [toName] : null,
      body_text: m.text,
      body_html: m.html,
      date: new Date().toISOString(),
      is_read: true,
      has_attachments: (m.attachments?.length ?? 0) > 0,
      message_id: `sent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message_id_header: info?.messageId ?? null,
      building_id: m.buildingId ?? null,
    }).select("id").single();
    if (error) throw error;
    emailId = row.id;
    for (const [i, a] of (m.attachments ?? []).entries()) {
      const p = `${emailId}/${i}_${pfadSegment(a.filename)}`;
      const { error: upErr } = await db.storage.from("email-attachments").upload(p, a.content, {
        contentType: a.contentType ?? "application/pdf",
        upsert: true,
      });
      if (upErr) {
        console.error("[signatur] Anhang nicht abgelegt:", upErr.message);
        continue;
      }
      await db.from("email_attachments").insert({
        email_id: emailId,
        file_name: a.filename,
        file_path: p,
        file_size: a.content.byteLength,
        mime_type: a.contentType ?? "application/pdf",
        is_inline: false,
      });
    }
  } catch (e) {
    console.error("[signatur] Gesendete Mail nicht im Postfach gespeichert:", e);
  }
  return emailId;
}

// ---------------------------------------------------------------- HTML

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const F_TITEL = "'Century Gothic', Questrial, 'Work Sans', Arial, sans-serif";
const F_TEXT = "'Work Sans', Arial, Helvetica, sans-serif";
const C = {
  orange: "#F08C1F",
  button: "#B35300",
  text: "#2B2B2B",
  text2: "#595959",
  grau: "#6B6B6B",
  creme: "#FAFAFA",
  rand: "#E5E5E5",
  hintergrund: "#EDEDEB",
};

export interface Platzhalter {
  name: string;
  anrede?: string | null;
  dokument: string;
  objekt: string;
  frist: string | null; // YYYY-MM-DD
}

export function standardAnrede(name: string, anrede?: string | null): string {
  const a = zeile(anrede ?? "", 120);
  return a || `Guten Tag ${zeile(name, 120)}`;
}

/** Platzhalter im Betreff ersetzen (reiner Text). */
export function betreffErsetzen(vorlage: string, p: Platzhalter): string {
  return zeile(
    vorlage
      .replace(/\{Anrede\}/g, standardAnrede(p.name, p.anrede))
      .replace(/\{Dokument\}/g, p.dokument)
      .replace(/\{Objekt\}/g, p.objekt || "")
      .replace(/\{Frist\}/g, p.frist ? datum(p.frist) : "")
      .replace(/\s+–\s*$/, "")
      .replace(/\s+-\s*$/, ""),
    230,
  );
}

/** Betreff mit Vorgangsnummer am Ende: „… [SIG-2026-0147]“ */
export function mitNummer(betreff: string, nummer: string): string {
  const ohne = betreff.replace(/\s*\[SIG-[^\]]*\]\s*/g, " ").trim();
  return `${ohne} [${nummer}]`;
}

/** Mailtext-Vorlage → HTML-Absätze (Platzhalter ersetzt, alles escaped, Frist fett). */
export function textAbsaetze(vorlage: string, p: Platzhalter): { html: string; text: string } {
  const fristTxt = p.frist ? datum(p.frist) : "";
  const ersetzt = (s: string, html: boolean) => {
    const e = html ? esc : (x: string) => x;
    // erst escapen, dann Platzhalter (deren Werte separat escaped werden)
    let r = e(s);
    r = r.replace(/\{Anrede\}/g, e(standardAnrede(p.name, p.anrede)))
      .replace(/\{Dokument\}/g, e(p.dokument))
      .replace(/\{Objekt\}/g, e(p.objekt || ""))
      .replace(/\{Frist\}/g, html && fristTxt ? `<strong>${e(fristTxt)}</strong>` : e(fristTxt));
    return r;
  };
  const absaetze = vorlage.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((a) => a.trim()).filter(Boolean);
  const html = absaetze
    .map((a) =>
      `<p style="margin:0 0 16px 0;font-family:${F_TEXT};font-size:15px;line-height:24px;color:${C.text};">${
        ersetzt(a, true).replace(/\n/g, "<br>")
      }</p>`
    )
    .join("\n");
  const text = absaetze.map((a) => ersetzt(a, false)).join("\n\n");
  return { html, text };
}

export interface MailBausteine {
  ueberschrift: string;
  absaetze: { html: string; text: string };
  info: [string, string][]; // Infobox-Zeilen
  button?: { text: string; url: string };
  papierUrl?: string;
  hinweis?: string; // kleiner grauer Hinweis
  vorschauText?: string; // unsichtbare Vorschauzeile im Postfach
}

function buttonHtml(text: string, url: string): string {
  const u = esc(url);
  const t = esc(text);
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
  <tr><td align="center" bgcolor="${C.button}" style="border-radius:6px;background-color:${C.button};">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${u}" style="height:48px;v-text-anchor:middle;width:352px;" arcsize="12%" stroke="f" fillcolor="${C.button}">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${t}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <a href="${u}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${F_TEXT};font-size:15px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:6px;background-color:${C.button};border:1px solid ${C.button};">${t}</a>
    <!--<![endif]-->
  </td></tr>
</table>`;
}

/** Komplette HTML-Mail im RGI-Stil (Mockup v03) + Textfassung. */
export function mailHtml(b: MailBausteine): { html: string; text: string } {
  const infoRows = b.info
    .filter(([, v]) => v)
    .map(([k, v]) =>
      `<tr><td style="padding:3px 0;font-family:${F_TEXT};font-size:14px;line-height:20px;color:${C.text};"><span style="color:${C.grau};">${
        esc(k)
      }:</span> ${esc(v)}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(b.ueberschrift)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Questrial&family=Work+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;}
  a{color:${C.button};}
  @media (max-width:620px){ .rgi-wrap{width:100% !important;} .rgi-pad{padding-left:22px !important;padding-right:22px !important;} }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.hintergrund};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(b.vorschauText ?? "")}</div>
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${C.hintergrund}" style="background-color:${C.hintergrund};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="rgi-wrap" width="600" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;">
    <tr><td height="6" bgcolor="${C.orange}" style="height:6px;line-height:6px;font-size:0;background-color:${C.orange};">&nbsp;</td></tr>
    <tr><td class="rgi-pad" align="right" style="padding:28px 36px 0 36px;">
      <img src="${LOGO_URL}" width="130" height="45" alt="RGI Immobilien" style="display:block;width:130px;height:45px;border:0;outline:none;text-decoration:none;">
    </td></tr>
    <tr><td class="rgi-pad" style="padding:22px 36px 0 36px;">
      <h1 style="margin:0 0 22px 0;font-family:${F_TITEL};font-size:22px;line-height:28px;font-weight:700;color:${C.text};">${
    esc(b.ueberschrift)
  }</h1>
      ${b.absaetze.html}
    </td></tr>
    ${
    infoRows
      ? `<tr><td class="rgi-pad" style="padding:4px 36px 0 36px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${C.creme}" style="background-color:${C.creme};border:1px solid ${C.rand};border-radius:10px;">
        <tr><td style="padding:14px 16px;"><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">${infoRows}</table></td></tr>
      </table>
    </td></tr>`
      : ""
  }
    ${
    b.button
      ? `<tr><td class="rgi-pad" align="center" style="padding:18px 36px 0 36px;">${buttonHtml(b.button.text, b.button.url)}</td></tr>`
      : ""
  }
    ${
    b.papierUrl
      ? `<tr><td class="rgi-pad" align="center" style="padding:16px 36px 0 36px;font-family:${F_TEXT};font-size:14px;line-height:20px;">
      <a href="${esc(b.papierUrl)}" target="_blank" style="color:${C.button};text-decoration:underline;">Lieber auf Papier unterschreiben</a>
    </td></tr>`
      : ""
  }
    ${
    b.hinweis
      ? `<tr><td class="rgi-pad" style="padding:20px 36px 0 36px;font-family:${F_TEXT};font-size:12.5px;line-height:20px;color:${C.text2};">${b.hinweis}</td></tr>`
      : ""
  }
    <tr><td class="rgi-pad" style="padding:22px 36px 40px 36px;font-family:${F_TEXT};font-size:15px;line-height:23px;color:${C.text};">
      Mit freundlichen Grüßen<br>Ihre RGI Immobilien
    </td></tr>
    <tr><td style="border-top:1px solid ${C.rand};padding:16px 36px 18px 36px;" align="center">
      <p style="margin:0;font-family:${F_TEXT};font-size:11px;line-height:17px;color:${C.grau};">${
    esc(FIRMA.name)
  } · ${esc(FIRMA.strasse)} · ${esc(FIRMA.ort)} · Tel. ${esc(FIRMA.telefon)} · ${esc(FIRMA.email)}</p>
      <p style="margin:2px 0 0 0;font-family:${F_TEXT};font-size:11px;line-height:17px;"><a href="${DATENSCHUTZ_URL}" target="_blank" style="color:${C.button};text-decoration:underline;">Datenschutzhinweise zur elektronischen Unterschrift</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const hinweisText = (b.hinweis ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const text = [
    b.ueberschrift,
    "",
    b.absaetze.text,
    "",
    ...b.info.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    b.button ? `\n${b.button.text}:\n${b.button.url}` : "",
    b.papierUrl ? `\nLieber auf Papier unterschreiben:\n${b.papierUrl}` : "",
    hinweisText ? `\n${hinweisText}` : "",
    "",
    "Mit freundlichen Grüßen",
    "Ihre RGI Immobilien",
    "",
    "--",
    `${FIRMA.name} · ${FIRMA.strasse} · ${FIRMA.ort} · Tel. ${FIRMA.telefon} · ${FIRMA.email}`,
    `Datenschutzhinweise: ${DATENSCHUTZ_URL}`,
  ].join("\n").replace(/\n{3,}/g, "\n\n");
  return { html, text };
}

const POST_HINWEIS =
  "Wenn Sie lieber auf Papier unterschreiben: Bitte nicht per Post senden. Ein gut lesbares Foto oder ein Scan aller Seiten per E-Mail (einfach auf diese E-Mail antworten) genügt.";

const LINK_HINWEIS = (kopie: boolean) =>
  "Der Link ist persönlich und nur für Sie bestimmt. Bitte leiten Sie diese E-Mail nicht weiter. " +
  "Sie benötigen kein Konto und keine App." +
  (kopie ? " Nach der Unterschrift erhalten Sie das Dokument automatisch per E-Mail." : "");

const dokumentZeile = (titel: string, seiten?: number | null) =>
  seiten ? `${titel} (${seiten} ${seiten === 1 ? "Seite" : "Seiten"})` : titel;

// ---------------------------------------------------------------- Mailarten

export interface Kontext {
  titel: string;
  objekt: string;
  frist: string | null;
  seitenzahl?: number | null;
  nummer: string;
  /** false bei ETV-Protokollen (keine Kopie/Endfassung per Mail) */
  mitKopie: boolean;
}

/** 1) Einladung: Betreff/Text aus der (bearbeiteten) Vorlage, Button + Papier-Link immer angefügt. */
export function einladungMail(
  k: Kontext,
  s: { name: string; anrede?: string | null },
  vorlage: { betreff: string; text: string },
  link: string,
  papier: string,
) {
  const p: Platzhalter = { name: s.name, anrede: s.anrede, dokument: k.titel, objekt: k.objekt, frist: k.frist };
  const subject = mitNummer(betreffErsetzen(vorlage.betreff, p), k.nummer);
  const { html, text } = mailHtml({
    ueberschrift: "Ein Dokument wartet auf Ihre Unterschrift",
    vorschauText: `${k.titel} – bitte bis ${k.frist ? datum(k.frist) : "zeitnah"} unterschreiben`,
    absaetze: textAbsaetze(vorlage.text, p),
    info: [["Dokument", dokumentZeile(k.titel, k.seitenzahl)], ["Objekt", k.objekt], ["Frist", k.frist ? datum(k.frist) : ""]],
    button: { text: "Dokument ansehen & unterschreiben", url: link },
    papierUrl: papier,
    hinweis: `${esc(LINK_HINWEIS(k.mitKopie))}<br><br>${esc(POST_HINWEIS)}`,
  });
  return { subject, html, text };
}

/** 2) Erinnerung (neuer persönlicher Link). */
export function erinnerungMail(
  k: Kontext,
  s: { name: string; anrede?: string | null },
  vorlageBetreff: string,
  link: string,
  papier: string,
) {
  const p: Platzhalter = { name: s.name, anrede: s.anrede, dokument: k.titel, objekt: k.objekt, frist: k.frist };
  const subject = mitNummer(`Erinnerung: ${betreffErsetzen(vorlageBetreff, p)}`, k.nummer);
  const vorlage = k.frist
    ? "{Anrede},\n\nwir möchten Sie freundlich daran erinnern, dass das Dokument „{Dokument}“ noch auf Ihre Unterschrift wartet. Bitte unterschreiben Sie bis zum {Frist}."
    : "{Anrede},\n\nwir möchten Sie freundlich daran erinnern, dass das Dokument „{Dokument}“ noch auf Ihre Unterschrift wartet.";
  const { html, text } = mailHtml({
    ueberschrift: "Ihre Unterschrift fehlt noch",
    vorschauText: `Erinnerung: ${k.titel}`,
    absaetze: textAbsaetze(vorlage + "\n\nBitte verwenden Sie den Link in dieser E-Mail; frühere Links sind nicht mehr gültig.", p),
    info: [["Dokument", dokumentZeile(k.titel, k.seitenzahl)], ["Objekt", k.objekt], ["Frist", k.frist ? datum(k.frist) : ""]],
    button: { text: "Dokument ansehen & unterschreiben", url: link },
    papierUrl: papier,
    hinweis: `${esc(LINK_HINWEIS(k.mitKopie))}<br><br>${esc(POST_HINWEIS)}`,
  });
  return { subject, html, text };
}

/** 3) Kopie sofort nach der Online-Unterschrift (PDF-Anhang). */
export function kopieMail(k: Kontext, s: { name: string; anrede?: string | null }, signedAt: string) {
  const p: Platzhalter = { name: s.name, anrede: s.anrede, dokument: k.titel, objekt: k.objekt, frist: k.frist };
  const subject = mitNummer(`Ihre Unterschrift: ${k.titel}${k.objekt ? ` – ${k.objekt}` : ""}`, k.nummer);
  const { html, text } = mailHtml({
    ueberschrift: "Vielen Dank für Ihre Unterschrift",
    vorschauText: `Ihre Kopie: ${k.titel}`,
    absaetze: textAbsaetze(
      "{Anrede},\n\nvielen Dank – Ihre Unterschrift zum Dokument „{Dokument}“ ist bei uns eingegangen. Im Anhang finden Sie das Dokument mit Ihrer Unterschrift als PDF für Ihre Unterlagen.\n\nSobald alle Beteiligten unterschrieben haben, senden wir Ihnen die Endfassung.",
      p,
    ),
    info: [["Dokument", k.titel], ["Objekt", k.objekt], ["Unterschrieben am", `${datumZeitKurz(signedAt)} Uhr`], [
      "Vorgangs-Nr.",
      k.nummer,
    ]],
    hinweis: esc("Bitte bewahren Sie diese E-Mail mit dem PDF auf. Bei Fragen erreichen Sie uns unter " + FIRMA.telefon + "."),
  });
  return { subject, html, text };
}

/** 4) Endfassung an alle (PDF-Anhang). */
export function endfassungMail(
  k: Kontext,
  s: { name: string; anrede?: string | null },
  abgeschlossen: string,
  anhangZuGross: boolean,
) {
  const p: Platzhalter = { name: s.name, anrede: s.anrede, dokument: k.titel, objekt: k.objekt, frist: k.frist };
  const subject = mitNummer(`Vollständig unterschrieben: ${k.titel}${k.objekt ? ` – ${k.objekt}` : ""}`, k.nummer);
  const { html, text } = mailHtml({
    ueberschrift: "Das Dokument ist vollständig unterschrieben",
    vorschauText: `Endfassung: ${k.titel}`,
    absaetze: textAbsaetze(
      anhangZuGross
        ? "{Anrede},\n\nalle Beteiligten haben das Dokument „{Dokument}“ unterschrieben. Die Endfassung ist für den Versand per E-Mail leider zu groß – bitte melden Sie sich kurz bei uns, dann stellen wir sie Ihnen gern bereit."
        : "{Anrede},\n\nalle Beteiligten haben das Dokument „{Dokument}“ unterschrieben. Im Anhang erhalten Sie die Endfassung mit allen Unterschriften als PDF für Ihre Unterlagen.",
      p,
    ),
    info: [["Dokument", dokumentZeile(k.titel, null)], ["Objekt", k.objekt], [
      "Abgeschlossen am",
      `${datumZeitKurz(abgeschlossen)} Uhr`,
    ], ["Vorgangs-Nr.", k.nummer]],
    hinweis: esc("Bitte bewahren Sie diese E-Mail mit dem PDF auf. Bei Fragen erreichen Sie uns unter " + FIRMA.telefon + "."),
  });
  return { subject, html, text };
}

/** 5) Papier-Unterschrift abgelehnt – bitte erneut (neuer Link). */
export function papierAbgelehntMail(
  k: Kontext,
  s: { name: string; anrede?: string | null },
  grund: string | null,
  link: string,
  papier: string,
) {
  const p: Platzhalter = { name: s.name, anrede: s.anrede, dokument: k.titel, objekt: k.objekt, frist: k.frist };
  const subject = mitNummer(`Bitte erneut unterschreiben: ${k.titel}${k.objekt ? ` – ${k.objekt}` : ""}`, k.nummer);
  const grundTxt = grund ? `\n\nGrund: ${grund.replace(/[{}]/g, "")}` : "";
  const { html, text } = mailHtml({
    ueberschrift: "Bitte unterschreiben Sie erneut",
    vorschauText: `Bitte erneut: ${k.titel}`,
    absaetze: textAbsaetze(
      "{Anrede},\n\nvielen Dank für Ihre Rücksendung. Leider konnten wir Ihre Papier-Unterschrift zum Dokument „{Dokument}“ nicht übernehmen." +
        grundTxt +
        "\n\nBitte unterschreiben Sie erneut – online über den Button oder auf Papier. Wichtig bei Papier: bitte alle Seiten des Dokuments vollständig und gut lesbar zurücksenden." +
        (k.frist ? " Bitte bis zum {Frist}." : ""),
      p,
    ),
    info: [["Dokument", dokumentZeile(k.titel, k.seitenzahl)], ["Objekt", k.objekt], ["Frist", k.frist ? datum(k.frist) : ""]],
    button: { text: "Dokument ansehen & unterschreiben", url: link },
    papierUrl: papier,
    hinweis: `${esc(LINK_HINWEIS(k.mitKopie))}<br><br>${esc(POST_HINWEIS)}`,
  });
  return { subject, html, text };
}

function datumZeitKurz(d: string): string {
  const x = new Date(d);
  return `${datum(x)}, ${x.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })}`;
}
