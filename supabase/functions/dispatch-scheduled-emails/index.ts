// Cron-driven dispatcher: sends scheduled single emails (Postfach-Compose with send-time)
// Triggered by pg_cron every minute. Uses SMTP (nodemailer) directly with the email_account credentials.
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: due, error } = await admin
    .from("scheduled_emails")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);

  if (error) {
    console.error("dispatch query failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const item of due || []) {
    // Lock: flip status to 'sending' atomically
    const { error: lockErr, data: locked } = await admin
      .from("scheduled_emails")
      .update({ status: "sending" })
      .eq("id", item.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (lockErr || !locked) continue;

    try {
      // Load account credentials
      const { data: account, error: accErr } = await admin
        .from("email_accounts")
        .select("*")
        .eq("id", item.account_id)
        .single();
      if (accErr || !account) throw new Error("E-Mail-Konto nicht gefunden");

      const isSecure = account.smtp_port === 465;
      const transporter = nodemailer.createTransport({
        host: account.smtp_host,
        port: account.smtp_port,
        secure: isSecure,
        auth: { user: account.smtp_user, pass: account.smtp_password },
        tls: { rejectUnauthorized: false },
      });

      const mailOptions: any = {
        from: `${account.display_name} <${account.email_address}>`,
        to: (item.to_addresses || []).join(", "),
        subject: item.subject || "(Kein Betreff)",
      };
      if (item.body_html) {
        mailOptions.html = item.body_html;
        mailOptions.text = item.body_text || "";
      } else {
        mailOptions.text = item.body_text || "";
      }
      if (item.cc_addresses?.length) mailOptions.cc = item.cc_addresses.join(", ");
      if (item.bcc_addresses?.length) mailOptions.bcc = item.bcc_addresses.join(", ");

      const atts = Array.isArray(item.attachments) ? item.attachments : [];
      if (atts.length > 0) {
        mailOptions.attachments = atts.map((att: any) => ({
          filename: att.filename,
          content: Uint8Array.from(atob(att.content), (c) => c.charCodeAt(0)),
          contentType: att.contentType || "application/octet-stream",
        }));
      }

      await transporter.sendMail(mailOptions);

      // Save into emails (Gesendet folder)
      const { data: sentFolder } = await admin
        .from("email_folders")
        .select("id")
        .eq("name", "Gesendet")
        .maybeSingle();

      await admin.from("emails").insert({
        account_id: account.id,
        folder_id: sentFolder?.id,
        subject: item.subject || null,
        from_address: account.email_address,
        from_name: account.display_name,
        to_addresses: item.to_addresses,
        cc_addresses: item.cc_addresses || null,
        body_text: item.body_text || null,
        body_html: item.body_html || null,
        date: new Date().toISOString(),
        is_read: true,
        has_attachments: atts.length > 0,
        message_id: `scheduled-${item.id}-${Date.now()}`,
      });

      await admin.from("scheduled_emails").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        // wipe attachment payloads to save space (keep meta if needed later)
        attachments: atts.map((a: any) => ({ filename: a.filename, contentType: a.contentType, size: a.size })),
      }).eq("id", item.id);
      sent++;
    } catch (e: any) {
      console.error("dispatch send failed", item.id, e?.message);
      await admin.from("scheduled_emails").update({
        status: "failed",
        error_message: e?.message || String(e),
      }).eq("id", item.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed, considered: due?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
