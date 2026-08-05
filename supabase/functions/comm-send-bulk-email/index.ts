// Send a personalized bulk email campaign via the configured SMTP account.
// Phase 2: supports retry mode (only failed recipients), attachments, and scheduled execution.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import nodemailer from "https://esm.sh/nodemailer@6.9.16";
import { loadRecipients, renderString, RecipientFilter } from "../_shared/comm-vars.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Authorization: only admins/employees may send bulk email ---
    const auth = await requireAdmin(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { campaign_id, test_email, retry_failed_only } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    const { data: campaign, error: cErr } = await admin
      .from("comm_campaigns").select("*").eq("id", campaign_id).single();
    if (cErr || !campaign) return json({ error: "Campaign not found" }, 404);

    if (!campaign.email_account_id) return json({ error: "Kein E-Mail-Konto ausgewählt" }, 400);

    const { data: account, error: accErr } = await admin
      .from("email_accounts").select("*").eq("id", campaign.email_account_id).single();
    if (accErr || !account) return json({ error: "E-Mail-Konto nicht gefunden" }, 404);

    let subject = campaign.subject_override as string | null;
    let bodyHtml = campaign.body_html_override as string | null;
    let bodyFormat = (campaign.body_format as "html" | "plain") || "html";
    if ((!subject || !bodyHtml) && campaign.template_id) {
      const { data: t } = await admin.from("comm_templates")
        .select("subject, body_html, body_format").eq("id", campaign.template_id).single();
      if (!subject) subject = t?.subject || null;
      if (!bodyHtml) bodyHtml = t?.body_html || null;
      if (!campaign.body_format && t?.body_format) bodyFormat = t.body_format as "html" | "plain";
    }
    if (!subject || !bodyHtml) return json({ error: "Betreff oder Inhalt fehlt" }, 400);

    // Signatur des Kontos unter den Text hängen (falls vorhanden und nicht bereits enthalten)
    const signature = ((account.signature_html as string | null) || "").trim();
    const withSignature = (rendered: string) => {
      if (!signature) return rendered;
      if (rendered.includes(signature)) return rendered;
      return bodyFormat === "plain"
        ? `${rendered}\n\n${signature}`
        : `${rendered}<br /><br />${signature}`;
    };

    // Build payload key based on chosen format.
    // Im HTML-Modus kommt der Text aus einem Plain-Text-Editor: Zeilenumbrüche
    // müssen zu <br> werden, sonst kommt alles als ein Block an.
    const buildBody = (rendered: string) =>
      bodyFormat === "plain" ? { text: rendered } : { html: ensureHtmlBody(rendered) };


    const isSecure = account.smtp_port === 465;
    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: isSecure,
      auth: { user: account.smtp_user, pass: account.smtp_password },
      tls: { rejectUnauthorized: Deno.env.get("SMTP_ALLOW_SELF_SIGNED") === "true" ? false : true },
    });

    // Pre-load attachments once
    const attachmentPaths: string[] = (campaign.attachment_paths || []) as string[];
    const attachments: Array<{ filename: string; content: Uint8Array }> = [];
    for (const p of attachmentPaths) {
      const { data: f, error: dlErr } = await admin.storage.from("comm-assets").download(p);
      if (dlErr || !f) {
        console.warn("attachment missing", p, dlErr?.message);
        continue;
      }
      const bytes = new Uint8Array(await f.arrayBuffer());
      const fn = p.split("/").pop() || "anhang";
      attachments.push({ filename: fn, content: bytes });
    }

    // TEST MODE
    if (test_email) {
      const filter = (campaign.recipient_filter || {}) as RecipientFilter;
      const freeVars = (campaign.free_vars || {}) as Record<string, string>;
      const recipients = await loadRecipients(admin, campaign.building_id, { ...filter, require_email: false, expand_all_emails: true }, freeVars);
      const sample = recipients[0]?.vars || freeVars;
      await transporter.sendMail({
        from: `${account.display_name} <${account.email_address}>`,
        to: test_email,
        subject: `[TEST] ${renderString(subject, sample)}`,
        ...buildBody(withSignature(renderString(bodyHtml, sample))),
        attachments,
      });
      return json({ success: true, test: true });
    }

    await admin.from("comm_campaigns").update({ status: "sending", error_message: null }).eq("id", campaign_id);

    let recipients: any[] = [];
    if (retry_failed_only) {
      // rebuild from previously failed recipient rows
      const { data: failed } = await admin.from("comm_recipients")
        .select("*").eq("campaign_id", campaign_id).eq("status", "failed");
      recipients = (failed || []).filter((r: any) => r.email).map((r: any) => ({
        contact_id: r.contact_id, person_id: r.person_id, building_id: r.building_id,
        display_name: r.display_name, email: r.email, vars: r.resolved_vars || {},
      }));
      // delete old failed rows so we can reinsert with fresh status
      await admin.from("comm_recipients").delete().eq("campaign_id", campaign_id).eq("status", "failed");
    } else {
      const filter = (campaign.recipient_filter || {}) as RecipientFilter;
      const freeVars = (campaign.free_vars || {}) as Record<string, string>;
      // First load WITHOUT email requirement to detect "selected but missing email" cases
      const allSelected = await loadRecipients(admin, campaign.building_id, { ...filter, require_email: false, expand_all_emails: true }, freeVars);
      recipients = allSelected.filter((r) => !!r.email);
      const missing = allSelected.length - recipients.length;
      console.log(`[comm-send-bulk-email] campaign=${campaign_id} selected=${allSelected.length} withEmail=${recipients.length} missingEmail=${missing}`);
      await admin.from("comm_recipients").delete().eq("campaign_id", campaign_id);

      if (allSelected.length > 0 && recipients.length === 0) {
        const sample = allSelected.slice(0, 3).map((r) => r.display_name).join(", ");
        const msg = `Keine der ${allSelected.length} ausgewählten Personen hat eine hinterlegte E-Mail-Adresse (z. B. ${sample}). Bitte E-Mail-Adressen im Adressbuch ergänzen.`;
        await admin.from("comm_campaigns").update({ status: "failed", error_message: msg }).eq("id", campaign_id);
        return json({ error: msg }, 400);
      }
    }

    if (recipients.length === 0) {
      await admin.from("comm_campaigns").update({ status: "failed", error_message: "Keine Empfänger" }).eq("id", campaign_id);
      return json({ error: "Keine Empfänger ausgewählt" }, 400);
    }

    // Lookup Gesendet-Folder (für Eintrag im Postfach)
    const { data: sentFolder } = await admin
      .from("email_folders")
      .select("id")
      .eq("name", "Gesendet")
      .maybeSingle();

    // Load per-recipient overrides (subject/body/persönliche Anhänge)
    const { data: overridesData } = await admin
      .from("comm_recipient_overrides")
      .select("contact_id, assignment_id, email, subject, body_html, attachment_paths")
      .eq("campaign_id", campaign_id);

    type Override = { subject: string | null; body_html: string | null; attachment_paths: string[] };
    const overrideByKey = new Map<string, Override>();
    const overrideByContact = new Map<string, Override>();
    for (const o of overridesData || []) {
      const val: Override = {
        subject: o.subject ?? null,
        body_html: o.body_html ?? null,
        attachment_paths: (o.attachment_paths || []) as string[],
      };
      if (o.assignment_id) {
        overrideByKey.set(`${o.assignment_id}|${(o.email || "").toLowerCase()}`, val);
      }
      if (o.contact_id && !overrideByContact.has(o.contact_id)) overrideByContact.set(o.contact_id, val);
    }

    // Cache für persönliche Anhänge (ein Download pro Pfad)
    const personalCache = new Map<string, { filename: string; content: Uint8Array } | null>();
    const loadPersonal = async (paths: string[]) => {
      const out: Array<{ filename: string; content: Uint8Array }> = [];
      for (const p of paths) {
        if (!personalCache.has(p)) {
          const { data: f, error: dlErr } = await admin.storage.from("comm-assets").download(p);
          if (dlErr || !f) {
            console.warn("personal attachment missing", p, dlErr?.message);
            personalCache.set(p, null);
          } else {
            personalCache.set(p, {
              filename: (p.split("/").pop() || "anhang").replace(/^\d+_/, ""),
              content: new Uint8Array(await f.arrayBuffer()),
            });
          }
        }
        const cached = personalCache.get(p);
        if (cached) out.push(cached);
      }
      return out;
    };

    let ok = 0, fail = 0;
    for (const r of recipients) {
      const ov =
        (r.assignment_id ? overrideByKey.get(`${r.assignment_id}|${(r.email || "").toLowerCase()}`) : undefined) ??
        overrideByContact.get(r.contact_id);
      const effSubject = ov?.subject ?? subject;
      const effBody = ov?.body_html ?? bodyHtml;
      const renderedSubject = renderString(effSubject, r.vars);
      const renderedBody = withSignature(renderString(effBody, r.vars));
      const isHtml = bodyFormat !== "plain";
      const personal = ov?.attachment_paths?.length ? await loadPersonal(ov.attachment_paths) : [];
      const allAttachments = [...attachments, ...personal];
      try {
        await transporter.sendMail({
          from: `${account.display_name} <${account.email_address}>`,
          to: r.email!,
          subject: renderedSubject,
          ...buildBody(renderedBody),
          attachments: allAttachments,
        });

        await admin.from("comm_recipients").insert({
          campaign_id, contact_id: r.contact_id, person_id: r.person_id, building_id: r.building_id,
          display_name: r.display_name, email: r.email, resolved_vars: r.vars,
          status: "sent", sent_at: new Date().toISOString(),
        });
        // Eintrag in Gesendet-Postfach (analog send-email)
        try {
          await admin.from("emails").insert({
            account_id: account.id,
            folder_id: sentFolder?.id ?? null,
            subject: renderedSubject || null,
            from_address: account.email_address,
            from_name: account.display_name,
            to_addresses: [r.email!],
            body_text: isHtml ? null : renderedBody,
            body_html: isHtml ? renderedBody : null,
            date: new Date().toISOString(),
            is_read: true,
            has_attachments: allAttachments.length > 0,
            message_id: `bulk-${campaign_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          });
        } catch (saveErr: any) {
          console.warn("[comm-send-bulk-email] save-to-sent failed:", saveErr?.message || saveErr);
        }
        ok++;
      } catch (e: any) {
        await admin.from("comm_recipients").insert({
          campaign_id, contact_id: r.contact_id, person_id: r.person_id, building_id: r.building_id,
          display_name: r.display_name, email: r.email, resolved_vars: r.vars,
          status: "failed", error: e?.message || "Send failed",
        });
        fail++;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }


    // For retries, accumulate counts on the campaign instead of overwriting
    const updates: any = {
      status: fail === recipients.length ? "failed" : "sent",
      completed_at: new Date().toISOString(),
    };
    if (retry_failed_only) {
      updates.sent_count = (campaign.sent_count || 0) + ok;
      updates.failed_count = fail;
    } else {
      updates.recipient_count = recipients.length;
      updates.sent_count = ok;
      updates.failed_count = fail;
    }
    await admin.from("comm_campaigns").update(updates).eq("id", campaign_id);

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
