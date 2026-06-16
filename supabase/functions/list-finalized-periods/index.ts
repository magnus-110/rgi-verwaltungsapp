// Returns finalized billing periods (completed/closed) for a building, only
// if the calling user has an active assignment to that building. Bypasses
// RLS via service role because billing_periods is admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const { building_id } = await req.json().catch(() => ({}));
    if (!building_id) return json({ error: "building_id required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify the user owns at least one active unit in this building
    const { data: contacts } = await admin
      .from("contacts")
      .select("id")
      .eq("user_id", userId);
    const contactIds = (contacts ?? []).map((c: any) => c.id);
    if (contactIds.length === 0) return json({ periods: [] });

    const { data: assignments } = await admin
      .from("contact_building_assignments")
      .select("id")
      .in("contact_id", contactIds)
      .eq("building_id", building_id)
      .eq("is_active", true)
      .limit(1);
    if (!assignments || assignments.length === 0) {
      return json({ periods: [] });
    }

    const { data: periods, error } = await admin
      .from("billing_periods")
      .select("id, building_id, fiscal_year, period_from, period_to, status")
      .eq("building_id", building_id)
      .in("status", ["completed", "closed"])
      .order("fiscal_year", { ascending: false });
    if (error) throw error;

    return json({ periods: periods ?? [] });
  } catch (e: any) {
    console.error("list-finalized-periods error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
