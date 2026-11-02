// Elektronische Unterschrift – Grundlagen, die sign-request und sign-public teilen:
// Konstanten (App-Adresse, Firmendaten, Pfade), Token, Formatierung, Prüfungen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

/** Öffentliche Adresse der VerwaltungsApp (wie in den übrigen App-Mails). */
export const APP_URL = "https://rgi-immobilien.app";
export const DATENSCHUTZ_URL = "https://rgi-immobilien.app/legal/datenschutz";
export const LOGO_URL =
  "https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/Logo/email/rgi-logo-mail.png";

export const FIRMA = {
  name: "RGI Immobilien GmbH & Co. KG",
  kurz: "RGI Immobilien",
  strasse: "Vilstalstr. 4",
  ort: "87459 Pfronten",
  telefon: "08363 / 960656",
  email: "info@rgi-immobilien.de",
};
export const FIRMA_ZEILE =
  `${FIRMA.name} · ${FIRMA.strasse} · ${FIRMA.ort} · Tel. ${FIRMA.telefon} · ${FIRMA.email}`;

/** Absender-/Rücksendepostfach (ENTSCHEIDUNGEN Nr. 3). */
export const ABSENDER_ADRESSE = "info@rgi-immobilien.de";

export const BUCKET = "building-files";
export const TZ = "Europe/Berlin";
export const TOKEN_TAGE = 14;

export const pfad = {
  ordner: (id: string) => `_signaturen/${id}`,
  quelle: (id: string) => `_signaturen/${id}/quelle.pdf`,
  kopie: (id: string, signerId: string) => `_signaturen/${id}/kopie-${signerId}.pdf`,
  papier: (id: string, signerId: string) => `_signaturen/${id}/papier-${signerId}.pdf`,
  final: (id: string) => `_signaturen/${id}/final.pdf`,
  nachweis: (id: string) => `_signaturen/${id}/nachweis.pdf`,
};

/** DMS-Ordner (building_file_categories.slug) je Dokumentart. */
export const DMS_SLUG: Record<string, string> = {
  verwaltervertrag: "stammakte-verwaltervertrag",
  protokoll: "versammlung-protokolle",
  vollmacht: "versammlung",
  umlaufbeschluss: "versammlung-beschluesse",
  angebot: "dienstleister-angebote",
  dienstleistervertrag: "dienstleister-wartung",
  abnahme: "dienstleister-pruefberichte",
  sonstiges: "schriftverkehr",
};

export const DOKUMENTARTEN = Object.keys(DMS_SLUG);
export const TYPEN = ["ausgehend", "eingehend", "etv_protokoll"];
export const QUELLE_TYPEN = ["building_file", "email_attachment", "offer", "contract", "etv_meeting", "upload"];
export const ROLLE_KEYS = ["leiter", "protokollant", "eigentuemer", "beirat"];

/** Versandweg je Unterzeichner: Einladung per E-Mail oder nur Link (Büro verschickt selbst). */
export const VERSAND = ["mail", "link"];

/** Unterzeichner-Status, die als „erledigt“ gelten. */
export const ERLEDIGT = ["unterschrieben", "papier_uebernommen"];
/** Unterzeichner-Status, in denen online unterschrieben werden darf. */
export const UNTERSCHREIBBAR = ["offen", "geoeffnet", "abgelehnt"];

export const QUELLE_TEXT: Record<string, string> = {
  building_file: "aus DMS",
  email_attachment: "aus E-Mail-Anhang",
  offer: "aus Angebot",
  contract: "aus Vertrag",
  etv_meeting: "aus Eigentümerversammlung",
  upload: "aus Upload",
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Fachlicher Fehler mit HTTP-Status und deutscher Meldung für die Oberfläche. */
export class Fehler extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// deno-lint-ignore no-explicit-any
export type Db = any;

export function adminClient(): Db {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------- Token

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Neuer Link-Token: 24 Zufallsbytes als Hex (48 Zeichen). Gespeichert wird nur der Hash. */
export async function neuerToken(): Promise<{ token: string; hash: string; expires_at: string }> {
  const token = hex(crypto.getRandomValues(new Uint8Array(24)));
  return {
    token,
    hash: await sha256Hex(new TextEncoder().encode(token)),
    expires_at: new Date(Date.now() + TOKEN_TAGE * 86400_000).toISOString(),
  };
}

export const TOKEN_RE = /^[0-9a-f]{48}$/;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export const signLink = (token: string) => `${APP_URL}/unterschreiben/${token}`;
export const papierLink = (token: string) => `${APP_URL}/unterschreiben/${token}?papier=1`;

// ---------------------------------------------------------------- Formatierung

/** TT.MM.JJJJ (deutsche Zeit) */
export function datum(d: string | Date | null | undefined): string {
  if (!d) return "";
  // Reines Datum (YYYY-MM-DD) nicht durch Zeitzonen verschieben
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, t] = d.split("-");
    return `${t}.${m}.${y}`;
  }
  return new Date(d).toLocaleDateString("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** TT.MM.JJJJ, HH:MM (deutsche Zeit) */
export function datumZeit(d: string | Date | null | undefined, sekunden = false): string {
  if (!d) return "";
  const x = new Date(d);
  const t = x.toLocaleTimeString("de-DE", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    ...(sekunden ? { second: "2-digit" } : {}),
  });
  return `${datum(x)}, ${t}`;
}

/** Heutiges Datum in deutscher Zeit als YYYY-MM-DD */
export function heuteIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

export function addTage(iso: string, tage: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Objekt-Bezeichnung „WEG Musterstraße 12, 87459 Pfronten“ */
// deno-lint-ignore no-explicit-any
export function objektLabel(b: any): string {
  if (!b) return "";
  const name = String(b.name || "").trim();
  const ort = [String(b.postal_code || "").trim(), String(b.city || "").trim()].filter(Boolean).join(" ");
  return ort && !name.includes(ort) ? `${name}, ${ort}` : name;
}

/** Zustimmungstext, den der Unterzeichner bestätigt (wird wörtlich gespeichert). */
export function zustimmungsText(titel: string): string {
  return `Ich habe das Dokument „${titel}“ gelesen und stimme seinem Inhalt verbindlich zu. ` +
    `Mir ist bekannt, dass diese elektronische Erklärung in Textform rechtsverbindlich ist.`;
}

export const ZUSTIMMUNG_INTERN = "Freigabe durch angemeldeten Mitarbeiter in der VerwaltungsApp";

/** Grobe Geräte-Angabe aus dem User-Agent („iPhone, Safari“). */
export function geraet(ua: string | null | undefined): string {
  if (!ua) return "";
  if (ua === "VerwaltungsApp") return "VerwaltungsApp";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) || /CriOS/.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : "";
  return [os, br].filter(Boolean).join(", ") || ua.slice(0, 60);
}

// ---------------------------------------------------------------- Prüfungen & Säubern

export const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Einzeiliger Text: Steuerzeichen raus, Länge begrenzt. */
export function zeile(v: unknown, max = 200): string {
  return String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ") // \s unten erfasst auch Zeilentrenner
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Mehrzeiliger Text (Mailtext): Steuerzeichen außer Zeilenumbruch raus. */
export function mehrzeilig(v: unknown, max = 5000): string {
  return String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ")
    .slice(0, max)
    .trim();
}

export function uuidOderNull(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

/** Dateiname für Anhänge/Ablage säubern. */
export function dateiname(s: string, endung = ".pdf"): string {
  const basis = String(s || "Dokument")
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "Dokument";
  return basis + endung;
}

/** Speicherpfad-Segment (nur ASCII) */
export function pfadSegment(s: string): string {
  return String(s || "datei")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

export function ipAus(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-for");
  const ip = (xf ? xf.split(",")[0] : req.headers.get("x-real-ip") || "").trim();
  return ip ? ip.slice(0, 64) : null;
}

export function base64ZuBytes(b64: string): Uint8Array {
  const rein = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(rein.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesZuBase64(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

// ---------------------------------------------------------------- Speicher

export async function laden(db: Db, bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new Fehler(500, `Datei konnte nicht geladen werden (${path}).`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function speichern(db: Db, path: string, bytes: Uint8Array, contentType = "application/pdf") {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Fehler(500, `Datei konnte nicht gespeichert werden: ${error.message}`);
}

/** Signierte URL (Standard 10 Minuten, höchstens 1 Stunde). */
export async function signierteUrl(db: Db, path: string | null | undefined, sekunden = 600, downloadName?: string) {
  if (!path) return null;
  const { data } = await db.storage.from(BUCKET).createSignedUrl(
    path,
    Math.min(sekunden, 3600),
    downloadName ? { download: downloadName } : undefined,
  );
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------- Protokoll

export async function ereignis(
  db: Db,
  requestId: string,
  art: string,
  text: string,
  o: { signerId?: string | null; userId?: string | null; details?: Record<string, unknown> } = {},
) {
  const { error } = await db.from("sign_request_events").insert({
    request_id: requestId,
    signer_id: o.signerId ?? null,
    ereignis: art,
    details: { text, ...(o.details ?? {}) },
    created_by: uuidOderNull(o.userId),
  });
  if (error) console.error("[signatur] Ereignis nicht gespeichert:", art, error.message);
}

/** Meldung in der Glocke (public.notifications). Typen laut Constraint. */
export async function melden(
  db: Db,
  userId: string | null | undefined,
  type: "subtask_done" | "review_due" | "deadline",
  title: string,
  body: string,
  requestId: string,
) {
  if (!uuidOderNull(userId)) return;
  const { error } = await db.from("notifications").insert({
    user_id: userId,
    type,
    title: title.slice(0, 200),
    body: body.slice(0, 500),
    url: `/unterschriften?vorgang=${requestId}`,
    ref_type: "sign_request",
    ref_id: requestId,
  });
  if (error) console.error("[signatur] Meldung nicht gespeichert:", error.message);
}
