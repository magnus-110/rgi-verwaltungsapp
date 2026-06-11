// Resolves the recipients for a planned campaign so the UI can list them
// individually under the "Geplante E-Mails" group.
// With include_body=true the rendered subject + body per recipient is returned.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { loadRecipients, renderString, RecipientFilter } from "../_shared/comm-vars.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaign_id || "").trim();
    const includeBody = !!body?.include_body;
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: campaign, error: cErr } = await admin
      .from("comm_campaigns")
      .select("id, building_id, recipient_filter, free_vars, subject_override, body_html_override, body_format, template_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filter = (campaign.recipient_filter || {}) as RecipientFilter;
    const freeVars = (campaign.free_vars || {}) as Record<string, string>;

    const resolved = await loadRecipients(
      admin,
      campaign.building_id,
      { ...filter, require_email: false, expand_all_emails: true },
      freeVars,
    );

    // Optional: render rendered subject + body per recipient.
    let subjectTpl: string | null = campaign.subject_override as string | null;
    let bodyTpl: string | null = campaign.body_html_override as string | null;
    const bodyFormat = (campaign.body_format as "html" | "plain") || "html";
    if (includeBody && (!subjectTpl || !bodyTpl) && campaign.template_id) {
      const { data: t } = await admin
        .from("comm_templates")
        .select("subject, body_html")
        .eq("id", campaign.template_id)
        .maybeSingle();
      if (!subjectTpl) subjectTpl = t?.subject || null;
      if (!bodyTpl) bodyTpl = t?.body_html || null;
    }

    // Always load per-recipient overrides (cheap; needed for has_override flag)
    const { data: ovData } = await admin
      .from("comm_recipient_overrides")
      .select("contact_id, subject, body_html")
      .eq("campaign_id", campaignId);
    const overrideMap = new Map<string, { subject: string | null; body_html: string | null }>(
      (ovData || []).map((o: any) => [o.contact_id, { subject: o.subject, body_html: o.body_html }]),
    );

    const recipients = resolved.map((r) => {
      const ov = overrideMap.get(r.contact_id);
      const base: any = {
        contact_id: r.contact_id,
        person_id: r.person_id,
        display_name: r.display_name,
        email: r.email,
        has_override: !!ov,
      };
      if (includeBody) {
        const effSubject = ov?.subject ?? subjectTpl;
        const effBody = ov?.body_html ?? bodyTpl;
        base.rendered_subject = effSubject ? renderString(effSubject, r.vars) : "";
        base.rendered_body = effBody ? renderString(effBody, r.vars) : "";
        base.body_format = bodyFormat;
      }
      return base;
    });

    return new Response(JSON.stringify({ recipients }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
