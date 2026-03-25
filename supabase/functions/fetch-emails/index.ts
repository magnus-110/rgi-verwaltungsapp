import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
}

interface ParsedAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
  isInline: boolean;
  contentId: string | null;
}

// Suppress Strato TLS close_notify errors at the event loop level
globalThis.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.message?.includes("close_notify") || e.reason?.code === "UnexpectedEof") {
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

  try {
    const { data: accounts, error: accError } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("is_active", true);

    if (accError) throw accError;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "Keine aktiven E-Mail-Konten gefunden" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      .select("account_id, user_id");

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

    // Trigger classification
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      await fetch(`${supabaseUrl}/functions/v1/classify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({}),
      });
    } catch (classifyErr) {
      console.error("classify trigger failed:", classifyErr);
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
  const isSecure = account.imap_port === 993;
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

  await client.connect();

  let fetched = 0;
  const uidsToDelete: number[] = [];

  try {
    const mailbox = await client.mailboxOpen("INBOX");
    console.log(`Mailbox opened: ${mailbox.exists} messages, uidNext: ${mailbox.uidNext}`);

    if (mailbox.exists === 0) {
      return { fetched: 0, deleted: 0 };
    }

    let uids: number[];
    if (account.last_uid) {
      const lastUid = parseInt(account.last_uid);
      uids = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
      uids = uids.filter((u: number) => u > lastUid);
    } else {
      uids = await client.search({ all: true }, { uid: true });
    }

    console.log(`Found ${uids.length} UIDs to fetch`);
    const uidsToFetch = uids.slice(0, 50);
    let maxUid = account.last_uid ? parseInt(account.last_uid) : 0;

    for (const uid of uidsToFetch) {
      try {
        const msg = await client.fetchOne(`${uid}`, {
          uid: true,
          flags: true,
          envelope: true,
          source: true,
          bodyStructure: true,
        }, { uid: true });

        if (!msg) continue;

        const envelope = msg.envelope;
        const source = msg.source?.toString() || "";

        // Recursive MIME parsing
        const { bodyText, bodyHtml, attachments } = parseEmailComplete(source);
        const hasAttachments = attachments.length > 0 || checkHasAttachments(msg.bodyStructure);

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
          for (const att of attachments) {
            try {
              const storagePath = `${insertedEmail.id}/${att.filename}`;
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
      } catch (msgErr: any) {
        console.error(`Error processing message UID ${uid}:`, msgErr.message);
      }
    }

    console.log(`Fetch loop complete: ${fetched} emails fetched, maxUid: ${maxUid}`);

    if (maxUid > 0) {
      await supabase
        .from("email_accounts")
        .update({ last_uid: maxUid.toString() })
        .eq("id", account.id);
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
    try {
      await client.logout();
    } catch (_e) {
      // ignore
    }
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
      const isInline = disposition.toLowerCase().includes("inline");
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
  return match ? match[1].trim().toLowerCase() : "utf-8";
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
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return body;
    }
  } else if (enc === "quoted-printable") {
    return decodeQuotedPrintable(body, charset);
  }
  return body;
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
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

function decodeCharset(_text: string, _contentType: string): string {
  // Charset is now handled directly in decodeTextContent and decodeQuotedPrintable
  return _text;
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
        return new TextDecoder(cs).decode(bytes);
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
  if (bodyStructure.disposition === "attachment") return true;
  if (bodyStructure.childNodes) {
    for (const child of bodyStructure.childNodes) {
      if (checkHasAttachments(child)) return true;
    }
  }
  return false;
}