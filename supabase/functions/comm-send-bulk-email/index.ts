// Send a personalized bulk email campaign via the configured SMTP account.
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import nodemailer from "npm:nodemailer@6.9.16";
import { loadRecipients, renderString, RecipientFilter } from "../_shared/comm-vars.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { campaign_id, test_email } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    const { data: campaign, error: cErr } = await admin
      .from("comm_campaigns").select("*").eq("id", campaign_id).single();
    if (cErr || !campaign) return json({ error: "Campaign not found" }, 404);

    if (!campaign.email_account_id) return json({ error: "Kein E-Mail-Konto ausgewählt" }, 400);

    const { data: account, error: accErr } = await admin
      .from("email_accounts").select("*").eq("id", campaign.email_account_id).single();
    if (accErr || !account) return json({ error: "E-Mail-Konto nicht gefunden" }, 404);

    // Resolve subject/body: campaign overrides > template
    let subject = campaign.subject_override as string | null;
    let bodyHtml = campaign.body_html_override as string | null;
    if ((!subject || !bodyHtml) && campaign.template_id) {
      const { data: t } = await admin.from("comm_templates")
        .select("subject, body_html").eq("id", campaign.template_id).single();
      if (!subject) subject = t?.subject || null;
      if (!bodyHtml) bodyHtml = t?.body_html || null;
    }
    if (!subject || !bodyHtml) return json({ error: "Betreff oder Inhalt fehlt" }, 400);

    const isSecure = account.smtp_port === 465;
    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: isSecure,
      auth: { user: account.smtp_user, pass: account.smtp_password },
      tls: { rejectUnauthorized: false },
    });

    // TEST MODE: send single mail to test_email using first recipient's vars
    if (test_email) {
      const filter = (campaign.recipient_filter || {}) as RecipientFilter;
      const freeVars = (campaign.free_vars || {}) as Record<string, string>;
      const recipients = await loadRecipients(admin, campaign.building_id, { ...filter, require_email: false }, freeVars);
      const sample = recipients[0]?.vars || freeVars;
      const renderedSubject = renderString(subject, sample);
      const renderedBody = renderString(bodyHtml, sample);
      await transporter.sendMail({
        from: `${account.display_name} <${account.email_address}>`,
        to: test_email,
        subject: `[TEST] ${renderedSubject}`,
        html: renderedBody,
      });
      return json({ success: true, test: true });
    }

    await admin.from("comm_campaigns").update({ status: "sending", error_message: null }).eq("id", campaign_id);

    const filter = (campaign.recipient_filter || {}) as RecipientFilter;
    const freeVars = (campaign.free_vars || {}) as Record<string, string>;
    const recipients = await loadRecipients(admin, campaign.building_id, { ...filter, require_email: true }, freeVars);

    if (recipients.length === 0) {
      await admin.from("comm_campaigns").update({ status: "failed", error_message: "Keine Empfänger mit E-Mail" }).eq("id", campaign_id);
      return json({ error: "Keine Empfänger mit E-Mail-Adresse" }, 400);
    }

    // Reset previous recipients
    await admin.from("comm_recipients").delete().eq("campaign_id", campaign_id);

    let ok = 0;
    let fail = 0;

    for (const r of recipients) {
      const renderedSubject = renderString(subject, r.vars);
      const renderedBody = renderString(bodyHtml, r.vars);
      try {
        await transporter.sendMail({
          from: `${account.display_name} <${account.email_address}>`,
          to: r.email!,
          subject: renderedSubject,
          html: renderedBody,
        });
        await admin.from("comm_recipients").insert({
          campaign_id,
          contact_id: r.contact_id,
          person_id: r.person_id,
          building_id: r.building_id,
          display_name: r.display_name,
          email: r.email,
          resolved_vars: r.vars,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        ok++;
      } catch (e: any) {
        await admin.from("comm_recipients").insert({
          campaign_id,
          contact_id: r.contact_id,
          person_id: r.person_id,
          building_id: r.building_id,
          display_name: r.display_name,
          email: r.email,
          resolved_vars: r.vars,
          status: "failed",
          error: e?.message || "Send failed",
        });
        fail++;
      }
      // throttle ~1/sec to be friendly to SMTP
      await new Promise((res) => setTimeout(res, 1000));
    }

    await admin.from("comm_campaigns").update({
      status: fail === recipients.length ? "failed" : "sent",
      recipient_count: recipients.length,
      sent_count: ok,
      failed_count: fail,
      completed_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return json({ success: true, ok, failed: fail });
  } catch (e: any) {
    console.error("comm-send-bulk-email error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
