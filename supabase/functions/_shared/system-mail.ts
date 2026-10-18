// Automatische Mails der App (Willkommen, Passwort, Schlüssel, Anfragen …).
// Früher liefen diese über Make.com – jetzt verschickt die App selbst über das
// hinterlegte Postfach (Einstellung rgi_company_settings.system_mail_account_id,
// sonst info@rgi-immobilien.de). Jede Mail wird in system_mail_log vermerkt.
import nodemailer from "npm:nodemailer@6.9.16";

export interface SystemMailAttachment {
  filename: string;
  content: Uint8Array;
  contentType?: string;
  cid?: string;
}

export interface SystemMail {
  kind: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: SystemMailAttachment[];
  refType?: string;
  refId?: string | null;
}

const FALLBACK_ADDRESS = "info@rgi-immobilien.de";

// deno-lint-ignore no-explicit-any
async function systemAccount(admin: any) {
  let accountId: string | null = null;
  try {
    const { data } = await admin
      .from("rgi_company_settings")
      .select("system_mail_account_id")
      .limit(1)
      .maybeSingle();
    accountId = data?.system_mail_account_id ?? null;
  } catch {
    accountId = null;
  }
  if (accountId) {
    const { data } = await admin.from("email_accounts").select("*").eq("id", accountId).maybeSingle();
    if (data?.smtp_host) return data;
  }
  const { data } = await admin
    .from("email_accounts")
    .select("*")
    .eq("email_address", FALLBACK_ADDRESS)
    .maybeSingle();
  return data;
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

// deno-lint-ignore no-explicit-any
export async function sendSystemMail(admin: any, mail: SystemMail): Promise<{ ok: boolean; error?: string }> {
  let error: string | undefined;
  try {
    const account = await systemAccount(admin);
    if (!account?.smtp_host) throw new Error("Kein Postfach für automatische Mails eingerichtet");
    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_port === 465,
      auth: { user: account.smtp_user, pass: account.smtp_password },
      tls: { rejectUnauthorized: Deno.env.get("SMTP_ALLOW_SELF_SIGNED") === "true" ? false : true },
    });
    await transporter.sendMail({
      from: `${account.display_name || "RGI Immobilien"} <${account.email_address}>`,
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text ?? htmlToText(mail.html),
      attachments: (mail.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        cid: a.cid,
      })),
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[system-mail] ${mail.kind} an ${mail.to} fehlgeschlagen:`, error);
  }
  try {
    await admin.from("system_mail_log").insert({
      kind: mail.kind,
      recipient: mail.to,
      subject: mail.subject,
      status: error ? "fehler" : "gesendet",
      error: error ?? null,
      ref_type: mail.refType ?? null,
      ref_id: mail.refId ?? null,
    });
  } catch {
    // Protokoll ist nur Beiwerk.
  }
  return error ? { ok: false, error } : { ok: true };
}
