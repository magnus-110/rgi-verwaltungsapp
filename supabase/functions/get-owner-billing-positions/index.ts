// Calculates the owner's share for all umlagefaehige Konten of a finalized
// billing period. Uses service role to bypass admin-only RLS on bookings
// and chart_of_accounts, but verifies caller ownership of the assignment.
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

    const { assignment_id, period_id } = await req.json().catch(() => ({}));
    if (!assignment_id || !period_id)
      return json({ error: "assignment_id and period_id required" }, 400);

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

    // Verify ownership of assignment
    const { data: assignment } = await admin
      .from("contact_building_assignments")
      .select("id, building_id, contact_id, contacts!inner(user_id)")
      .eq("id", assignment_id)
      .maybeSingle();
    if (!assignment || (assignment as any).contacts?.user_id !== userId) {
      return json({ error: "Forbidden" }, 403);
    }
    const buildingId = (assignment as any).building_id;

    const { data: period } = await admin
      .from("billing_periods")
      .select("id, building_id, period_from, period_to")
      .eq("id", period_id)
      .maybeSingle();
    if (!period || period.building_id !== buildingId) {
      return json({ error: "Period not found" }, 404);
    }

    // Eigene MEA
    const { data: ownShares } = await admin
      .from("contact_building_shares")
      .select("share_type, share_value")
      .eq("assignment_id", assignment_id);
    const ownMea = Number(
      (ownShares ?? []).find(
        (s: any) => (s.share_type ?? "").toLowerCase() === "mea",
      )?.share_value ?? 0,
    );

    // Gesamt-MEA (alle aktiven Wohnungen des Gebäudes)
    const { data: bldgAssignments } = await admin
      .from("contact_building_assignments")
      .select("id")
      .eq("building_id", buildingId)
      .eq("is_active", true);
    const assignmentIds = (bldgAssignments ?? []).map((a: any) => a.id);
    let totalMea = 0;
    if (assignmentIds.length > 0) {
      const { data: allShares } = await admin
        .from("contact_building_shares")
        .select("share_value")
        .eq("share_type", "mea")
        .in("assignment_id", assignmentIds);
      totalMea = (allShares ?? []).reduce(
        (s: number, r: any) => s + Number(r.share_value ?? 0),
        0,
      );
    }
    const meaShare = totalMea > 0 ? ownMea / totalMea : 0;

    // Konten
    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select("id, account_number, account_name, default_distribution_key, building_id")
      .or(`building_id.eq.${buildingId},building_id.is.null`)
      .eq("is_distributable", true)
      .eq("is_reserve_funded", false);
    const heatingNumbers = new Set(["1400", "1410", "1450"]);
    const relevant = (accounts ?? []).filter(
      (a: any) => !heatingNumbers.has(a.account_number),
    );
    if (relevant.length === 0) return json({ positions: [] });

    const relevantIds = relevant.map((a: any) => a.id);

    // Buchungen
    const { data: bookings } = await admin
      .from("bookings")
      .select("account_id, counter_account_id, amount")
      .eq("building_id", buildingId)
      .gte("booking_date", period.period_from)
      .lte("booking_date", period.period_to);

    const sums: Record<string, number> = {};
    (bookings ?? []).forEach((b: any) => {
      const accId = relevantIds.includes(b.account_id)
        ? b.account_id
        : relevantIds.includes(b.counter_account_id)
          ? b.counter_account_id
          : null;
      if (!accId) return;
      sums[accId] = (sums[accId] ?? 0) + Number(b.amount ?? 0);
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const positions = relevant
      .map((a: any) => {
        const total = Math.abs(sums[a.id] ?? 0);
        return {
          account_number: a.account_number,
          account_name: a.account_name,
          total_amount: round2(total),
          share_amount: round2(total * meaShare),
          distribution_key: a.default_distribution_key ?? "mea",
        };
      })
      .filter((p) => p.total_amount > 0);

    return json({ positions, mea_share: meaShare, own_mea: ownMea, total_mea: totalMea });
  } catch (e: any) {
    console.error("get-owner-billing-positions error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
