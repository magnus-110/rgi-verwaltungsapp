import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get all active email accounts
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

    // Get inbox folder ID
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

    for (const account of accounts as EmailAccount[]) {
      try {
        console.log(`Fetching emails for ${account.email_address}...`);
        const result = await fetchAccountEmails(
          supabaseAdmin,
          account,
          inboxFolder?.id,
          sentFolder?.id
        );
        results[account.email_address] = result;

        // Update last sync time
        await supabaseAdmin
          .from("email_accounts")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_error: null,
          })
          .eq("id", account.id);
      } catch (err: any) {
        console.error(
          `Error fetching ${account.email_address}:`,
          err.message
        );
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
  sentFolderId: string | undefined
) {
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.use_ssl,
    auth: {
      user: account.imap_user,
      pass: account.imap_password,
    },
    logger: false,
  });

  await client.connect();

  let fetched = 0;
  const uidsToDelete: number[] = [];

  try {
    // Open INBOX
    const mailbox = await client.mailboxOpen("INBOX");
    console.log(
      `Mailbox opened: ${mailbox.exists} messages, uidNext: ${mailbox.uidNext}`
    );

    // Determine which messages to fetch
    let searchCriteria: any;
    if (account.last_uid) {
      // Fetch messages newer than last known UID
      searchCriteria = { uid: `${parseInt(account.last_uid) + 1}:*` };
    } else {
      // First sync: fetch last 100 messages
      searchCriteria = { seq: `${Math.max(1, mailbox.exists - 99)}:*` };
    }

    // Fetch messages
    let maxUid = account.last_uid ? parseInt(account.last_uid) : 0;

    for await (const msg of client.fetch(searchCriteria, {
      uid: true,
      flags: true,
      envelope: true,
      source: true,
      bodyStructure: true,
    })) {
      if (fetched >= 50) break; // Limit per run

      try {
        const envelope = msg.envelope;
        const source = msg.source?.toString() || "";

        // Parse body from source
        const { bodyText, bodyHtml } = parseEmailBody(source);

        // Check for attachments
        const hasAttachments = checkHasAttachments(msg.bodyStructure);

        // Determine from address and name
        const fromAddr =
          envelope.from?.[0]?.address || "";
        const fromName =
          envelope.from?.[0]?.name || "";

        // To addresses
        const toAddresses = (envelope.to || [])
          .map((a: any) => a.address)
          .filter(Boolean);
        const toNames = (envelope.to || [])
          .map((a: any) => a.name || a.address)
          .filter(Boolean);

        // CC addresses
        const ccAddresses = (envelope.cc || [])
          .map((a: any) => a.address)
          .filter(Boolean);

        // Check if already imported (by message_id)
        const messageId = envelope.messageId || `uid-${account.id}-${msg.uid}`;
        const { data: existing } = await supabase
          .from("emails")
          .select("id")
          .eq("message_id", messageId)
          .maybeSingle();

        if (existing) {
          if (msg.uid > maxUid) maxUid = msg.uid;
          continue;
        }

        // Insert email
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
            date: envelope.date
              ? new Date(envelope.date).toISOString()
              : new Date().toISOString(),
            is_read: msg.flags?.has("\\Seen") || false,
            is_starred: msg.flags?.has("\\Flagged") || false,
            has_attachments: hasAttachments,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("Insert error:", insertError.message);
          continue;
        }

        // Track UID for deletion
        if (account.delete_after_import) {
          uidsToDelete.push(msg.uid);
        }

        if (msg.uid > maxUid) maxUid = msg.uid;
        fetched++;
      } catch (msgErr: any) {
        console.error(`Error processing message UID ${msg.uid}:`, msgErr.message);
      }
    }

    // Update last_uid
    if (maxUid > 0) {
      await supabase
        .from("email_accounts")
        .update({ last_uid: maxUid.toString() })
        .eq("id", account.id);
    }

    // Delete imported messages from server if configured
    if (account.delete_after_import && uidsToDelete.length > 0) {
      try {
        await client.messageDelete(uidsToDelete, { uid: true });
        console.log(
          `Deleted ${uidsToDelete.length} messages from server for ${account.email_address}`
        );
      } catch (delErr: any) {
        console.error("Delete from server failed:", delErr.message);
      }
    }
  } finally {
    await client.logout();
  }

  return { fetched, deleted: uidsToDelete.length };
}

function parseEmailBody(source: string): {
  bodyText: string;
  bodyHtml: string;
} {
  let bodyText = "";
  let bodyHtml = "";

  try {
    // Simple MIME parsing - find text/plain and text/html parts
    const boundary = extractBoundary(source);

    if (boundary) {
      const parts = source.split(`--${boundary}`);
      for (const part of parts) {
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) continue;

        const headers = part.substring(0, headerEnd).toLowerCase();
        let content = part.substring(headerEnd + 4);

        // Remove trailing boundary markers
        const nextBoundary = content.indexOf(`--${boundary}`);
        if (nextBoundary !== -1) {
          content = content.substring(0, nextBoundary);
        }

        // Handle transfer encoding
        if (headers.includes("content-transfer-encoding: base64")) {
          try {
            content = atob(content.replace(/\s/g, ""));
          } catch { /* ignore decode errors */ }
        } else if (
          headers.includes("content-transfer-encoding: quoted-printable")
        ) {
          content = decodeQuotedPrintable(content);
        }

        if (headers.includes("text/plain") && !bodyText) {
          bodyText = content.trim();
        } else if (headers.includes("text/html") && !bodyHtml) {
          bodyHtml = content.trim();
        }
      }
    } else {
      // Non-multipart message
      const headerEnd = source.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const headers = source.substring(0, headerEnd).toLowerCase();
        let content = source.substring(headerEnd + 4);

        if (headers.includes("content-transfer-encoding: base64")) {
          try {
            content = atob(content.replace(/\s/g, ""));
          } catch { /* ignore */ }
        } else if (
          headers.includes("content-transfer-encoding: quoted-printable")
        ) {
          content = decodeQuotedPrintable(content);
        }

        if (headers.includes("text/html")) {
          bodyHtml = content.trim();
        } else {
          bodyText = content.trim();
        }
      }
    }
  } catch (e) {
    console.error("Body parse error:", e);
  }

  return { bodyText, bodyHtml };
}

function extractBoundary(source: string): string | null {
  const match = source.match(/boundary="?([^";\r\n]+)"?/i);
  return match ? match[1].trim() : null;
}

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
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
