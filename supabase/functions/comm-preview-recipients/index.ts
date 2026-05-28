// Resolves the recipients for a planned campaign so the UI can list them
// individually under the "Geplante E-Mails" group.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { loadRecipients, RecipientFilter } from "../_shared/comm-vars.ts";

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

    // Auth check via anon client + caller JWT
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
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: campaign, error: cErr } = await admin
      .from("comm_campaigns")
      .select("id, building_id, recipient_filter, free_vars")
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
      { ...filter, require_email: false },
      freeVars,
    );

    const recipients = resolved.map((r) => ({
      contact_id: r.contact_id,
      person_id: r.person_id,
      display_name: r.display_name,
      email: r.email,
    }));

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
