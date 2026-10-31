// E-Mail-Signaturen: Aus wenigen Formularfeldern je Postfach plus den zentralen
// Pflichtangaben (Tabelle email_signature_settings) wird eine HTML-Signatur im
// RGI-Design und eine gleichwertige Textversion erzeugt.
//
// - HTML: tabellenbasiert mit Inline-Styles, damit sie in Outlook, Gmail,
//   Apple Mail und auf dem Handy gleich aussieht. Auf schmalen Bildschirmen
//   rutscht das Logo über den Namen (inline-block + Outlook-Ghost-Table).
// - Text: steht in email_accounts.signature_text (und zusätzlich in
//   signature_html, das Vorlagen und Rundmails nutzen). Sie ist der Text-Teil
//   der Mail und das Erkennungsmerkmal, um die HTML-Signatur einzusetzen.

export interface SignatureFields {
  /** Grußformel, z. B. „Mit freundlichen Grüßen“ */
  greeting: string;
  name: string;
  /** z. B. „Geschäftsführer“ */
  title: string;
  /** z. B. „zert. Verwalter (IHK) nach § 26a WEG“ */
  qualification: string;
  phone: string;
  email: string;
}

export interface SignatureCompany {
  logo_url: string;
  website: string;
  address: string;
  kg_name: string;
  kg_seat: string;
  kg_register: string;
  kg_vat_id: string;
  gp_name: string;
  gp_seat: string;
  gp_register: string;
  managing_directors: string;
}

export const EMPTY_SIGNATURE_FIELDS: SignatureFields = {
  greeting: "Mit freundlichen Grüßen",
  name: "",
  title: "",
  qualification: "",
  phone: "",
  email: "",
};

export const DEFAULT_SIGNATURE_COMPANY: SignatureCompany = {
  logo_url: "https://rgi-immobilien.de/lovable-uploads/4a83f87f-ad41-4d60-9f25-40128b981ab0.png",
  website: "rgi-immobilien.de",
  address: "Vilstalstr. 4 · 87459 Pfronten",
  kg_name: "RGI-Immobilien GmbH & Co. KG",
  kg_seat: "Pfronten",
  kg_register: "Amtsgericht Kempten (Allgäu) HRA 11535",
  kg_vat_id: "DE369781249",
  gp_name: "RGI-Immobilien Verwaltungs GmbH",
  gp_seat: "Pfronten",
  gp_register: "Amtsgericht Kempten (Allgäu) HRB 17733",
  managing_directors: "Regina Göttinger, Andreas Göttinger, Maximilian Göttinger",
};

const C = { orange: "#F08C1F", dark: "#2B2B2B", mid: "#595959", grey: "#999999", line: "#E5E5E5" };
const HEAD = "'Century Gothic', 'Work Sans', Arial, Helvetica, sans-serif";
const BODY = "'Work Sans', Arial, Helvetica, sans-serif";
const T = 'cellpadding="0" cellspacing="0" border="0" role="presentation"';

const esc = (s: string) =>
  (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clean = (s: string | null | undefined) => (s || "").trim();

/** Telefonnummer für tel:-Links, z. B. „08363 / 92 97 973“ → „+4983639297973“. */
export function phoneHref(phone: string): string {
  const raw = clean(phone);
  if (!raw) return "";
  let digits = raw.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  else if (digits.startsWith("0")) digits = "+49" + digits.slice(1);
  return digits;
}

const websiteHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

function roleLine(f: SignatureFields): string {
  return [clean(f.title), clean(f.qualification)].filter(Boolean).join(" · ");
}

function legalLines(c: SignatureCompany): string[] {
  const kg = [
    clean(c.kg_name),
    clean(c.kg_seat) && `Sitz ${clean(c.kg_seat)}`,
    clean(c.kg_register),
    clean(c.kg_vat_id) && `USt-IdNr. ${clean(c.kg_vat_id)}`,
  ].filter(Boolean);
  const gp = [
    clean(c.gp_name) && `Komplementärin: ${clean(c.gp_name)}`,
    clean(c.gp_seat) && `Sitz ${clean(c.gp_seat)}`,
    clean(c.gp_register),
  ].filter(Boolean);
  const lines = [kg.join(" · ")];
  if (gp.length) lines.push(gp.join(" · "));
  if (clean(c.managing_directors)) {
    lines.push(`Geschäftsführer${clean(c.gp_name) ? " der Komplementärin" : ""}: ${clean(c.managing_directors)}`);
  }
  return lines.filter(Boolean);
}

/** Textversion der Signatur (inkl. Grußformel). */
export function renderSignatureText(f: SignatureFields, c: SignatureCompany): string {
  const contact = [
    clean(f.phone) && `Tel. ${clean(f.phone)}`,
    clean(f.email),
    clean(c.website),
  ].filter(Boolean).join(" · ");
  const lines: string[] = [];
  if (clean(f.greeting)) lines.push(clean(f.greeting), "");
  for (const x of [
    clean(f.name),
    roleLine(f),
    // Das Logo trägt den Slogan; in der Textversion steht er als eigene Zeile
    // (außer der Name ist schon „RGI Immobilien“, z. B. beim info@-Postfach).
    /rgi/i.test(clean(f.name)) ? "" : "RGI Immobilien · Verkauf · Vermietung · Verwaltung",
    clean(c.address),
    contact,
  ]) {
    if (x) lines.push(x);
  }
  const legal = legalLines(c);
  if (legal.length) lines.push("", "—", ...legal);
  return lines.join("\n").trim();
}

/** HTML-Version der Signatur (inkl. Grußformel). */
export function renderSignatureHtml(f: SignatureFields, c: SignatureCompany): string {
  const link = `color:${C.dark};text-decoration:none;`;
  const row = (label: string, content: string) =>
    `<tr><td style="padding:0 8px 2px 0;font-family:${BODY};font-size:12px;line-height:18px;color:${C.orange};font-weight:bold;">${label}</td>` +
    `<td style="padding:0 0 2px 0;font-family:${BODY};font-size:12px;line-height:18px;color:${C.dark};">${content}</td></tr>`;

  const rows: string[] = [];
  if (clean(f.phone)) {
    rows.push(row("T", `<a href="tel:${esc(phoneHref(f.phone))}" style="${link}">${esc(clean(f.phone))}</a>`));
  }
  if (clean(f.email)) {
    rows.push(row("E", `<a href="mailto:${esc(clean(f.email))}" style="${link}">${esc(clean(f.email))}</a>`));
  }
  if (clean(c.website)) {
    rows.push(row("W", `<a href="${esc(websiteHref(clean(c.website)))}" style="${link}">${esc(clean(c.website))}</a>`));
  }
  if (clean(c.address)) rows.push(row("A", esc(clean(c.address))));

  const role = roleLine(f);
  const greeting = clean(f.greeting)
    ? `<tr><td style="padding:0 0 14px 0;font-family:${BODY};font-size:14px;line-height:20px;color:${C.dark};">${esc(clean(f.greeting))}</td></tr>`
    : "";
  const logo = clean(c.logo_url)
    ? `<!--[if mso]><table ${T}><tr><td valign="middle" width="190" style="width:190px;"><![endif]-->` +
      `<div style="display:inline-block;vertical-align:middle;width:190px;padding:0 0 10px 0;">` +
      `<a href="${esc(websiteHref(clean(c.website) || "rgi-immobilien.de"))}" style="text-decoration:none;">` +
      `<img src="${esc(clean(c.logo_url))}" width="170" height="64" alt="RGI Immobilien – Verkauf · Vermietung · Verwaltung" style="display:block;width:170px;height:64px;border:0;"></a></div>` +
      `<!--[if mso]></td><td valign="top"><![endif]-->`
    : "";
  const logoEnd = clean(c.logo_url) ? `<!--[if mso]></td></tr></table><![endif]-->` : "";
  const legal = legalLines(c)
    .map((l, i) =>
      i === 0 && clean(c.kg_name)
        ? esc(l).replace(esc(clean(c.kg_name)), `<strong style="color:${C.mid};">${esc(clean(c.kg_name))}</strong>`)
        : esc(l),
    )
    // Nummern nicht mitten im Umbruch trennen
    .map((l) => l.replace(/(USt-IdNr\.|HRA|HRB) /g, "$1&nbsp;"))
    .join("<br>");

  return (
    `<!-- rgi-signatur -->` +
    `<table ${T} style="border-collapse:collapse;width:100%;max-width:640px;">` +
    greeting +
    `<tr><td style="font-size:0;line-height:0;">` +
    logo +
    `<div style="display:inline-block;vertical-align:middle;border-left:3px solid ${C.orange};padding:2px 0 2px 18px;font-size:12px;line-height:18px;">` +
    (clean(f.name)
      ? `<div style="font-family:${HEAD};font-size:17px;line-height:22px;font-weight:bold;color:${C.dark};${role ? "" : "padding-bottom:8px;"}">${esc(clean(f.name))}</div>`
      : "") +
    (role
      ? `<div style="font-family:${BODY};font-size:12px;line-height:18px;color:${C.mid};padding-bottom:8px;">${esc(role)}</div>`
      : "") +
    `<table ${T} style="border-collapse:collapse;">${rows.join("")}</table>` +
    `</div>` +
    logoEnd +
    `</td></tr>` +
    (legal
      ? `<tr><td style="padding:16px 0 0 0;"><table ${T} width="100%" style="border-collapse:collapse;width:100%;max-width:640px;"><tr>` +
        `<td style="border-top:1px solid ${C.line};padding:10px 0 0 0;font-family:${BODY};font-size:10px;line-height:15px;color:${C.grey};">${legal}</td>` +
        `</tr></table></td></tr>`
      : "") +
    `</table>` +
    `<!-- /rgi-signatur -->`
  );
}

/** Liest gespeicherte Felder robust ein (fehlende Felder → Standardwerte). */
export function normalizeSignatureFields(raw: unknown, fallbackEmail = ""): SignatureFields {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof SignatureFields, unknown>>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  return {
    greeting: str(r.greeting, EMPTY_SIGNATURE_FIELDS.greeting),
    name: str(r.name, ""),
    title: str(r.title, ""),
    qualification: str(r.qualification, ""),
    phone: str(r.phone, ""),
    email: str(r.email, fallbackEmail),
  };
}

export function normalizeSignatureCompany(raw: unknown): SignatureCompany {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SIGNATURE_COMPANY };
  (Object.keys(out) as (keyof SignatureCompany)[]).forEach((k) => {
    if (typeof r[k] === "string") out[k] = r[k] as string;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Einfügen beim Versand
// ---------------------------------------------------------------------------

export const QUOTE_RE = /\n*---\s*(?:Ursprüngliche|Weitergeleitete)\s+Nachricht\s*---/;

/** Teilt den Mailtext in eigenen Text (head) und zitierte/weitergeleitete Nachricht (tail). */
export function splitAtQuote(body: string): { head: string; tail: string } {
  const m = body.match(QUOTE_RE);
  if (m && m.index !== undefined) return { head: body.slice(0, m.index), tail: body.slice(m.index) };
  return { head: body, tail: "" };
}

/**
 * Entfernt eine früher als Text eingefügte Signatur aus dem eigenen Text
 * (alte Entwürfe, geplante Mails, Vorbelegungen). Die zitierte Nachricht bleibt unberührt.
 */
export function stripTextSignatures(body: string, signatures: (string | null | undefined)[]): string {
  const { head, tail } = splitAtQuote(body);
  let h = head;
  for (const s of signatures) {
    const sig = clean(s);
    if (!sig) continue;
    const idx = h.lastIndexOf(sig);
    if (idx !== -1 && !h.slice(idx + sig.length).trim()) {
      h = h.slice(0, idx).replace(/\s+$/, "");
    }
  }
  return h === head ? body : h + tail;
}

/**
 * Setzt die Signatur in den Text ein: unter den eigenen Text, aber über eine
 * zitierte/weitergeleitete Nachricht.
 */
export function insertTextSignature(body: string, signatureText: string): string {
  const sig = clean(signatureText);
  if (!sig) return body;
  const { head, tail } = splitAtQuote(body);
  const h = head.replace(/\s+$/, "");
  return (h ? `${h}\n\n` : "") + sig + (tail ? `\n\n${tail.replace(/^\n+/, "")}` : "");
}
