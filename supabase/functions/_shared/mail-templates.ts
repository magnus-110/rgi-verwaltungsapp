// Vorlagen für die automatischen Mails – im selben Aussehen wie früher bei Make.
const LOGO = "https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/Logo/RGI%20Logo.png";
const ORANGE = "#F27C00";
const APP_URL = "https://rgi-immobilien.app/";

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const p = (html: string, extra = "") =>
  `<p style="margin:12px 0 0 0;font-family:'Work Sans',Arial,sans-serif;font-size:15px;line-height:1.6;color:#4B5563;${extra}">${html}</p>`;

export function button(label: string, href: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px"><tr><td bgcolor="${ORANGE}" style="border-radius:10px;">
<a href="${esc(href)}" style="display:inline-block;padding:14px 22px;font-family:'Work Sans',Arial,sans-serif;font-size:15px;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:10px;background-color:${ORANGE};font-weight:600;">${esc(label)}</a>
</td></tr></table>`;
}

/** Graue Box mit Zeilen „Bezeichnung: Wert“. */
export function infoBox(title: string, rows: [string, unknown][], hint?: string) {
  const zeilen = rows
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:5px 12px 5px 0;font-family:'Work Sans',Arial,sans-serif;font-size:14px;color:#6B7280;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:5px 0;font-family:'Work Sans',Arial,sans-serif;font-size:14px;color:#2F2F2F;font-weight:600;">${esc(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;background-color:#F3F4F6;border-radius:10px;"><tr><td style="padding:16px;">
<p style="margin:0 0 8px 0;font-family:'Century Gothic',Arial,sans-serif;font-size:16px;color:#2F2F2F;font-weight:600;">${esc(title)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">${zeilen}</table>
${hint ? `<p style="margin:10px 0 0 0;font-family:'Work Sans',Arial,sans-serif;font-size:13px;line-height:1.5;color:#6B7280;">${hint}</p>` : ""}
</td></tr></table>`;
}

export function banner(text: string, tone: "ok" | "warn" = "ok") {
  const bg = tone === "ok" ? "#FFF7ED" : "#FEF2F2";
  const fg = tone === "ok" ? "#C2410C" : "#B91C1C";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;background-color:${bg};border-radius:10px;border-left:4px solid ${ORANGE};"><tr><td style="padding:14px 16px;font-family:'Century Gothic',Arial,sans-serif;font-size:15px;color:${fg};font-weight:600;">${esc(text)}</td></tr></table>`;
}

export function list(items: string[]) {
  return `<ul style="margin:12px 0 0 18px;padding:0;font-family:'Work Sans',Arial,sans-serif;font-size:14px;line-height:1.7;color:#374151;">${items
    .map((i) => `<li>${i}</li>`)
    .join("")}</ul>`;
}

/** Rahmen mit Logo, Überschrift, Inhalt, Gruß und Fußzeile. */
export function layout(opts: { title: string; preheader?: string; body: string; greeting?: boolean }) {
  return `<!DOCTYPE html>
<html lang="de"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background-color:#FAF8F6;">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FAF8F6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#FFFFFF;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
<tr><td align="left" style="padding:24px 24px 0 24px;"><img src="${LOGO}" alt="RGI Immobilien" width="160" style="display:block;border:0;height:auto;max-width:160px;"></td></tr>
<tr><td style="padding:16px 24px 8px 24px;">
<h1 style="margin:0;font-family:'Century Gothic',Arial,sans-serif;font-size:24px;line-height:1.3;color:#2F2F2F;font-weight:bold;">${esc(opts.title)}</h1>
${opts.body}
</td></tr>
${
  opts.greeting === false
    ? ""
    : `<tr><td style="padding:20px 24px 28px 24px;"><p style="margin:0;font-family:'Work Sans',Arial,sans-serif;font-size:14px;line-height:1.7;color:#374151;">Mit freundlichen Grüßen,<br><strong style="font-family:'Century Gothic',Arial,sans-serif;font-size:16px;">RGI Immobilien</strong></p></td></tr>`
}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin-top:12px;"><tr><td align="center" style="padding:10px 16px;">
<p style="margin:0;font-family:'Work Sans',Arial,sans-serif;font-size:11px;line-height:1.4;color:#9CA3AF;text-align:center;">RGI-Immobilien GmbH &amp; Co.KG · Sitz: Pfronten<br>Amtsgericht – Registergericht: Kempten (Allgäu) – HRA11535 · USt-IdNr. DE369781249<br>Bankverbindung: VR Bank Augsburg-Ostallgäu eG · BLZ: 72090000 · Konto-Nr.: 262217300</p>
</td></tr></table>
</td></tr></table></body></html>`;
}

const name = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(" ").trim();

// ---------- Konto ----------

export function willkommenWeg(d: { firstName?: string | null; lastName?: string | null; email: string; password: string; neu?: boolean }) {
  const n = name(d.firstName, d.lastName);
  return {
    subject: "Ihre Zugangsdaten - RGI Verwaltungs-App",
    html: layout({
      title: "Ihre Zugangsdaten – RGI Verwaltungs-App",
      preheader: "Meldungen, Dokumente, Versammlungen und mehr – alles zu Ihrer Eigentümergemeinschaft in einer App.",
      body:
        p(`Hallo${n ? " " + esc(n) : ""}, ab sofort haben Sie Zugriff auf die RGI Verwaltungs-App. Dort finden Sie alles rund um Ihre Eigentümergemeinschaft an einem Ort – am Computer und auf dem Smartphone.`) +
        infoBox("Ihre Zugangsdaten", [[d.email.includes("@") ? "E-Mail" : "Benutzername", d.email], ["Passwort", d.password]], d.neu ? "Das bisherige Passwort gilt nicht mehr. Beim ersten Anmelden legen Sie ein eigenes Passwort fest." : "Bitte ändern Sie Ihr Passwort nach dem ersten Login unter <em>Einstellungen</em>.") +
        button("Jetzt zur App", APP_URL) +
        `<p style="margin:24px 0 0 0;font-family:'Century Gothic',Arial,sans-serif;font-size:17px;color:#2F2F2F;font-weight:bold;">Was Sie in der App machen können</p>` +
        list([
          "<strong>Meldungen</strong> – Schäden oder Probleme mit Foto melden und den Stand jederzeit verfolgen",
          "<strong>Dokumente</strong> – Unterlagen Ihrer Gemeinschaft und Ihre persönlichen Dokumente, z. B. Abrechnungen und Wirtschaftspläne",
          "<strong>Versammlungen</strong> – Einladungen, Tagesordnung und Unterlagen zur Eigentümerversammlung",
          "<strong>Beschlüsse</strong> – alle Beschlüsse Ihrer Gemeinschaft zum Nachlesen",
          "<strong>Terminabfragen &amp; Umfragen</strong> – bequem online abstimmen",
          "<strong>Fragen</strong> – sofortige Antworten aus den Unterlagen Ihres Hauses",
          "<strong>Schwarzes Brett</strong> – Aushänge und Neuigkeiten zur Hausgemeinschaft",
          "<strong>Nebenkostenabrechnung für Mieter</strong> – Hilfe, wenn Sie Ihre Wohnung vermieten",
          "<strong>Immobilien von RGI</strong> – aktuelle Angebote und Ihre Suchaufträge",
        ]) +
        p("Bei Neuigkeiten – z. B. einer Antwort auf Ihre Meldung, neuen Dokumenten oder einer Einladung – bekommen Sie automatisch eine E-Mail. Was Sie bekommen möchten, stellen Sie in der App unter <em>Einstellungen › Benachrichtigungen</em> ein.", "font-size:14px;color:#4B5563;"),
    }),
  };
}

export function passwortLink(d: { firstName?: string | null; lastName?: string | null; link: string }) {
  const n = name(d.firstName, d.lastName);
  return {
    subject: "Neues Passwort festlegen - RGI Verwaltungs-App",
    html: layout({
      title: "Neues Passwort festlegen",
      preheader: "So legen Sie ein neues Passwort für die RGI Verwaltungs-App fest.",
      body:
        p(`Hallo${n ? " " + esc(n) : ""}, Sie haben ein neues Passwort für die RGI Verwaltungs-App angefordert. Klicken Sie auf den Knopf und legen Sie Ihr neues Passwort fest.`) +
        button("Neues Passwort festlegen", d.link) +
        p("Der Link gilt aus Sicherheitsgründen nur kurze Zeit und nur einmal. Bis Sie ein neues Passwort festlegen, gilt Ihr bisheriges Passwort weiter.", "font-size:13px;color:#6B7280;") +
        p("Sie haben kein neues Passwort angefordert? Dann können Sie diese E-Mail einfach ignorieren.", "font-size:13px;color:#6B7280;"),
    }),
  };
}

export function emailBestaetigen(d: { firstName?: string | null; lastName?: string | null; newEmail: string; link: string }) {
  const n = name(d.firstName, d.lastName);
  return {
    subject: "Neue E-Mail-Adresse bestätigen - RGI Verwaltungs-App",
    html: layout({
      title: "E-Mail-Adresse bestätigen",
      preheader: "Bitte bestätigen Sie Ihre neue E-Mail-Adresse für die RGI Verwaltungs-App.",
      body:
        p(`Hallo${n ? " " + esc(n) : ""}, Sie haben eine neue E-Mail-Adresse für Ihr Konto in der RGI Verwaltungs-App hinterlegt. Bitte bestätigen Sie diese Änderung.`) +
        infoBox("Neue E-Mail-Adresse", [["Name", n], ["Neue E-Mail", d.newEmail]], "Falls Sie diese Änderung nicht selbst vorgenommen haben, ignorieren Sie bitte diese E-Mail. Ihre bisherige Adresse bleibt dann unverändert.") +
        button("E-Mail-Adresse bestätigen", d.link) +
        p(`Dieser Link ist 24 Stunden gültig. Falls der Knopf nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br><span style="font-family:monospace;color:#6B7280;word-break:break-all;">${esc(d.link)}</span>`, "font-size:12px;color:#9CA3AF;"),
    }),
  };
}

// ---------- Schlüssel ----------

export interface SchluesselDaten {
  borrowerName: string;
  buildingName: string;
  tagLabel?: string | null;
  tagNumber?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  returnedAt?: string | null;
  photoCid?: string | null;
}

const schluesselName = (d: SchluesselDaten) =>
  [d.tagLabel, d.tagNumber ? `(${d.tagNumber})` : null].filter(Boolean).join(" ");

const foto = (d: SchluesselDaten, titel: string) =>
  d.photoCid
    ? `<p style="margin:20px 0 8px 0;font-family:'Century Gothic',Arial,sans-serif;font-size:15px;color:#2F2F2F;font-weight:600;">${esc(titel)}</p><img src="cid:${esc(d.photoCid)}" alt="Foto des Schlüssels" style="display:block;width:100%;max-width:360px;height:auto;border-radius:10px;border:1px solid #E5E7EB;">`
    : "";

export function schluesselAusgabe(d: SchluesselDaten) {
  return {
    subject: `Schlüsselübergabe bestätigt – ${d.buildingName}`,
    html: layout({
      title: "Schlüsselübergabe bestätigt",
      preheader: `Bestätigung der Schlüsselübergabe – ${d.buildingName}`,
      body:
        p(`Hallo ${esc(d.borrowerName)}, hiermit bestätigen wir, dass die Schlüsselübergabe erfolgreich abgeschlossen und der Übergabevertrag digital unterzeichnet wurde.`) +
        banner(`✓ Vertrag unterzeichnet am ${d.issuedAt ?? ""}`) +
        infoBox("Details der Schlüsselübergabe", [
          ["Empfänger", d.borrowerName],
          ["Objekt", d.buildingName],
          ["Schlüssel", schluesselName(d)],
          ["Ausgabedatum", d.issuedAt],
          ["Rückgabe bis", d.dueAt ?? "offen"],
        ]) +
        foto(d, "Foto des übergebenen Schlüssels") +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;border:1px solid #E5E7EB;border-radius:10px;"><tr><td style="padding:16px;font-family:'Work Sans',Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#374151;">
<strong>Unterzeichneter Vertragstext</strong><br>„Hiermit bestätige ich, ${esc(d.borrowerName)}, am ${esc(d.issuedAt)} den oben bezeichneten Schlüssel für das Objekt ${esc(d.buildingName)} von der RGI Immobilien GmbH &amp; Co. KG in einwandfreiem Zustand erhalten zu haben. Ich verpflichte mich, den Schlüssel sorgfältig zu verwahren, nicht an Dritte weiterzugeben und ihn ${d.dueAt ? `spätestens am ${esc(d.dueAt)}` : "auf Anforderung"} zurückzugeben. Bei Verlust oder Beschädigung ist die RGI Immobilien GmbH &amp; Co. KG unverzüglich zu informieren; etwaige Kosten für Ersatz oder den Austausch der Schließanlage trage ich gemäß den gesetzlichen Bestimmungen.“
</td></tr></table>` +
        list([
          "Bitte verwahren Sie den Schlüssel sicher und geben Sie ihn nicht an Dritte weiter.",
          "Bei Verlust oder Beschädigung informieren Sie uns bitte umgehend.",
          "Diese E-Mail dient als Nachweis der erfolgten Übergabe.",
        ]),
    }),
  };
}

export function schluesselErinnerung(d: SchluesselDaten) {
  return {
    subject: `Erinnerung: Schlüsselrückgabe – ${d.buildingName}`,
    html: layout({
      title: "Erinnerung: Schlüsselrückgabe",
      preheader: `Erinnerung zur Schlüsselrückgabe – ${d.buildingName}`,
      body:
        p(`Hallo ${esc(d.borrowerName)}, wir möchten Sie freundlich daran erinnern, dass die Rückgabefrist für den entliehenen Schlüssel abgelaufen ist. Bitte bringen Sie den Schlüssel so bald wie möglich zurück.`) +
        banner(`⚠ Rückgabefrist überschritten – Rückgabe war am ${d.dueAt ?? ""}`, "warn") +
        infoBox("Angaben zum Schlüssel", [
          ["Schlüssel", schluesselName(d)],
          ["Objekt", d.buildingName],
          ["Ausgabe am", d.issuedAt],
          ["Rückgabe fällig", d.dueAt],
        ]) +
        foto(d, "Foto des entliehenen Schlüssels") +
        list([
          "Bitte geben Sie den Schlüssel umgehend bei uns zurück.",
          "Melden Sie sich bei Rückfragen direkt bei Ihrer Verwaltung.",
          "Bei Verlust oder Beschädigung informieren Sie uns bitte sofort – etwaige Kosten für Ersatz oder den Austausch der Schließanlage tragen Sie gemäß den gesetzlichen Bestimmungen.",
        ]),
    }),
  };
}

export function schluesselRueckgabe(d: SchluesselDaten) {
  return {
    subject: `Schlüsselrückgabe bestätigt – ${d.buildingName}`,
    html: layout({
      title: "Schlüsselrückgabe bestätigt",
      preheader: `Schlüsselrückgabe bestätigt – ${d.buildingName}`,
      body:
        p(`Hallo ${esc(d.borrowerName)}, hiermit bestätigen wir den Eingang des zurückgegebenen Schlüssels. Vielen Dank für die Rückgabe.`) +
        banner(`✓ Schlüssel zurückgegeben am ${d.returnedAt ?? ""}`) +
        infoBox("Zusammenfassung der Schlüsselleihe", [
          ["Rückgeber", d.borrowerName],
          ["Objekt", d.buildingName],
          ["Schlüssel", schluesselName(d)],
          ["Ausgabe am", d.issuedAt],
          ["Rückgabe am", d.returnedAt],
        ]) +
        foto(d, "Foto des zurückgegebenen Schlüssels") +
        p("Damit ist die Schlüsselleihe abgeschlossen. Diese E-Mail dient als Nachweis der erfolgten Rückgabe."),
    }),
  };
}

// ---------- Nebenkostenabrechnung ----------

export function nebenkosten(d: {
  recipientName?: string | null;
  jahr?: string | null;
  wohnung?: string | null;
  adresse?: string | null;
  mieter?: string | null;
  saldo?: string | null;
  saldoText?: string | null;
  erstelltAm?: string | null;
  downloadUrl?: string | null;
}) {
  return {
    subject: `Nebenkostenabrechnung ${d.jahr ?? ""} für ${d.adresse ?? ""}`.replace(/\s+/g, " ").trim(),
    html: layout({
      title: `Nebenkostenabrechnung ${d.jahr ?? ""}`.trim(),
      preheader: `Ihre Nebenkostenabrechnung ${d.jahr ?? ""} liegt als PDF bei.`,
      body:
        p(`Hallo${d.recipientName ? " " + esc(d.recipientName) : ""}, im Anhang dieser E-Mail finden Sie die Nebenkostenabrechnung ${esc(d.jahr)} für die Wohnung ${esc(d.wohnung)} in ${esc(d.adresse)} als PDF.`) +
        banner(`✓ Abrechnung erstellt am ${d.erstelltAm ?? ""} – als PDF im Anhang`) +
        infoBox("Details der Abrechnung", [
          ["Mieter", d.mieter],
          ["Objekt", d.adresse],
          ["Wohnung", d.wohnung],
          ["Abrechnungsjahr", d.jahr],
          [`Ergebnis${d.saldoText ? ` (${d.saldoText})` : ""}`, d.saldo],
        ]) +
        (d.downloadUrl ? button("PDF herunterladen", d.downloadUrl) + p("Der Link ist 24 Stunden gültig.", "font-size:13px;color:#6B7280;") : "") +
        `<p style="margin:24px 0 0 0;font-family:'Century Gothic',Arial,sans-serif;font-size:16px;color:#2F2F2F;font-weight:bold;">Wichtige Hinweise</p>` +
        list([
          "Einwendungen gegen diese Abrechnung sind innerhalb von 12 Monaten nach Zugang mitzuteilen (§ 556 Abs. 3 Satz 5 BGB).",
          "Die Abrechnung wurde automatisiert auf Grundlage der gemachten Angaben sowie der WEG-Abrechnung und der Heizkostenabrechnung des Messdienstes erstellt.",
          "Sie stellt keine Rechts- oder Steuerberatung dar.",
        ]),
    }),
  };
}

// ---------- Anfragen ----------

export function neueAnfrage(d: { titel: string; zeilen: [string, unknown][]; link: string; nachricht?: string | null }) {
  return {
    subject: d.titel,
    html: layout({
      title: d.titel,
      greeting: false,
      body:
        p("Über die Website ist eine neue Anfrage eingegangen. Sie liegt in der App im Posteingang unter „Anfragen“.") +
        infoBox("Angaben", d.zeilen) +
        (d.nachricht ? p(`<em>„${esc(d.nachricht)}“</em>`) : "") +
        button("In der App öffnen", d.link),
    }),
  };
}
