import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_MESSAGES_PER_ACCOUNT_RUN = 5;
const MAX_TEXT_PART_BYTES = 1024 * 1024;
const MAX_ATTACHMENT_PART_BYTES = 6 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 12 * 1024 * 1024;

interface EmailAccount {
  id: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password: string;
  use_ssl: boolean;
  last_uid: string | null;
  delete_after_import: boolean;
  is_active: boolean;
  import_since: string | null;
  uid_validity: string | null;
}

interface ParsedAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
  isInline: boolean;
  contentId: string | null;
}

// Helper to check if an error is a known ignorable TLS/connection error
function isIgnorableConnectionError(err: any): boolean {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("close_notify") ||
    msg.includes("UnexpectedEof") ||
    msg.includes("connection closed") ||
    msg.includes("Connection not available") ||
    msg.includes("socket disconnected") ||
    msg.includes("EPIPE") ||
    msg.includes("ECONNRESET") ||
    msg.includes("read ECONNRESET")
  );
}

// Suppress Strato TLS close_notify errors at the event loop level
globalThis.addEventListener("unhandledrejection", (e) => {
  if (isIgnorableConnectionError(e.reason)) {
    e.preventDefault();
  }
});

// Also catch uncaught error events (this is what actually crashes the runtime)
globalThis.addEventListener("error", (e) => {
  if (isIgnorableConnectionError(e.error || e.message)) {
    e.preventDefault();
  }
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---- Reparse single email ----
  const url = new URL(req.url);
  const reparseId = url.searchParams.get("reparse");
  if (reparseId) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const result = await reparseSingleEmail(supabaseAdmin, reparseId);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Optional: nur ein bestimmtes Konto verarbeiten (per Self-Invocation pro Account,
  // um den 256MB-Worker nicht mit allen Postfächern gleichzeitig zu sprengen).
  let bodyAccountId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.account_id === "string") bodyAccountId = body.account_id;
    } catch {
      // kein Body / kein JSON -> alle Konten dispatchen
    }
  }

  try {
    const accountsQuery = supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("is_active", true);
    if (bodyAccountId) accountsQuery.eq("id", bodyAccountId);

    const { data: accounts, error: accError } = await accountsQuery;

    if (accError) throw accError;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "Keine aktiven E-Mail-Konten gefunden" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Dispatcher-Modus: kein account_id im Body -> jedes Konto in eigener Invocation starten ----
    if (!bodyAccountId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const dispatched: string[] = [];
      // Gestaffelt dispatchen (300ms zwischen Accounts), damit edge-runtime die Worker
      // nicht auf denselben Prozess kollokiert (Memory-Isolation pro Postfach).
      for (const acc of accounts as EmailAccount[]) {
        try {
          fetch(`${supabaseUrl}/functions/v1/fetch-emails`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({ account_id: acc.id }),
          }).catch((e) => console.error(`dispatch ${acc.email_address} failed:`, e?.message));
          dispatched.push(acc.email_address);
        } catch (e: any) {
          console.error(`dispatch error ${acc.email_address}:`, e?.message);
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      // Klassifizierung am Ende einmal anstoßen.
      try {
        fetch(`${supabaseUrl}/functions/v1/classify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({}),
        }).catch(() => {});
      } catch { /* ignore */ }

      return new Response(
        JSON.stringify({ success: true, dispatched }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Single-Account-Modus ----
    const { data: inboxFolder } = await supabaseAdmin
      .from("email_folders")
      .select("id")
      .eq("name", "Eingang")
      .single();

    const { data: sentFolder } = await supabaseAdmin
      .from("email_folders")
      .select("id")
      .eq("name", "Gesendet")
      .single();

    const results: Record<string, any> = {};

    // Pre-load account-user assignments to auto-assign emails
    const { data: accountUsersData } = await supabaseAdmin
      .from("email_account_users")
      .select("account_id, user_id")
      .eq("account_id", bodyAccountId);

    const accountDefaultUser: Record<string, string> = {};
    if (accountUsersData) {
      const counts: Record<string, { count: number; userId: string }> = {};
      for (const au of accountUsersData) {
        if (!counts[au.account_id]) {
          counts[au.account_id] = { count: 0, userId: au.user_id };
        }
        counts[au.account_id].count++;
        counts[au.account_id].userId = au.user_id;
      }
      for (const [accId, info] of Object.entries(counts)) {
        if (info.count === 1) {
          accountDefaultUser[accId] = info.userId;
        }
      }
    }

    for (const account of accounts as EmailAccount[]) {
      try {
        console.log(`Fetching emails for ${account.email_address}...`);
        const defaultUserId = accountDefaultUser[account.id] || null;
        const result = await fetchAccountEmails(
          supabaseAdmin,
          account,
          inboxFolder?.id,
          sentFolder?.id,
          defaultUserId
        );
        results[account.email_address] = result;

        await supabaseAdmin
          .from("email_accounts")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_error: null,
          })
          .eq("id", account.id);
      } catch (err: any) {
        console.error(`Error fetching ${account.email_address}:`, err.message);
        results[account.email_address] = { error: err.message };

        await supabaseAdmin
          .from("email_accounts")
          .update({ last_sync_error: err.message })
          .eq("id", account.id);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("fetch-emails error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function fetchAccountEmails(
  supabase: any,
  account: EmailAccount,
  inboxFolderId: string | undefined,
  sentFolderId: string | undefined,
  defaultAssignedTo: string | null = null
) {
  // Port 993 = direct SSL, Port 143 = STARTTLS
  const isSecure = account.use_ssl || account.imap_port === 993;
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: isSecure,
    auth: {
      user: account.imap_user,
      pass: account.imap_password,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  // Register error handler on the client to prevent uncaught socket errors
  client.on("error", (err: any) => {
    if (isIgnorableConnectionError(err)) {
      console.warn(`Ignorable IMAP error for ${account.email_address}: ${err.message}`);
      return;
    }
    console.error(`IMAP client error for ${account.email_address}:`, err.message);
  });

  await client.connect();

  let fetched = 0;
  const uidsToDelete: number[] = [];

  try {
    const mailbox = await client.mailboxOpen("INBOX");
    const currentUidValidity = mailbox.uidValidity != null ? String(mailbox.uidValidity) : null;
    console.log(`Mailbox opened: ${mailbox.exists} messages, uidNext: ${mailbox.uidNext}, uidValidity: ${currentUidValidity}`);

    if (mailbox.exists === 0) {
      // Still persist uidValidity so future resets are detected
      if (currentUidValidity && currentUidValidity !== account.uid_validity) {
        await supabase.from("email_accounts")
          .update({ uid_validity: currentUidValidity, last_uid: "0" })
          .eq("id", account.id);
      }
      return { fetched: 0, deleted: 0 };
    }

    // Detect UIDVALIDITY change OR stale last_uid (mailbox was reset/migrated)
    const storedLastUid = account.last_uid ? parseInt(account.last_uid) : 0;
    const uidNextMinusOne = mailbox.uidNext ? Number(mailbox.uidNext) - 1 : Infinity;
    const validityChanged = !!(account.uid_validity && currentUidValidity && account.uid_validity !== currentUidValidity);
    const staleLastUid = storedLastUid > uidNextMinusOne;
    let effectiveLastUid = storedLastUid;
    if (validityChanged || staleLastUid) {
      console.warn(
        `[${account.email_address}] UID reset detected (validityChanged=${validityChanged}, staleLastUid=${staleLastUid}, stored=${storedLastUid}, uidNext-1=${uidNextMinusOne}, storedValidity=${account.uid_validity}, currentValidity=${currentUidValidity}). Resetting last_uid to 0.`
      );
      effectiveLastUid = 0;
    }

    let uids: number[];
    if (effectiveLastUid > 0) {
      uids = await client.search({ uid: `${effectiveLastUid + 1}:*` }, { uid: true });
      uids = uids.filter((u: number) => u > effectiveLastUid);
    } else {
      uids = await client.search({ all: true }, { uid: true });
    }

    console.log(`Found ${uids.length} UIDs to fetch`);
    // Strikt klein halten — edge-runtime crasht sonst still mit "Memory limit exceeded".
    const uidsToFetch = uids.slice(0, MAX_MESSAGES_PER_ACCOUNT_RUN);
    let maxUid = effectiveLastUid;

    for (const uid of uidsToFetch) {
      try {
        const msg = await client.fetchOne(`${uid}`, {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
        }, { uid: true });

        if (!msg) continue;

        const envelope = msg.envelope;

        // Skip emails older than the account's import_since cutoff
        if (account.import_since && envelope.date) {
          const emailDate = new Date(envelope.date);
          const cutoff = new Date(account.import_since);
          if (emailDate < cutoff) {
            if (uid > maxUid) maxUid = uid;
            console.log(`Skipping UID ${uid} (older than import_since): ${envelope.subject}`);
            continue;
          }
        }

        const fromAddr = envelope.from?.[0]?.address || "";
        const fromName = envelope.from?.[0]?.name || "";
        const toAddresses = (envelope.to || []).map((a: any) => a.address).filter(Boolean);
        const toNames = (envelope.to || []).map((a: any) => a.name || a.address).filter(Boolean);
        const ccAddresses = (envelope.cc || []).map((a: any) => a.address).filter(Boolean);

        const messageId = envelope.messageId || `uid-${account.id}-${uid}`;
        const { data: existing } = await supabase
          .from("emails")
          .select("id")
          .eq("message_id", messageId)
          .maybeSingle();

        if (existing) {
          if (uid > maxUid) maxUid = uid;
          continue;
        }

        // Download only text parts and bounded attachments. Do NOT fetch the full raw source:
        // large Strato messages can exceed the 256MB Edge worker limit while base64 decoding.
        const { bodyText, bodyHtml } = await downloadBodyTextFromStructure(client, uid, msg.bodyStructure);
        const structureAttachmentParts = collectAttachmentParts(msg.bodyStructure);
        const structureSaysHasAtt = structureAttachmentParts.some(({ node }) => isRealAttachmentNode(node));
        let attachments: ParsedAttachment[] = [];
        if (structureAttachmentParts.length > 0) {
          try {
            attachments = await downloadAttachmentsFromStructure(client, uid, msg.bodyStructure, {
              maxPartBytes: MAX_ATTACHMENT_PART_BYTES,
              maxTotalBytes: MAX_ATTACHMENT_TOTAL_BYTES,
            });
          } catch (dlErr: any) {
            console.error(`Attachment download failed for UID ${uid}:`, dlErr.message);
          }
        }

        const realAttachments = attachments.filter((a) => !a.isInline);
        const hasAttachments = structureSaysHasAtt || realAttachments.length > 0;

        const { data: insertedEmail, error: insertError } = await supabase
          .from("emails")
          .insert({
            account_id: account.id,
            folder_id: inboxFolderId,
            message_id: messageId,
            subject: envelope.subject || null,
            from_address: fromAddr,
            from_name: fromName,
            to_addresses: toAddresses,
            to_names: toNames,
            cc_addresses: ccAddresses.length > 0 ? ccAddresses : null,
            body_text: bodyText || null,
            body_html: bodyHtml || null,
            date: envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString(),
            is_read: msg.flags?.has("\\Seen") || false,
            is_starred: msg.flags?.has("\\Flagged") || false,
            has_attachments: hasAttachments,
            assigned_to: defaultAssignedTo,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("Insert error:", insertError.message);
          continue;
        }

        // Store attachments in Supabase Storage
        if (insertedEmail && attachments.length > 0) {
          for (const [idx, att] of attachments.entries()) {
            try {
              // Index-Prefix verhindert Überschreiben bei gleichnamigen Anhängen
              const storagePath = `${insertedEmail.id}/${idx}_${sanitizeStorageName(att.filename)}`;
              const { error: uploadError } = await supabase.storage
                .from("email-attachments")
                .upload(storagePath, att.content, {
                  contentType: att.contentType,
                  upsert: true,
                });

              if (uploadError) {
                console.error(`Upload attachment error: ${uploadError.message}`);
                continue;
              }

              await supabase.from("email_attachments").insert({
                email_id: insertedEmail.id,
                file_name: att.filename,
                mime_type: att.contentType,
                file_size: att.content.byteLength,
                file_path: storagePath,
                is_inline: att.isInline,
                content_id: att.contentId,
              });
              (att as any).content = new Uint8Array(0);
            } catch (attErr: any) {
              console.error(`Attachment save error: ${attErr.message}`);
            }
          }
        }

        if (account.delete_after_import) {
          uidsToDelete.push(uid);
        }

        if (uid > maxUid) maxUid = uid;
        fetched++;
        console.log(`Fetched email UID ${uid}: ${envelope.subject} (${attachments.length} attachments)`);
        // Drop attachment buffers from memory before next iteration
        attachments.length = 0;
      } catch (msgErr: any) {
        console.error(`Error processing message UID ${uid}:`, msgErr.message);
        // Avoid one poison UID blocking the entire mailbox forever.
        if (uid > maxUid) maxUid = uid;
      }
    }

    console.log(`Fetch loop complete: ${fetched} emails fetched, maxUid: ${maxUid}`);

    if (maxUid > 0 || (currentUidValidity && currentUidValidity !== account.uid_validity)) {
      const update: Record<string, unknown> = {};
      if (maxUid > 0) update.last_uid = maxUid.toString();
      if (currentUidValidity) update.uid_validity = currentUidValidity;
      await supabase.from("email_accounts").update(update).eq("id", account.id);
    }

    // WICHTIG: last_sync_at *jetzt* persistieren — bevor logout()/close() im finally
    // ggf. den Worker mit OOM/Hang killt. Sonst bleibt last_sync_at endlos alt.
    try {
      await supabase
        .from("email_accounts")
        .update({ last_sync_at: new Date().toISOString(), last_sync_error: null })
        .eq("id", account.id);
    } catch (e: any) {
      console.error(`last_sync_at update failed for ${account.email_address}:`, e?.message);
    }

    if (account.delete_after_import && uidsToDelete.length > 0) {
      try {
        await client.messageDelete(uidsToDelete, { uid: true });
        console.log(`Deleted ${uidsToDelete.length} messages from server`);
      } catch (delErr: any) {
        console.error("Delete from server failed:", delErr.message);
      }
    }
  } finally {
    // Graceful cleanup — avoid double-close race conditions
    try {
      if (client.usable) {
        await client.logout();
      }
    } catch (_e) {
      // Ignore logout errors (Strato often drops connection here)
    }
    // Small delay to let pending TLS reads settle before close
    await new Promise((r) => setTimeout(r, 100));
    try {
      client.close();
    } catch (_e) {
      // ignore
    }
  }

  return { fetched, deleted: uidsToDelete.length };
}

// ============ Recursive MIME Parser ============

interface ParseResult {
  bodyText: string;
  bodyHtml: string;
  attachments: ParsedAttachment[];
}

function parseEmailComplete(source: string): ParseResult {
  const result: ParseResult = { bodyText: "", bodyHtml: "", attachments: [] };

  try {
    // Split headers from body
    const headerSplit = source.indexOf("\r\n\r\n");
    if (headerSplit === -1) {
      // Try with just \n\n
      const headerSplit2 = source.indexOf("\n\n");
      if (headerSplit2 === -1) return result;
      const headers = source.substring(0, headerSplit2);
      const body = source.substring(headerSplit2 + 2);
      parseMimePart(headers, body, result);
    } else {
      const headers = source.substring(0, headerSplit);
      const body = source.substring(headerSplit + 4);
      parseMimePart(headers, body, result);
    }
  } catch (e) {
    console.error("Body parse error:", e);
  }

  return result;
}

function parseMimePart(headers: string, body: string, result: ParseResult): void {
  const contentType = getHeader(headers, "content-type") || "text/plain";
  const boundary = extractBoundaryFromHeader(contentType);

  if (boundary) {
    // Multipart - split by boundary and recurse
    const parts = splitByBoundary(body, boundary);
    for (const part of parts) {
      const partHeaderEnd = findHeaderEnd(part);
      if (partHeaderEnd === -1) continue;

      const partHeaders = part.substring(0, partHeaderEnd);
      const partBody = part.substring(partHeaderEnd + (part.substring(partHeaderEnd).startsWith("\r\n\r\n") ? 4 : 2));
      parseMimePart(partHeaders, partBody, result);
    }
  } else {
    // Leaf part - extract content
    const disposition = getHeader(headers, "content-disposition") || "";
    const transferEncoding = getHeader(headers, "content-transfer-encoding") || "";
    const contentId = extractContentId(getHeader(headers, "content-id") || "");
    const ct = contentType.toLowerCase();

    // Check if this is an attachment
    const isAttachment = disposition.toLowerCase().includes("attachment") ||
      (disposition.toLowerCase().includes("inline") && !ct.startsWith("text/")) ||
      (!ct.startsWith("text/") && !ct.startsWith("multipart/"));

    if (isAttachment) {
      const filename = extractFilename(disposition, contentType) || `attachment_${Date.now()}`;
      const mimeType = ct.split(";")[0].trim();
      const decoded = decodeContent(body, transferEncoding);
      // Only treat as truly inline if it's an image referenced via Content-Id
      // (typical for HTML signature/CID images). PDFs/Docs with Content-Disposition: inline
      // (common in Apple Mail) should still be shown as real attachments.
      const isInline =
        disposition.toLowerCase().includes("inline") &&
        mimeType.startsWith("image/") &&
        !!contentId;
      result.attachments.push({
        filename,
        contentType: mimeType,
        content: decoded,
        isInline,
        contentId,
      });
    } else if (ct.includes("text/plain") && !result.bodyText) {
      let decoded = decodeTextContent(body, transferEncoding, contentType);
      result.bodyText = decoded.trim();
    } else if (ct.includes("text/html") && !result.bodyHtml) {
      let decoded = decodeTextContent(body, transferEncoding, contentType);
      result.bodyHtml = decoded.trim();
    }
  }
}

function findHeaderEnd(part: string): number {
  const crlfIdx = part.indexOf("\r\n\r\n");
  const lfIdx = part.indexOf("\n\n");
  if (crlfIdx !== -1 && lfIdx !== -1) return Math.min(crlfIdx, lfIdx);
  if (crlfIdx !== -1) return crlfIdx;
  return lfIdx;
}

function splitByBoundary(body: string, boundary: string): string[] {
  const parts: string[] = [];
  const delim = `--${boundary}`;
  const segments = body.split(delim);

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    // Skip closing boundary
    if (seg.trimStart().startsWith("--")) continue;
    // Remove leading newline
    const cleaned = seg.replace(/^\r?\n/, "");
    if (cleaned.trim()) parts.push(cleaned);
  }

  return parts;
}

function getHeader(headers: string, name: string): string | null {
  // Unfold headers first (continuation lines)
  const unfolded = headers.replace(/\r?\n[ \t]+/g, " ");
  const lines = unfolded.split(/\r?\n/);
  const prefix = name.toLowerCase() + ":";
  for (const line of lines) {
    if (line.toLowerCase().startsWith(prefix)) {
      return line.substring(prefix.length).trim();
    }
  }
  return null;
}

function extractBoundaryFromHeader(contentType: string): string | null {
  const match = contentType.match(/boundary="?([^";\r\n]+)"?/i);
  return match ? match[1].trim() : null;
}

function extractFilename(disposition: string, contentType: string): string | null {
  // Try disposition filename first
  let match = disposition.match(/filename="?([^";\r\n]+)"?/i);
  if (match) return decodeRfc2047(match[1].trim());

  // Try content-type name
  match = contentType.match(/name="?([^";\r\n]+)"?/i);
  if (match) return decodeRfc2047(match[1].trim());

  return null;
}

function extractContentId(value: string): string | null {
  if (!value) return null;
  return value.replace(/^</, "").replace(/>$/, "") || null;
}

function decodeContent(body: string, encoding: string): Uint8Array {
  const enc = encoding.toLowerCase().trim();
  if (enc === "base64") {
    try {
      const cleaned = body.replace(/\s/g, "");
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      return new TextEncoder().encode(body);
    }
  }
  return new TextEncoder().encode(body);
}

function extractCharset(contentType: string): string {
  const match = contentType.match(/charset="?([^";\s]+)"?/i);
  return normalizeCharset(match ? match[1].trim() : "utf-8");
}

function normalizeCharset(charset: string | null | undefined): string {
  const cs = String(charset || "utf-8")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();

  const aliases: Record<string, string> = {
    "": "utf-8",
    default: "utf-8",
    utf8: "utf-8",
    "utf-8": "utf-8",
    "us-ascii": "utf-8",
    ascii: "utf-8",
    "iso-8859-1": "iso-8859-1",
    iso8859_1: "iso-8859-1",
    latin1: "iso-8859-1",
    "latin-1": "iso-8859-1",
    "windows-1252": "windows-1252",
    cp1252: "windows-1252",
  };
  return aliases[cs] || cs;
}

function getNodeParams(node: any): Record<string, any> {
  const raw = node?.parameters || node?.params || {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  if (Array.isArray(raw)) return Object.fromEntries(raw as any);
  return raw && typeof raw === "object" ? raw : {};
}

function getParamValue(params: Record<string, any>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(params || {})) {
    if (String(key).toLowerCase() === wanted && value != null) return String(value);
  }
  return null;
}

function decodeBytesWithCharset(bytes: Uint8Array, charset: string): string {
  const normalized = normalizeCharset(charset);
  try {
    return new TextDecoder(normalized).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

function mojibakeScore(value: string): number {
  if (!value) return 0;
  const markers = (value.match(/[ÃÂ][\u0080-\u00BF\u00C0-\u00FF]?|�/g) || []).length;
  const common = (value.match(/Ã¤|Ã¶|Ã¼|Ã„|Ã–|Ãœ|ÃŸ|Â§|Â°|â‚¬|â€“|â€”|â€ž|â€œ|â€/g) || []).length;
  return markers + common * 2;
}

function repairMojibake(value: string): string {
  if (!value || mojibakeScore(value) === 0) return value;
  try {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code > 255) return value;
      bytes.push(code);
    }
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
    return mojibakeScore(repaired) < mojibakeScore(value) ? repaired : value;
  } catch {
    return value;
  }
}

function hasMojibake(value: string | null | undefined): boolean {
  return mojibakeScore(String(value || "")) > 0;
}

function decodeTextContent(body: string, encoding: string, contentType?: string): string {
  const enc = encoding.toLowerCase().trim();
  const charset = contentType ? extractCharset(contentType) : "utf-8";
  if (enc === "base64") {
    try {
      const cleaned = body.replace(/\s/g, "");
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return repairMojibake(decodeBytesWithCharset(bytes, charset));
    } catch {
      return body;
    }
  } else if (enc === "quoted-printable") {
    return repairMojibake(decodeQuotedPrintable(body, charset));
  }
  return repairMojibake(body);
}

function decodeQuotedPrintable(str: string, charset: string = "utf-8"): string {
  // Remove soft line breaks
  const withoutSoftBreaks = str.replace(/=\r?\n/g, "");
  // Collect bytes
  const bytes: number[] = [];
  let i = 0;
  while (i < withoutSoftBreaks.length) {
    if (withoutSoftBreaks[i] === "=" && i + 2 < withoutSoftBreaks.length) {
      const hex = withoutSoftBreaks.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(withoutSoftBreaks.charCodeAt(i));
    i++;
  }
  try {
    return decodeBytesWithCharset(new Uint8Array(bytes), charset);
  } catch {
    return decodeBytesWithCharset(new Uint8Array(bytes), "utf-8");
  }
}

function decodeRfc2047(str: string): string {
  // Decode RFC 2047 encoded words (e.g. =?UTF-8?B?...?=)
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
    try {
      const cs = charset.toLowerCase();
      if (encoding.toUpperCase() === "B") {
        const binary = atob(text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return decodeBytesWithCharset(bytes, cs);
      } else {
        return decodeQuotedPrintable(text.replace(/_/g, " "), cs);
      }
    } catch {
      return text;
    }
  });
}

function checkHasAttachments(bodyStructure: any): boolean {
  if (!bodyStructure) return false;
  if (isRealAttachmentNode(bodyStructure)) return true;
  if (bodyStructure.childNodes) {
    for (const child of bodyStructure.childNodes) {
      if (checkHasAttachments(child)) return true;
    }
  }
  return false;
}

function getNodeContentType(node: any): string {
  const type = String(node?.type || "").toLowerCase();
  const subtype = String(node?.subtype || "").toLowerCase();
  if (type.includes("/")) return type;
  if (type && subtype) return `${type}/${subtype}`;
  if (type) return type;
  return "application/octet-stream";
}

function getNodeDisposition(node: any): string {
  const raw = node?.disposition;
  if (!raw) return "";
  if (typeof raw === "string") return raw.toLowerCase();
  if (typeof raw === "object" && raw.type) return String(raw.type).toLowerCase();
  return String(raw).toLowerCase();
}

function isRealAttachmentNode(node: any): boolean {
  const ct = getNodeContentType(node);
  const disposition = getNodeDisposition(node);
  if (disposition === "attachment") return true;
  if (disposition === "inline" && !(ct.startsWith("text/") || ct === "message/rfc822")) return true;
  return !ct.startsWith("text/") && !ct.startsWith("multipart/") && ct !== "message/rfc822" && !!(node?.part || node?.partId);
}

function isInlineAttachmentNode(node: any): boolean {
  const ct = getNodeContentType(node);
  return getNodeDisposition(node) === "inline" && ct.startsWith("image/") && !!node?.id;
}

// Supabase Storage rejects keys with certain unicode/whitespace characters.
// Keep the extension, normalize the rest to safe ASCII.
function sanitizeStorageName(name: string): string {
  if (!name) return `attachment_${Date.now()}`;
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.substring(0, dot) : name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .substring(0, 120) || "file";
  const ext = (dot > 0 ? name.substring(dot + 1) : "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .substring(0, 10);
  return ext ? `${base}.${ext}` : base;
}

// Collect all attachment parts (with their IMAP part path like "2", "1.2") from bodyStructure
function collectAttachmentParts(
  node: any,
  path: string = "",
  out: Array<{ part: string; node: any }> = []
): Array<{ part: string; node: any }> {
  if (!node) return out;
  const currentPath = node.part || node.partId || path;

  if (node.childNodes && node.childNodes.length > 0) {
    for (const [index, child] of node.childNodes.entries()) {
      const childPath = child.part || child.partId || (path ? `${path}.${index + 1}` : `${index + 1}`);
      collectAttachmentParts(child, childPath, out);
    }
    return out;
  }

  if (isRealAttachmentNode(node) && currentPath) {
    out.push({ part: currentPath, node });
  }
  return out;
}

function collectTextParts(
  node: any,
  path: string = "",
  out: Array<{ part: string; node: any; kind: "plain" | "html" }> = []
): Array<{ part: string; node: any; kind: "plain" | "html" }> {
  if (!node) return out;
  const currentPath = node.part || node.partId || path;

  if (node.childNodes && node.childNodes.length > 0) {
    for (const [index, child] of node.childNodes.entries()) {
      const childPath = child.part || child.partId || (path ? `${path}.${index + 1}` : `${index + 1}`);
      collectTextParts(child, childPath, out);
    }
    return out;
  }

  const ct = getNodeContentType(node);
  const disposition = getNodeDisposition(node);
  if (disposition === "attachment") return out;
  // Singlepart messages have an empty path → IMAP requires "1" to fetch the body.
  const partPath = currentPath || "1";
  if (ct === "text/plain" || ct.startsWith("text/plain;")) out.push({ part: partPath, node, kind: "plain" });
  if (ct === "text/html" || ct.startsWith("text/html;")) out.push({ part: partPath, node, kind: "html" });
  return out;
}

async function streamPartToBytes(
  client: any,
  uid: number,
  part: string,
  maxBytes: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const dl = await client.download(`${uid}`, part, { uid: true });
  if (!dl || !dl.content) return { bytes: new Uint8Array(0), truncated: false };

  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  let truncated = false;
  for await (const chunk of dl.content) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    if (totalLen + bytes.length > maxBytes) {
      const remaining = Math.max(0, maxBytes - totalLen);
      if (remaining > 0) {
        chunks.push(bytes.slice(0, remaining));
        totalLen += remaining;
      }
      truncated = true;
      break;
    }
    chunks.push(bytes);
    totalLen += bytes.length;
  }

  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return { bytes: merged, truncated };
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  // chunked to avoid stack blow-up
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return s;
}

function decodeTextBytes(bytes: Uint8Array, node: any): string {
  const params = getNodeParams(node);
  const charset = normalizeCharset(getParamValue(params, "charset") || "utf-8");
  const encoding = String(node?.encoding || "").toLowerCase();

  // Apply Content-Transfer-Encoding (quoted-printable, base64) before charset decode.
  if (encoding === "base64" || encoding === "quoted-printable") {
    const raw = bytesToLatin1(bytes);
    const ct = `text/plain; charset=${charset}`;
    try {
      return decodeTextContent(raw, encoding, ct).trim();
    } catch {
      // fall through to plain decode
    }
  }
  try {
    return repairMojibake(decodeBytesWithCharset(bytes, charset)).trim();
  } catch {
    return repairMojibake(decodeBytesWithCharset(bytes, "utf-8")).trim();
  }
}

async function downloadBodyTextFromStructure(
  client: any,
  uid: number,
  bodyStructure: any
): Promise<{ bodyText: string; bodyHtml: string }> {
  const textParts = collectTextParts(bodyStructure);
  let bodyText = "";
  let bodyHtml = "";

  for (const { part, node, kind } of textParts) {
    if ((kind === "plain" && bodyText) || (kind === "html" && bodyHtml)) continue;
    try {
      const { bytes, truncated } = await streamPartToBytes(client, uid, part, MAX_TEXT_PART_BYTES);
      const decoded = decodeTextBytes(bytes, node);
      if (kind === "plain") bodyText = truncated ? `${decoded}\n\n[Text gekürzt]` : decoded;
      if (kind === "html") bodyHtml = truncated ? `${decoded}<p>[Text gekürzt]</p>` : decoded;
    } catch (err: any) {
      console.error(`Download text part ${part} failed:`, err.message);
    }
  }

  // Last-resort fallback: if structure walk yielded nothing, try whole TEXT body.
  if (!bodyText && !bodyHtml) {
    try {
      const { bytes } = await streamPartToBytes(client, uid, "TEXT", MAX_TEXT_PART_BYTES);
      if (bytes.byteLength > 0) {
        const txt = repairMojibake(decodeBytesWithCharset(bytes, "utf-8")).trim();
        if (txt) bodyText = txt;
      }
    } catch (err: any) {
      console.error(`Fallback TEXT download failed for UID ${uid}:`, err.message);
    }
  }

  return { bodyText, bodyHtml };
}

async function downloadAttachmentsFromStructure(
  client: any,
  uid: number,
  bodyStructure: any,
  limits: { maxPartBytes: number; maxTotalBytes: number } = {
    maxPartBytes: MAX_ATTACHMENT_PART_BYTES,
    maxTotalBytes: MAX_ATTACHMENT_TOTAL_BYTES,
  }
): Promise<ParsedAttachment[]> {
  const parts = collectAttachmentParts(bodyStructure);
  const results: ParsedAttachment[] = [];
  let totalBytes = 0;

  for (const { part, node } of parts) {
    try {
      if (totalBytes >= limits.maxTotalBytes) {
        console.warn(`Attachment total byte budget reached for UID ${uid}; remaining parts skipped.`);
        break;
      }
      const partLimit = Math.min(limits.maxPartBytes, limits.maxTotalBytes - totalBytes);
      const { bytes: rawMerged, truncated } = await streamPartToBytes(client, uid, part, partLimit);
      if (truncated) {
        console.warn(`Attachment part ${part} for UID ${uid} exceeded byte limit and was skipped.`);
        continue;
      }
      // Decode Content-Transfer-Encoding for attachments (typically base64).
      const encoding = String(node?.encoding || "").toLowerCase();
      let merged = rawMerged;
      if (encoding === "base64" || encoding === "quoted-printable") {
        try {
          merged = decodeContent(bytesToLatin1(rawMerged), encoding);
        } catch {
          merged = rawMerged;
        }
      }
      totalBytes += merged.byteLength;

      const dispParams = node.dispositionParameters || {};
      const ctParams = node.parameters || {};
      let filename =
        dispParams.filename ||
        dispParams["filename*"] ||
        ctParams.name ||
        ctParams["name*"] ||
        `attachment_${part}`;
      filename = decodeRfc2047(String(filename));

      const mimeType = getNodeContentType(node);
      const isInline = isInlineAttachmentNode(node);
      const contentId = node.id ? String(node.id).replace(/^</, "").replace(/>$/, "") : null;

      results.push({
        filename,
        contentType: mimeType,
        content: merged,
        isInline,
        contentId,
      });
    } catch (err: any) {
      console.error(`Download part ${part} failed:`, err.message);
    }
  }

  return results;
}

// ---- Reparse a single email by ID: re-fetch source from IMAP and re-extract attachments ----
async function reparseSingleEmail(supabase: any, emailId: string) {
  const { data: email, error: emailErr } = await supabase
    .from("emails")
    .select("id, account_id, message_id, subject")
    .eq("id", emailId)
    .single();
  if (emailErr || !email) throw new Error(`Email ${emailId} not found`);

  const { data: account, error: accErr } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("id", email.account_id)
    .single();
  if (accErr || !account) throw new Error(`Account for email not found`);

  const isSecure = account.use_ssl || account.imap_port === 993;
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: isSecure,
    auth: { user: account.imap_user, pass: account.imap_password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  client.on("error", (err: any) => {
    if (!isIgnorableConnectionError(err)) {
      console.error(`Reparse IMAP error:`, err.message);
    }
  });

  await client.connect();
  let summary: any = { emailId, message_id: email.message_id };
  try {
    // Search INBOX first, then walk all folders, since older messages may have been moved.
    let uid: number | null = null;
    let foundFolder = "INBOX";
    const tryFolder = async (folderPath: string) => {
      try {
        await client.mailboxOpen(folderPath);
        const res = await client.search({ header: { "message-id": email.message_id } }, { uid: true });
        if (res && res.length > 0) {
          uid = res[res.length - 1];
          foundFolder = folderPath;
          return true;
        }
      } catch (_) {
        // skip unreadable folders
      }
      return false;
    };
    if (!(await tryFolder("INBOX"))) {
      const folders = await client.list();
      for (const f of folders) {
        if (!f.path || f.path === "INBOX") continue;
        if (await tryFolder(f.path)) break;
      }
    }
    if (uid === null) {
      throw new Error(`Message-ID ${email.message_id} not found on server (searched all folders)`);
    }
    summary.uid = uid;
    summary.folder = foundFolder;

    const msg = await client.fetchOne(`${uid}`, {
      uid: true,
      source: true,
      bodyStructure: true,
    }, { uid: true });
    if (!msg) throw new Error(`fetchOne returned null for UID ${uid}`);

    const source = msg.source?.toString() || "";
    const parsed = parseEmailComplete(source);
    const structureBody = await downloadBodyTextFromStructure(client, uid, msg.bodyStructure);
    let attachments = parsed.attachments;
    summary.parser_attachments = attachments.length;
    summary.structure_has_attachments = checkHasAttachments(msg.bodyStructure);

    if (attachments.length === 0 && summary.structure_has_attachments) {
      const downloaded = await downloadAttachmentsFromStructure(client, uid, msg.bodyStructure);
      attachments = downloaded;
      summary.fallback_downloaded = downloaded.length;
    }

    // Backfill body if missing/empty (older rows fetched before transfer-encoding decoding was fixed)
    try {
      const { data: row } = await supabase
        .from("emails")
        .select("body_text, body_html")
        .eq("id", emailId)
        .single();
      const needsBody = !((row?.body_text || "").length) && !((row?.body_html || "").length);
      const needsEncodingRepair = hasMojibake(row?.body_text) || hasMojibake(row?.body_html);
      const nextBodyText = structureBody.bodyText || parsed.bodyText || repairMojibake(row?.body_text || "");
      const nextBodyHtml = structureBody.bodyHtml || parsed.bodyHtml || repairMojibake(row?.body_html || "");
      if ((needsBody || needsEncodingRepair) && (nextBodyText || nextBodyHtml)) {
        await supabase
          .from("emails")
          .update({
            body_text: nextBodyText || null,
            body_html: nextBodyHtml || null,
          })
          .eq("id", emailId);
        summary.body_backfilled = true;
        summary.encoding_repaired = needsEncodingRepair;
      }
    } catch (e: any) {
      console.error("Body backfill failed:", e.message);
    }

    // Insert any attachments that don't yet exist for this email.
    // Dedup-Key = file_name + file_size, damit gleichnamige Anhänge mit unterschiedlicher Größe
    // (z. B. 4 verschiedene "rechnung.pdf") nicht fälschlich als Duplikate gelten.
    const { data: existingAtt } = await supabase
      .from("email_attachments")
      .select("file_name, file_size")
      .eq("email_id", emailId);
    const existingKeys = new Set(
      (existingAtt || []).map((a: any) => `${a.file_name}::${a.file_size}`),
    );

    let inserted = 0;
    for (const [idx, att] of attachments.entries()) {
      if (existingKeys.has(`${att.filename}::${att.content.byteLength}`)) continue;
      // Index-Prefix verhindert Überschreiben bei gleichnamigen Anhängen
      const storagePath = `${emailId}/${idx}_${sanitizeStorageName(att.filename)}`;
      const { error: upErr } = await supabase.storage
        .from("email-attachments")
        .upload(storagePath, att.content, { contentType: att.contentType, upsert: true });
      if (upErr) {
        console.error("upload err", upErr.message);
        continue;
      }
      await supabase.from("email_attachments").insert({
        email_id: emailId,
        file_name: att.filename,
        mime_type: att.contentType,
        file_size: att.content.byteLength,
        file_path: storagePath,
        is_inline: att.isInline,
        content_id: att.contentId,
      });
      inserted++;
    }
    summary.inserted = inserted;

    // Update has_attachments flag
    const { data: allAtt } = await supabase
      .from("email_attachments")
      .select("is_inline")
      .eq("email_id", emailId);
    const hasReal = (allAtt || []).some((a: any) => a.is_inline === false);
    await supabase.from("emails").update({ has_attachments: hasReal }).eq("id", emailId);
    summary.has_attachments = hasReal;
  } finally {
    try { if (client.usable) await client.logout(); } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
    try { client.close(); } catch (_) {}
  }

  return summary;
}
