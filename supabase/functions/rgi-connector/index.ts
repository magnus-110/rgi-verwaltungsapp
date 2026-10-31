// RGI VerwaltungsApp – Claude-Konnektor (MCP über Streamable HTTP, JSON-Antworten)
// Dateien (DMS) hochladen/finden/herunterladen, E-Mail-Anhänge lesen/ins DMS übernehmen,
// E-Mails mit Anhängen versenden, zeitgesteuert planen oder als Entwurf im Postfach ablegen. Anmeldung: Firmenschlüssel (Secret RGI_CONNECTOR_KEY)
// entweder als Request-Header oder als OAuth-Client-Secret (Auto-Freigabe, PKCE).
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONNECTOR_KEY = Deno.env.get("RGI_CONNECTOR_KEY") ?? "";
const CLIENT_ID = "rgi-claude";
const DEFAULT_UPLOADER = Deno.env.get("RGI_CONNECTOR_DEFAULT_USER") ?? "ef8c8c83-1f8f-426d-a7d6-a7d1fe26156e";
const PUBLIC_BASE = `${SUPABASE_URL}/functions/v1/rgi-connector`;
const ALLOWED_REDIRECTS = [/^https:\/\/claude\.ai\/api\/mcp\/auth_callback$/, /^https:\/\/claude\.com\/api\/mcp\/auth_callback$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/callback$/];

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------- Hilfen
const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (s: string) => b64u(enc.encode(s));
const fromB64u = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode("rgi-connector:" + CONNECTOR_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
async function signToken(payload: Record<string, unknown>): Promise<string> {
  const body = b64uStr(JSON.stringify(payload));
  return `${body}.${await hmac(body)}`;
}
async function readToken(tok: string, typ: string): Promise<any | null> {
  const [body, sig] = tok.split(".");
  if (!body || !sig || (await hmac(body)) !== sig) return null;
  try {
    const p = JSON.parse(fromB64u(body));
    if (p.typ !== typ || (p.exp && Date.now() / 1000 > p.exp)) return null;
    return p;
  } catch { return null; }
}
function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sha256b64u(s: string) {
  return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-api-key, mcp-protocol-version, mcp-session-id", "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id" };
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });

async function istBerechtigt(req: Request): Promise<boolean> {
  if (!CONNECTOR_KEY) return false;
  const apiKey = req.headers.get("x-api-key") ?? "";
  if (apiKey && safeEqual(apiKey, CONNECTOR_KEY)) return true;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return false;
  if (safeEqual(bearer, CONNECTOR_KEY)) return true;
  return !!(await readToken(bearer, "access"));
}

async function log(tool: string, details: Record<string, unknown>) {
  await db.from("claude_connector_log").insert({ tool, details }).then(() => {}, () => {});
}

function dateiEndung(name: string) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1].toLowerCase() : "bin";
}
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain", csv: "text/csv", zip: "application/zip", eml: "message/rfc822", json: "application/json" };
const mimeVon = (name: string, given?: string) => given || MIME[dateiEndung(name)] || "application/octet-stream";

async function objektGroesse(bucket: string, path: string): Promise<number | null> {
  const i = path.lastIndexOf("/");
  const dir = i >= 0 ? path.slice(0, i) : "";
  const name = i >= 0 ? path.slice(i + 1) : path;
  const { data } = await db.storage.from(bucket).list(dir, { search: name, limit: 100 });
  const o = (data ?? []).find((x: any) => x.name === name);
  return o ? Number((o as any).metadata?.size ?? 0) : null;
}

async function uploaderId(email?: string): Promise<string> {
  if (email) {
    const { data } = await db.from("profiles").select("user_id, role").ilike("email", email).maybeSingle();
    if (data?.user_id && ["admin", "employee"].includes(String(data.role))) return data.user_id;
  }
  return DEFAULT_UPLOADER;
}

async function texterkennungStarten(fileId: string) {
  // Hintergrund – Antwort nicht abwarten
  fetch(`${SUPABASE_URL}/functions/v1/process-building-file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  }).catch(() => {});
}

// Gemeinsamer Teil: Dateieintrag im DMS anlegen
async function dmsEintragAnlegen(a: {
  building_id: string; path: string; bucket?: string; anzeigename: string; kategorie_id?: string; mime_type?: string;
  wirtschaftsjahr?: number; sichtbarkeit?: string; kontakt_ids?: string[]; beschreibung?: string; tags?: string[];
  benachrichtigen?: boolean; mitarbeiter_email?: string; source?: string; source_email_id?: string; texterkennung?: boolean;
}) {
  const bucket = a.bucket ?? "building-files";
  const { data: geb, error: gErr } = await db.from("buildings").select("id, name, management_mode").eq("id", a.building_id).maybeSingle();
  if (gErr || !geb) throw new Error("Gebäude nicht gefunden");
  const size = await objektGroesse(bucket, a.path);
  if (size === null) throw new Error(`Datei nicht im Speicher gefunden: ${a.path}. Wurde der Upload abgeschlossen?`);
  const sichtbarkeit = a.sichtbarkeit ?? "intern";
  if (!["intern", "alle", "eigentuemer", "mieter", "personen"].includes(sichtbarkeit)) throw new Error("Ungültige Sichtbarkeit");
  if (sichtbarkeit === "personen" && !(a.kontakt_ids?.length)) throw new Error("Bei Sichtbarkeit 'personen' bitte kontakt_ids angeben");
  if (a.kategorie_id) {
    const { data: kat } = await db.from("building_file_categories").select("id").eq("id", a.kategorie_id).maybeSingle();
    if (!kat) throw new Error("Kategorie nicht gefunden");
  }
  const row: Record<string, unknown> = {
    building_id: a.building_id,
    category_id: a.kategorie_id ?? null,
    uploaded_by: await uploaderId(a.mitarbeiter_email),
    display_name: a.anzeigename,
    file_path: a.path,
    file_size: size,
    mime_type: mimeVon(a.anzeigename, a.mime_type),
    management_mode: geb.management_mode ?? "weg",
    description: a.beschreibung ?? null,
    visibility_role: sichtbarkeit,
    visible_to_users: sichtbarkeit !== "intern",
    fiscal_year: a.wirtschaftsjahr ?? null,
    tags: [...(a.tags ?? []), "claude"],
    source: a.source ?? "manual",
    source_email_id: a.source_email_id ?? null,
    linked_contact_id: a.kontakt_ids?.length === 1 ? a.kontakt_ids[0] : null,
    benachrichtigen: a.benachrichtigen ?? false,
  };
  if (bucket !== "building-files") row.storage_bucket = bucket;
  const { data: f, error } = await db.from("building_files").insert(row).select("id, display_name").single();
  if (error) throw new Error(`DMS-Eintrag fehlgeschlagen: ${error.message}`);
  if (sichtbarkeit === "personen") {
    const rows = a.kontakt_ids!.map((c) => ({ file_id: f.id, contact_id: c }));
    const { error: vErr } = await db.from("building_file_visibility").insert(rows);
    if (vErr) throw new Error(`Freigabe für Personen fehlgeschlagen: ${vErr.message}`);
  }
  await db.from("building_file_activity").insert({ file_id: f.id, user_id: row.uploaded_by, action: "upload", details: { via: "claude-connector", source: row.source } }).then(() => {}, () => {});
  if (a.texterkennung !== false) await texterkennungStarten(f.id);
  return { file_id: f.id, gebaeude: geb.name, anzeigename: f.display_name, groesse_bytes: size, sichtbarkeit };
}

// Versand – entspricht der Logik von functions/send-email (SMTP des Postfachs, Ablage in "Gesendet")
async function mailVersenden(m: {
  account_id: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; body_text: string; body_html?: string;
  in_reply_to?: string; attachments: { storage_path: string; filename: string; contentType: string }[];
}): Promise<string | null> {
  const { data: account, error } = await db.from("email_accounts").select("*").eq("id", m.account_id).single();
  if (error || !account) throw new Error("E-Mail-Konto nicht gefunden");
  const MAX = 35 * 1024 * 1024;
  const bufs: { filename: string; content: Uint8Array; contentType: string; storage_path: string }[] = [];
  let total = 0;
  for (const att of m.attachments) {
    const { data: blob, error: dErr } = await db.storage.from("email-attachments").download(att.storage_path);
    if (dErr || !blob) throw new Error(`Anhang konnte nicht geladen werden: ${att.filename}`);
    const content = new Uint8Array(await blob.arrayBuffer());
    total += content.byteLength;
    if (total > MAX) throw new Error("Anhänge zu groß (max. 35 MB pro E-Mail)");
    bufs.push({ filename: att.filename, content, contentType: att.contentType, storage_path: att.storage_path });
  }
  const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
  const transporter = nodemailer.createTransport({
    host: account.smtp_host, port: account.smtp_port, secure: account.smtp_port === 465,
    auth: { user: account.smtp_user, pass: account.smtp_password },
    tls: { rejectUnauthorized: Deno.env.get("SMTP_ALLOW_SELF_SIGNED") === "true" ? false : true },
  });
  const opts: any = { from: `${account.display_name} <${account.email_address}>`, to: m.to.join(", "), subject: m.subject || "(Kein Betreff)", text: m.body_text || "" };
  if (m.body_html) opts.html = m.body_html;
  if (m.cc?.length) opts.cc = m.cc.join(", ");
  if (m.bcc?.length) opts.bcc = m.bcc.join(", ");
  if (m.in_reply_to) { opts.inReplyTo = m.in_reply_to; opts.references = m.in_reply_to; }
  if (bufs.length) opts.attachments = bufs.map((b) => ({ filename: b.filename, content: b.content, contentType: b.contentType }));
  await transporter.sendMail(opts);

  const { data: sent } = await db.from("email_folders").select("id").eq("name", "Gesendet").maybeSingle();
  const { data: ins, error: insErr } = await db.from("emails").insert({
    account_id: account.id, folder_id: sent?.id ?? null, subject: m.subject || null, from_address: account.email_address,
    from_name: account.display_name, to_addresses: m.to, cc_addresses: m.cc ?? null, body_text: m.body_text || null,
    body_html: m.body_html || null, date: new Date().toISOString(), is_read: true, has_attachments: bufs.length > 0,
    message_id: `sent-${Date.now()}-${Math.random().toString(36).slice(2)}`, in_reply_to: m.in_reply_to ?? null,
  }).select("id").single();
  if (insErr || !ins) return null;
  for (const [i, b] of bufs.entries()) {
    const p = `${ins.id}/${i}_${String(b.filename).replace(/[^\w.\-]+/g, "_")}`;
    const { error: mvErr } = await db.storage.from("email-attachments").move(b.storage_path, p);
    if (mvErr) await db.storage.from("email-attachments").upload(p, b.content, { contentType: b.contentType, upsert: true });
    await db.from("email_attachments").insert({ email_id: ins.id, file_name: b.filename, file_path: p, file_size: b.content.byteLength, mime_type: b.contentType, is_inline: false });
  }
  return ins.id;
}

// Message-ID der Original-Mail für "Antwort"-Verknüpfung (In-Reply-To/References).
// Eingehende Mails tragen sie in message_id, manche zusätzlich in message_id_header.
async function messageIdVon(emailId?: string | null): Promise<string | null> {
  if (!emailId) return null;
  const { data } = await db.from("emails").select("message_id_header, message_id").eq("id", emailId).maybeSingle();
  const mid = data?.message_id_header || data?.message_id || null;
  return mid && mid.trim().startsWith("<") ? mid.trim() : null;
}

// Gemeinsam für Entwurf und geplanten Versand: Postfach, Mitarbeiter, Anhänge, Text mit Signatur
async function mailVorbereiten(a: any) {
  const { data: acc } = await db.from("email_accounts").select("id, display_name, email_address, is_active, signature_html").eq("id", a.account_id).maybeSingle();
  if (!acc || acc.is_active === false) throw new Error("Postfach nicht gefunden oder inaktiv");

  // Wem gehört die Mail? Mitarbeiter-E-Mail, sonst Inhaber des Postfachs, sonst Standardnutzer
  let userId: string | null = null;
  for (const mail of [a.mitarbeiter_email, acc.email_address]) {
    if (!mail) continue;
    const { data: p } = await db.from("profiles").select("user_id, role").ilike("email", mail).maybeSingle();
    if (p?.user_id && ["admin", "employee"].includes(String(p.role))) { userId = p.user_id; break; }
  }
  userId = userId ?? DEFAULT_UPLOADER;

  // Anhänge im Format der App: { filename, storage_path, contentType, size }
  const atts: { filename: string; storage_path: string; contentType: string; size: number }[] = [];
  let total = 0;
  for (const x of a.anhaenge ?? []) {
    const size = await objektGroesse("email-attachments", x.storage_path);
    if (size === null) throw new Error(`Anhang nicht im Speicher gefunden: ${x.dateiname}. Wurde der Upload abgeschlossen?`);
    total += size;
    atts.push({ filename: x.dateiname, storage_path: x.storage_path, contentType: mimeVon(x.dateiname, x.mime_type), size });
  }
  for (const id of a.dms_file_ids ?? []) {
    const { data: f } = await db.from("building_files").select("display_name, file_path, storage_bucket, mime_type, file_size").eq("id", id).maybeSingle();
    if (!f) throw new Error(`DMS-Dokument ${id} nicht gefunden`);
    const { data: blob, error } = await db.storage.from(f.storage_bucket || "building-files").download(f.file_path);
    if (error || !blob) throw new Error(`DMS-Dokument konnte nicht geladen werden: ${f.display_name}`);
    const p = `outgoing/claude/${crypto.randomUUID()}/${String(f.display_name).replace(/[^\w.\-]+/g, "_")}`;
    const ct = f.mime_type || mimeVon(f.display_name);
    const { error: uErr } = await db.storage.from("email-attachments").upload(p, blob, { contentType: ct });
    if (uErr) throw uErr;
    total += blob.size;
    atts.push({ filename: f.display_name, storage_path: p, contentType: ct, size: blob.size });
  }
  if (total > 35 * 1024 * 1024) throw new Error("Anhänge zu groß (max. 35 MB pro E-Mail)");

  // Signatur genau so anhängen wie das Verfassen-Fenster ("\n\n" + Signatur),
  // damit sie beim Öffnen nicht doppelt eingefügt wird.
  let body = String(a.text ?? "").replace(/\s+$/, "");
  const sig = acc.signature_html ?? "";
  if (a.signatur_anhaengen !== false && sig && !body.endsWith(sig.replace(/\s+$/, ""))) body = `${body}\n\n${sig}`;

  if (a.antwort_auf_email_id) {
    const { data: orig } = await db.from("emails").select("id").eq("id", a.antwort_auf_email_id).maybeSingle();
    if (!orig) throw new Error("E-Mail für antwort_auf_email_id nicht gefunden");
  }
  return { acc, userId, atts, body };
}

// ---------------------------------------------------------------- Werkzeuge
type Tool = { name: string; description: string; inputSchema: any; annotations?: any; run: (a: any) => Promise<unknown> };
const S = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (d: string) => ({ type: "string", description: d });
const uuid = (d: string) => ({ type: "string", format: "uuid", description: d });

const tools: Tool[] = [
  {
    name: "gebaeude_suchen",
    description: "Findet Gebäude/Objekte der VerwaltungsApp nach Name, Straße oder Objektnummer. Liefert die building_id für alle anderen Werkzeuge.",
    inputSchema: S({ suche: str("Teil des Namens, z. B. 'Achweg'") }, ["suche"]),
    annotations: { readOnlyHint: true },
    run: async ({ suche }) => {
      const q = `%${suche}%`;
      const { data, error } = await db.from("buildings").select("id, name, building_code, city, management_mode").or(`name.ilike.${q},building_code.ilike.${q},city.ilike.${q}`).limit(20);
      if (error) throw error;
      return data;
    },
  },
  {
    name: "dms_kategorien",
    description: "Listet die DMS-Kategorien (Ordner) für ein Gebäude – allgemeine und gebäudespezifische.",
    inputSchema: S({ building_id: uuid("Gebäude") }, ["building_id"]),
    annotations: { readOnlyHint: true },
    run: async ({ building_id }) => {
      const { data: g } = await db.from("buildings").select("management_mode").eq("id", building_id).maybeSingle();
      let q = db.from("building_file_categories").select("id, name, parent_id, building_id, slug").is("archived_at", null).or(`building_id.is.null,building_id.eq.${building_id}`).order("sort_order");
      if (g?.management_mode) q = q.or(`management_mode.is.null,management_mode.eq.${g.management_mode}`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
  {
    name: "eigentuemer_eines_gebaeudes",
    description: "Listet die aktuellen Eigentümer (bzw. Mieter) eines Gebäudes mit contact_id und Einheit – z. B. um Dokumente einzelnen Eigentümern freizugeben.",
    inputSchema: S({ building_id: uuid("Gebäude"), rolle: { type: "string", enum: ["eigentuemer", "mieter"], description: "Standard: eigentuemer" } }, ["building_id"]),
    annotations: { readOnlyHint: true },
    run: async ({ building_id, rolle }) => {
      const { data, error } = await db.from("contact_building_assignments")
        .select("contact_id, unit_number, valid_from, valid_to, is_active, contacts(first_name, last_name, company_name)")
        .eq("building_id", building_id).eq("role_in_building", rolle ?? "eigentuemer").order("unit_number");
      if (error) throw error;
      const heute = new Date().toISOString().slice(0, 10);
      return (data ?? []).filter((r: any) => r.is_active !== false && (!r.valid_to || r.valid_to >= heute)).map((r: any) => ({
        contact_id: r.contact_id, einheit: r.unit_number,
        name: r.contacts?.company_name || [r.contacts?.first_name, r.contacts?.last_name].filter(Boolean).join(" "),
      }));
    },
  },
  {
    name: "dms_suchen",
    description: "Sucht Dokumente im DMS nach Gebäude, Kategorie, Wirtschaftsjahr und/oder Text im Namen.",
    inputSchema: S({ building_id: uuid("Gebäude (optional)"), kategorie_id: uuid("Kategorie (optional)"), text: str("Teil des Dateinamens (optional)"), wirtschaftsjahr: { type: "integer" }, limit: { type: "integer", description: "Standard 30, max. 100" } }),
    annotations: { readOnlyHint: true },
    run: async (a) => {
      let q = db.from("building_files").select("id, display_name, building_id, category_id, fiscal_year, mime_type, file_size, visibility_role, source, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(Math.min(a.limit ?? 30, 100));
      if (a.building_id) q = q.eq("building_id", a.building_id);
      if (a.kategorie_id) q = q.eq("category_id", a.kategorie_id);
      if (a.wirtschaftsjahr) q = q.eq("fiscal_year", a.wirtschaftsjahr);
      if (a.text) q = q.ilike("display_name", `%${a.text}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
  {
    name: "dms_herunterladen",
    description: "Erzeugt einen Download-Link (1 Stunde gültig) für ein DMS-Dokument. Die Datei mit curl herunterladen, nicht in den Chat kopieren.",
    inputSchema: S({ file_id: uuid("building_files.id") }, ["file_id"]),
    annotations: { readOnlyHint: true },
    run: async ({ file_id }) => {
      const { data: f, error } = await db.from("building_files").select("display_name, file_path, storage_bucket, mime_type, file_size").eq("id", file_id).maybeSingle();
      if (error || !f) throw new Error("Dokument nicht gefunden");
      const { data: s, error: sErr } = await db.storage.from(f.storage_bucket || "building-files").createSignedUrl(f.file_path, 3600);
      if (sErr) throw sErr;
      return { dateiname: f.display_name, mime_type: f.mime_type, groesse_bytes: f.file_size, download_url: s.signedUrl, gueltig_sekunden: 3600 };
    },
  },
  {
    name: "dms_upload_vorbereiten",
    description: "Schritt 1 von 2 beim Hochladen ins DMS: liefert einen Upload-Link (10 Min. gültig). Datei danach per HTTP PUT hochladen: curl -X PUT -H 'Content-Type: <mime>' --data-binary @datei '<upload_url>'. Anschließend dms_upload_abschliessen aufrufen.",
    inputSchema: S({ building_id: uuid("Gebäude"), dateiname: str("Originaldateiname mit Endung, z. B. 'Abrechnung_W01.pdf'") }, ["building_id", "dateiname"]),
    run: async ({ building_id, dateiname }) => {
      const path = `${building_id}/${crypto.randomUUID()}.${dateiEndung(dateiname)}`;
      const { data, error } = await db.storage.from("building-files").createSignedUploadUrl(path);
      if (error) throw error;
      return { path, upload_url: data.signedUrl, methode: "PUT", content_type: mimeVon(dateiname), gueltig_sekunden: 600 };
    },
  },
  {
    name: "dms_upload_abschliessen",
    description: "Schritt 2 von 2: legt das hochgeladene Dokument im DMS an. Sichtbarkeit: intern (nur Büro), alle, eigentuemer, mieter oder personen (nur die angegebenen kontakt_ids – z. B. Einzelabrechnung je Eigentümer). Startet die Texterkennung. Benachrichtigung der Eigentümer nur wenn ausdrücklich gewünscht.",
    inputSchema: S({
      building_id: uuid("Gebäude"), path: str("path aus dms_upload_vorbereiten"), anzeigename: str("Name im DMS inkl. Endung"),
      kategorie_id: uuid("DMS-Kategorie"), wirtschaftsjahr: { type: "integer" },
      sichtbarkeit: { type: "string", enum: ["intern", "alle", "eigentuemer", "mieter", "personen"], description: "Standard: intern" },
      kontakt_ids: { type: "array", items: { type: "string", format: "uuid" }, description: "Bei 'personen': contact_ids, die das Dokument sehen dürfen" },
      beschreibung: str("optional"), tags: { type: "array", items: { type: "string" } },
      benachrichtigen: { type: "boolean", description: "Eigentümer per App benachrichtigen (Standard: false)" },
      mitarbeiter_email: str("E-Mail des Mitarbeiters, der den Upload veranlasst (für 'hochgeladen von')"),
    }, ["building_id", "path", "anzeigename"]),
    run: async (a) => {
      const r = await dmsEintragAnlegen({ ...a, source: "manual" });
      await log("dms_upload", { ...r, path: a.path, mitarbeiter: a.mitarbeiter_email ?? null });
      return r;
    },
  },
  {
    name: "dms_uploads_vorbereiten",
    description: "Sammel-Variante von dms_upload_vorbereiten für viele Dateien (max. 100): liefert je Dateiname path und upload_url (2 Std. gültig). Danach alle Dateien per PUT hochladen und dms_uploads_abschliessen aufrufen.",
    inputSchema: S({ building_id: uuid("Gebäude"), dateinamen: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 } }, ["building_id", "dateinamen"]),
    run: async ({ building_id, dateinamen }) => {
      const out = [];
      for (const dateiname of dateinamen as string[]) {
        const path = `${building_id}/${crypto.randomUUID()}.${dateiEndung(dateiname)}`;
        const { data, error } = await db.storage.from("building-files").createSignedUploadUrl(path);
        if (error) throw error;
        out.push({ dateiname, path, upload_url: data.signedUrl, content_type: mimeVon(dateiname) });
      }
      return out;
    },
  },
  {
    name: "dms_uploads_abschliessen",
    description: "Sammel-Variante von dms_upload_abschliessen (max. 100 Dateien). Jede Datei mit eigener Kategorie, Sichtbarkeit und kontakt_ids (z. B. Einzelabrechnung je Eigentümer mit sichtbarkeit 'personen'). Benachrichtigung nur wenn ausdrücklich gewünscht. Fehler bei einzelnen Dateien brechen die anderen nicht ab.",
    inputSchema: S({
      building_id: uuid("Gebäude"),
      dateien: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", additionalProperties: false, required: ["path", "anzeigename"], properties: {
        path: { type: "string" }, anzeigename: { type: "string" }, kategorie_id: { type: "string", format: "uuid" }, wirtschaftsjahr: { type: "integer" },
        sichtbarkeit: { type: "string", enum: ["intern", "alle", "eigentuemer", "mieter", "personen"] },
        kontakt_ids: { type: "array", items: { type: "string", format: "uuid" } }, beschreibung: { type: "string" }, tags: { type: "array", items: { type: "string" } },
      } } },
      benachrichtigen: { type: "boolean", description: "Standard: false" },
      mitarbeiter_email: str("optional"),
    }, ["building_id", "dateien"]),
    run: async (a) => {
      const ergebnisse = [];
      for (const d of a.dateien as any[]) {
        try {
          const r = await dmsEintragAnlegen({ ...d, building_id: a.building_id, benachrichtigen: a.benachrichtigen ?? false, mitarbeiter_email: a.mitarbeiter_email, source: "manual" });
          ergebnisse.push({ ok: true, ...r });
        } catch (e) {
          ergebnisse.push({ ok: false, anzeigename: d.anzeigename, fehler: (e as Error).message });
        }
      }
      await log("dms_uploads", { anzahl: ergebnisse.length, ok: ergebnisse.filter((x) => x.ok).length, mitarbeiter: a.mitarbeiter_email ?? null });
      return { erfolgreich: ergebnisse.filter((x) => x.ok).length, fehlgeschlagen: ergebnisse.filter((x) => !x.ok).length, ergebnisse };
    },
  },
  {
    name: "mail_suchen",
    description: "Sucht E-Mails in der VerwaltungsApp nach Text (Betreff/Absender), Gebäude und Zeitraum.",
    inputSchema: S({ text: str("Suchbegriff in Betreff oder Absender"), building_id: uuid("Gebäude"), von: str("Datum JJJJ-MM-TT"), bis: str("Datum JJJJ-MM-TT"), nur_mit_anhang: { type: "boolean" }, limit: { type: "integer" } }),
    annotations: { readOnlyHint: true },
    run: async (a) => {
      let q = db.from("emails").select("id, date, subject, from_address, from_name, to_addresses, has_attachments, building_id, account_id").is("deleted_at", null).order("date", { ascending: false }).limit(Math.min(a.limit ?? 30, 100));
      if (a.building_id) q = q.eq("building_id", a.building_id);
      if (a.von) q = q.gte("date", a.von);
      if (a.bis) q = q.lte("date", `${a.bis}T23:59:59`);
      if (a.nur_mit_anhang) q = q.eq("has_attachments", true);
      if (a.text) q = q.or(`subject.ilike.%${a.text}%,from_address.ilike.%${a.text}%,from_name.ilike.%${a.text}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
  {
    name: "mail_lesen",
    description: "Liefert eine E-Mail mit Text und Liste der Anhänge.",
    inputSchema: S({ email_id: uuid("emails.id") }, ["email_id"]),
    annotations: { readOnlyHint: true },
    run: async ({ email_id }) => {
      const { data: m, error } = await db.from("emails").select("id, date, subject, from_address, from_name, to_addresses, cc_addresses, body_text, building_id, account_id, message_id_header").eq("id", email_id).maybeSingle();
      if (error || !m) throw new Error("E-Mail nicht gefunden");
      const { data: att } = await db.from("email_attachments").select("id, file_name, mime_type, file_size, is_inline").eq("email_id", email_id);
      return { ...m, body_text: (m.body_text ?? "").slice(0, 20000), anhaenge: att ?? [] };
    },
  },
  {
    name: "mail_anhaenge",
    description: "Listet die Anhänge einer E-Mail mit Download-Links (1 Stunde gültig).",
    inputSchema: S({ email_id: uuid("emails.id") }, ["email_id"]),
    annotations: { readOnlyHint: true },
    run: async ({ email_id }) => {
      const { data, error } = await db.from("email_attachments").select("id, file_name, file_path, mime_type, file_size, is_inline").eq("email_id", email_id);
      if (error) throw error;
      const out = [];
      for (const a of data ?? []) {
        const { data: s } = await db.storage.from("email-attachments").createSignedUrl(a.file_path, 3600);
        out.push({ attachment_id: a.id, dateiname: a.file_name, mime_type: a.mime_type, groesse_bytes: a.file_size, inline: a.is_inline, download_url: s?.signedUrl ?? null });
      }
      return out;
    },
  },
  {
    name: "mail_anhang_ins_dms",
    description: "Übernimmt einen E-Mail-Anhang direkt ins DMS eines Gebäudes (mit Verweis auf die Ursprungs-Mail).",
    inputSchema: S({
      attachment_id: uuid("email_attachments.id"), building_id: uuid("Gebäude"), kategorie_id: uuid("DMS-Kategorie"),
      anzeigename: str("optional, sonst Original-Dateiname"), wirtschaftsjahr: { type: "integer" },
      sichtbarkeit: { type: "string", enum: ["intern", "alle", "eigentuemer", "mieter", "personen"] },
      kontakt_ids: { type: "array", items: { type: "string", format: "uuid" } }, beschreibung: str("optional"),
      benachrichtigen: { type: "boolean" }, mitarbeiter_email: str("optional"),
    }, ["attachment_id", "building_id"]),
    run: async (a) => {
      const { data: att, error } = await db.from("email_attachments").select("id, email_id, file_name, file_path, mime_type").eq("id", a.attachment_id).maybeSingle();
      if (error || !att) throw new Error("Anhang nicht gefunden");
      const { data: blob, error: dErr } = await db.storage.from("email-attachments").download(att.file_path);
      if (dErr || !blob) throw new Error("Anhang konnte nicht geladen werden");
      const path = `${a.building_id}/${crypto.randomUUID()}.${dateiEndung(att.file_name)}`;
      const { error: uErr } = await db.storage.from("building-files").upload(path, blob, { contentType: att.mime_type || mimeVon(att.file_name) });
      if (uErr) throw uErr;
      const r = await dmsEintragAnlegen({ ...a, path, anzeigename: a.anzeigename ?? att.file_name, mime_type: att.mime_type, source: "email", source_email_id: att.email_id });
      await log("mail_anhang_ins_dms", { ...r, attachment_id: a.attachment_id });
      return r;
    },
  },
  {
    name: "mail_postfaecher",
    description: "Listet die E-Mail-Postfächer, über die versendet werden kann.",
    inputSchema: S({}),
    annotations: { readOnlyHint: true },
    run: async () => {
      const { data, error } = await db.from("email_accounts").select("id, display_name, email_address, short_code").eq("is_active", true).order("display_name");
      if (error) throw error;
      return data;
    },
  },
  {
    name: "mail_anhang_vorbereiten",
    description: "Liefert einen Upload-Link (10 Min.) für eine Datei, die als Anhang verschickt werden soll. Datei per PUT hochladen, dann storage_path bei mail_senden unter 'anhaenge' angeben.",
    inputSchema: S({ dateiname: str("Dateiname mit Endung") }, ["dateiname"]),
    run: async ({ dateiname }) => {
      const safe = String(dateiname).replace(/[^\w.\-]+/g, "_");
      const path = `outgoing/claude/${crypto.randomUUID()}/${safe}`;
      const { data, error } = await db.storage.from("email-attachments").createSignedUploadUrl(path);
      if (error) throw error;
      return { storage_path: path, upload_url: data.signedUrl, methode: "PUT", content_type: mimeVon(dateiname), gueltig_sekunden: 600 };
    },
  },
  {
    name: "mail_entwurf_anlegen",
    description: "Legt eine E-Mail als Entwurf im Postfach der VerwaltungsApp an (Ordner 'Entwürfe' des Mitarbeiters). Es wird NICHTS gesendet – der Mitarbeiter öffnet den Entwurf in der App, prüft ihn und sendet selbst. Text ohne Grußformel/Signatur übergeben: die Signatur des Postfachs wird automatisch angehängt (signatur_anhaengen=false schaltet das ab). Anhänge wie bei mail_senden (hochgeladene Dateien und/oder DMS-Dokumente).",
    inputSchema: S({
      account_id: uuid("Postfach aus mail_postfaecher"),
      an: { type: "array", items: { type: "string" } }, cc: { type: "array", items: { type: "string" } }, bcc: { type: "array", items: { type: "string" } },
      betreff: str("Betreff"), text: str("Nachricht als Klartext, ohne Signatur"),
      signatur_anhaengen: { type: "boolean", description: "Signatur des Postfachs anhängen (Standard: true)" },
      antwort_auf_email_id: uuid("optional: emails.id, auf die geantwortet wird"),
      anhaenge: { type: "array", items: { type: "object", properties: { storage_path: { type: "string" }, dateiname: { type: "string" }, mime_type: { type: "string" } }, required: ["storage_path", "dateiname"] } },
      dms_file_ids: { type: "array", items: { type: "string", format: "uuid" } },
      mitarbeiter_email: str("E-Mail des Mitarbeiters, in dessen Entwürfen die Mail erscheinen soll (Standard: Inhaber des Postfachs)"),
    }, ["account_id", "betreff", "text"]),
    run: async (a) => {
      const { acc, userId, atts, body } = await mailVorbereiten(a);
      const { data: d, error } = await db.from("email_drafts").insert({
        user_id: userId, account_id: acc.id, to_addresses: a.an ?? [], cc_addresses: a.cc?.length ? a.cc : null,
        bcc_addresses: a.bcc?.length ? a.bcc : null, subject: a.betreff ?? "", body_text: body, attachments: atts,
        reply_to_email_id: a.antwort_auf_email_id ?? null, forward_email_id: null,
      }).select("id").single();
      if (error || !d) throw new Error(`Entwurf konnte nicht gespeichert werden: ${error?.message ?? "unbekannt"}`);
      await log("mail_entwurf_anlegen", { draft_id: d.id, an: a.an ?? [], betreff: a.betreff, postfach: acc.email_address, anhaenge: atts.map((x) => x.filename), mitarbeiter: a.mitarbeiter_email ?? null });
      return { status: "ENTWURF GESPEICHERT – nicht gesendet", draft_id: d.id, postfach: `${acc.display_name} <${acc.email_address}>`, an: a.an ?? [], betreff: a.betreff, anhaenge: atts.map((x) => x.filename), hinweis: "Der Entwurf liegt in der VerwaltungsApp unter Postfach → Entwürfe." };
    },
  },
  {
    name: "mail_planen",
    description: "Plant den Versand einer E-Mail zu einem festen Zeitpunkt (erscheint in der App unter 'Geplant' und kann dort bearbeitet oder abgebrochen werden). Entweder einen vorhandenen Entwurf übernehmen (entwurf_id – der Entwurf wird danach gelöscht) oder die Mail wie bei mail_entwurf_anlegen neu angeben. WICHTIG: Inhalt, Empfänger und Zeitpunkt vorher dem Nutzer zeigen und nur nach seiner ausdrücklichen Zustimmung planen.",
    inputSchema: S({
      senden_am: str("Versandzeitpunkt als ISO 8601 mit Zeitzone, z. B. 2026-11-02T08:00:00+01:00"),
      entwurf_id: uuid("optional: email_drafts.id – Entwurf übernehmen statt neu angeben"),
      account_id: uuid("Postfach aus mail_postfaecher (ohne entwurf_id Pflicht)"),
      an: { type: "array", items: { type: "string" } }, cc: { type: "array", items: { type: "string" } }, bcc: { type: "array", items: { type: "string" } },
      betreff: str("Betreff"), text: str("Nachricht als Klartext, ohne Signatur"), html: str("optional: HTML-Version"),
      signatur_anhaengen: { type: "boolean", description: "Signatur des Postfachs anhängen (Standard: true)" },
      antwort_auf_email_id: uuid("optional: emails.id, auf die geantwortet wird"),
      anhaenge: { type: "array", items: { type: "object", properties: { storage_path: { type: "string" }, dateiname: { type: "string" }, mime_type: { type: "string" } }, required: ["storage_path", "dateiname"] } },
      dms_file_ids: { type: "array", items: { type: "string", format: "uuid" } },
      mitarbeiter_email: str("optional: wer den Versand veranlasst"),
    }, ["senden_am"]),
    annotations: { destructiveHint: true, openWorldHint: true },
    run: async (a) => {
      const zeit = new Date(a.senden_am);
      if (isNaN(zeit.getTime())) throw new Error("senden_am ist kein gültiger Zeitpunkt");
      if (zeit.getTime() < Date.now() + 60_000) throw new Error("senden_am muss in der Zukunft liegen");
      if (zeit.getTime() > Date.now() + 366 * 86400_000) throw new Error("senden_am liegt mehr als ein Jahr in der Zukunft");

      let row: Record<string, unknown>;
      let entwurfId: string | null = null;
      if (a.entwurf_id) {
        const { data: d } = await db.from("email_drafts").select("*").eq("id", a.entwurf_id).maybeSingle();
        if (!d) throw new Error("Entwurf nicht gefunden");
        if (!d.account_id) throw new Error("Im Entwurf ist kein Postfach gewählt");
        if (!(d.to_addresses ?? []).length) throw new Error("Im Entwurf ist kein Empfänger eingetragen");
        entwurfId = d.id;
        row = {
          user_id: d.user_id ?? DEFAULT_UPLOADER, account_id: d.account_id, to_addresses: d.to_addresses, cc_addresses: d.cc_addresses,
          bcc_addresses: d.bcc_addresses, subject: d.subject ?? "", body_text: d.body_text ?? "", body_html: null,
          attachments: Array.isArray(d.attachments) ? d.attachments : [], reply_to_message_id: d.reply_to_email_id ?? null,
        };
      } else {
        if (!a.account_id || !(a.an ?? []).length || a.betreff === undefined || a.text === undefined) throw new Error("Ohne entwurf_id sind account_id, an, betreff und text Pflicht");
        const { acc, userId, atts, body } = await mailVorbereiten(a);
        row = {
          user_id: userId, account_id: acc.id, to_addresses: a.an, cc_addresses: a.cc?.length ? a.cc : null,
          bcc_addresses: a.bcc?.length ? a.bcc : null, subject: a.betreff ?? "", body_text: body, body_html: a.html ?? null,
          attachments: atts, reply_to_message_id: a.antwort_auf_email_id ?? null,
        };
      }
      const { data: g, error } = await db.from("scheduled_emails").insert({ ...row, scheduled_at: zeit.toISOString(), status: "scheduled" }).select("id").single();
      if (error || !g) throw new Error(`Planen fehlgeschlagen: ${error?.message ?? "unbekannt"}`);
      if (entwurfId) await db.from("email_drafts").delete().eq("id", entwurfId);
      const { data: acc } = await db.from("email_accounts").select("display_name, email_address").eq("id", row.account_id as string).maybeSingle();
      const anh = ((row.attachments as any[]) ?? []).map((x) => x.filename);
      await log("mail_planen", { scheduled_id: g.id, senden_am: zeit.toISOString(), an: row.to_addresses, betreff: row.subject, postfach: acc?.email_address ?? null, anhaenge: anh, entwurf_id: entwurfId, mitarbeiter: a.mitarbeiter_email ?? null });
      return {
        status: "GEPLANT – wird automatisch versendet", scheduled_id: g.id,
        senden_am: zeit.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "full", timeStyle: "short" }),
        von: acc ? `${acc.display_name} <${acc.email_address}>` : null, an: row.to_addresses, betreff: row.subject, anhaenge: anh,
        hinweis: "In der App unter Postfach → Geplant änder- oder abbrechbar.",
      };
    },
  },
  {
    name: "mail_senden",
    description: "Versendet eine E-Mail über ein Postfach der VerwaltungsApp (erscheint unter 'Gesendet'). WICHTIG: Zuerst mit bestaetigt=false aufrufen – das liefert nur eine Vorschau. Diese dem Nutzer zeigen und erst nach seiner ausdrücklichen Zustimmung mit bestaetigt=true erneut aufrufen. Anhänge: hochgeladene Dateien (anhaenge) und/oder DMS-Dokumente (dms_file_ids). Max. 35 MB gesamt.",
    inputSchema: S({
      account_id: uuid("Postfach aus mail_postfaecher"),
      an: { type: "array", items: { type: "string" }, minItems: 1 }, cc: { type: "array", items: { type: "string" } }, bcc: { type: "array", items: { type: "string" } },
      betreff: str("Betreff"), text: str("Nachricht als Klartext"), html: str("optional: HTML-Version"),
      antwort_auf_email_id: uuid("optional: emails.id, auf die geantwortet wird"),
      anhaenge: { type: "array", items: { type: "object", properties: { storage_path: { type: "string" }, dateiname: { type: "string" }, mime_type: { type: "string" } }, required: ["storage_path", "dateiname"] } },
      dms_file_ids: { type: "array", items: { type: "string", format: "uuid" } },
      bestaetigt: { type: "boolean", description: "false = nur Vorschau; true = wirklich senden (nur nach Zustimmung des Nutzers)" },
      mitarbeiter_email: str("optional: wer den Versand veranlasst"),
    }, ["account_id", "an", "betreff", "text", "bestaetigt"]),
    annotations: { destructiveHint: true, openWorldHint: true },
    run: async (a) => {
      const { data: acc } = await db.from("email_accounts").select("id, display_name, email_address, is_active").eq("id", a.account_id).maybeSingle();
      if (!acc || acc.is_active === false) throw new Error("Postfach nicht gefunden oder inaktiv");
      const dmsDateien: any[] = [];
      for (const id of a.dms_file_ids ?? []) {
        const { data: f } = await db.from("building_files").select("id, display_name, file_path, storage_bucket, mime_type, file_size").eq("id", id).maybeSingle();
        if (!f) throw new Error(`DMS-Dokument ${id} nicht gefunden`);
        dmsDateien.push(f);
      }
      const vorschau = {
        von: `${acc.display_name} <${acc.email_address}>`, an: a.an, cc: a.cc ?? [], bcc: a.bcc ?? [], betreff: a.betreff, text: a.text,
        anhaenge: [...(a.anhaenge ?? []).map((x: any) => x.dateiname), ...dmsDateien.map((f) => f.display_name)],
      };
      if (!a.bestaetigt) return { status: "VORSCHAU – noch NICHT gesendet", hinweis: "Dem Nutzer zeigen und nur nach ausdrücklicher Zustimmung mit bestaetigt=true senden.", ...vorschau };

      const attachments: any[] = (a.anhaenge ?? []).map((x: any) => ({ storage_path: x.storage_path, filename: x.dateiname, contentType: mimeVon(x.dateiname, x.mime_type) }));
      for (const f of dmsDateien) {
        const { data: blob, error } = await db.storage.from(f.storage_bucket || "building-files").download(f.file_path);
        if (error || !blob) throw new Error(`DMS-Dokument konnte nicht geladen werden: ${f.display_name}`);
        const p = `outgoing/claude/${crypto.randomUUID()}/${String(f.display_name).replace(/[^\w.\-]+/g, "_")}`;
        const { error: uErr } = await db.storage.from("email-attachments").upload(p, blob, { contentType: f.mime_type || mimeVon(f.display_name) });
        if (uErr) throw uErr;
        attachments.push({ storage_path: p, filename: f.display_name, contentType: f.mime_type || mimeVon(f.display_name), size: f.file_size ?? undefined });
      }
      let in_reply_to: string | undefined;
      if (a.antwort_auf_email_id) {
        in_reply_to = (await messageIdVon(a.antwort_auf_email_id)) ?? undefined;
      }
      try {
        const emailId = await mailVersenden({ account_id: a.account_id, to: a.an, cc: a.cc, bcc: a.bcc, subject: a.betreff, body_text: a.text, body_html: a.html, in_reply_to, attachments });
        await log("mail_senden", { ok: true, email_id: emailId, an: a.an, cc: a.cc ?? [], betreff: a.betreff, postfach: acc.email_address, anhaenge: vorschau.anhaenge, mitarbeiter: a.mitarbeiter_email ?? null });
        return { status: "GESENDET", email_id: emailId, ...vorschau };
      } catch (e) {
        await log("mail_senden", { ok: false, an: a.an, betreff: a.betreff, postfach: acc.email_address, fehler: (e as Error).message });
        throw new Error(`Versand fehlgeschlagen: ${(e as Error).message}`);
      }
    },
  },
];

// ---------------------------------------------------------------- MCP
const SERVER_INFO = { name: "rgi-verwaltungsapp", version: "1.2.0" };
async function mcp(msg: any): Promise<any | null> {
  const { id, method, params } = msg ?? {};
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined || id === null) return null; // Notification
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "Zugriff auf DMS und E-Mails der RGI-VerwaltungsApp. Dateien nie als Text durch den Chat schicken: über upload_url/download_url mit curl übertragen. E-Mails erst nach ausdrücklicher Zustimmung des Nutzers senden (mail_senden zuerst mit bestaetigt=false). Soll der Nutzer die Mail selbst prüfen und versenden, mail_entwurf_anlegen verwenden – das speichert nur einen Entwurf in der App. Für späteren Versand mail_planen (ebenfalls nur nach Zustimmung).",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) })) });
    case "tools/call": {
      const t = tools.find((x) => x.name === params?.name);
      if (!t) return err(-32602, `Unbekanntes Werkzeug: ${params?.name}`);
      try {
        const result = await t.run(params?.arguments ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        return ok({ isError: true, content: [{ type: "text", text: `Fehler: ${(e as Error).message ?? String(e)}` }] });
      }
    }
    default:
      return err(-32601, `Methode nicht unterstützt: ${method}`);
  }
}

// ---------------------------------------------------------------- OAuth (Firmenschlüssel als Client-Secret)
function asMetadata() {
  return {
    issuer: PUBLIC_BASE,
    authorization_endpoint: `${PUBLIC_BASE}/authorize`,
    token_endpoint: `${PUBLIC_BASE}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    scopes_supported: ["rgi"],
  };
}
function clientAuth(req: Request, form: URLSearchParams): { id: string; secret: string } {
  const basic = req.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [i, s] = atob(basic.slice(6)).split(":");
    return { id: decodeURIComponent(i ?? ""), secret: decodeURIComponent(s ?? "") };
  }
  return { id: form.get("client_id") ?? "", secret: form.get("client_secret") ?? "" };
}
async function tokenPaar() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: await signToken({ typ: "access", iat: now, exp: now + 3600 }),
    refresh_token: await signToken({ typ: "refresh", iat: now, exp: now + 90 * 86400, n: crypto.randomUUID() }),
    token_type: "Bearer", expires_in: 3600, scope: "rgi",
  };
}

// ---------------------------------------------------------------- Router
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^.*?\/rgi-connector/, "") || "/";

  if (sub.endsWith("/.well-known/oauth-protected-resource") || sub.startsWith("/.well-known/oauth-protected-resource")) {
    return json({ resource: PUBLIC_BASE, authorization_servers: [PUBLIC_BASE], bearer_methods_supported: ["header"], scopes_supported: ["rgi"] });
  }
  if (sub.includes("/.well-known/oauth-authorization-server") || sub.includes("/.well-known/openid-configuration")) {
    return json(asMetadata());
  }
  if (sub === "/authorize") {
    const p = url.searchParams;
    const redirect = p.get("redirect_uri") ?? "";
    if (p.get("client_id") !== CLIENT_ID) return json({ error: "invalid_client" }, 400);
    if (!ALLOWED_REDIRECTS.some((r) => r.test(redirect))) return json({ error: "invalid_redirect_uri" }, 400);
    if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) return json({ error: "invalid_request" }, 400);
    const code = await signToken({ typ: "code", cc: p.get("code_challenge"), ru: redirect, exp: Math.floor(Date.now() / 1000) + 300 });
    const back = new URL(redirect);
    back.searchParams.set("code", code);
    if (p.get("state")) back.searchParams.set("state", p.get("state")!);
    return new Response(null, { status: 302, headers: { Location: back.toString() } });
  }
  if (sub === "/token" && req.method === "POST") {
    const form = new URLSearchParams(await req.text());
    const c = clientAuth(req, form);
    if (c.id !== CLIENT_ID || !CONNECTOR_KEY || !safeEqual(c.secret, CONNECTOR_KEY)) return json({ error: "invalid_client" }, 401);
    const gt = form.get("grant_type");
    if (gt === "authorization_code") {
      const code = await readToken(form.get("code") ?? "", "code");
      if (!code) return json({ error: "invalid_grant" }, 400);
      if (form.get("redirect_uri") && form.get("redirect_uri") !== code.ru) return json({ error: "invalid_grant" }, 400);
      if ((await sha256b64u(form.get("code_verifier") ?? "")) !== code.cc) return json({ error: "invalid_grant" }, 400);
      return json(await tokenPaar(), 200, { "Cache-Control": "no-store" });
    }
    if (gt === "refresh_token") {
      if (!(await readToken(form.get("refresh_token") ?? "", "refresh"))) return json({ error: "invalid_grant" }, 400);
      return json(await tokenPaar(), 200, { "Cache-Control": "no-store" });
    }
    return json({ error: "unsupported_grant_type" }, 400);
  }

  // MCP-Endpunkt
  if (sub === "/" || sub === "/mcp") {
    if (!(await istBerechtigt(req))) {
      return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": `Bearer resource_metadata="${PUBLIC_BASE}/.well-known/oauth-protected-resource", scope="rgi"` });
    }
    if (req.method === "GET") return new Response("Method Not Allowed", { status: 405, headers: cors });
    if (req.method === "DELETE") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });
    let body: any;
    try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(mcp))).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202, headers: cors });
    }
    const res = await mcp(body);
    return res ? json(res) : new Response(null, { status: 202, headers: cors });
  }
  return json({ error: "not_found" }, 404);
});
