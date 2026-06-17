// get-owner-billing-positions  (KORRIGIERTE FASSUNG)
// ------------------------------------------------------------------
// Korrekturen gegenüber der vorherigen Version:
//  1. Heizung/Warmwasser/Wasser kommt NICHT mehr aus den Buchungen,
//     sondern als ein Posten aus heating_distribution_values (Messdienst-
//     Wert je Wohnung). Damit fehlt die größte Position nicht mehr UND es
//     gibt keine Doppelzählung der Heiz-Nebenkonten (1420/1430/1401).
//  2. Kalte Konten (Kategorie 1) werden nach ihrem ECHTEN Verteilerschlüssel
//     verteilt (mea / einheiten), nicht pauschal nach MEA.
//  3. Verbrauchsabhängige Konten (verbrauch_*) werden als consumption_based
//     markiert; der Eigentümer bestätigt/passt den Wert im Frontend an.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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

    // Eigentümerschaft prüfen
    const { data: assignment } = await admin
      .from("contact_building_assignments")
      .select("id, building_id, contact_id, contacts!inner(user_id)")
      .eq("id", assignment_id)
      .maybeSingle();
    if (!assignment || (assignment as any).contacts?.user_id !== userId)
      return json({ error: "Forbidden" }, 403);
    const buildingId = (assignment as any).building_id;

    const { data: period } = await admin
      .from("billing_periods")
      .select("id, building_id, period_from, period_to")
      .eq("id", period_id)
      .maybeSingle();
    if (!period || period.building_id !== buildingId)
      return json({ error: "Period not found" }, 404);

    // ---- Schlüssel: MEA-Anteil ----
    const { data: ownShares } = await admin
      .from("contact_building_shares")
      .select("share_type, share_value")
      .eq("assignment_id", assignment_id);
    const ownMea = Number(
      (ownShares ?? []).find(
        (s: any) => (s.share_type ?? "").toLowerCase() === "mea",
      )?.share_value ?? 0,
    );

    const { data: bldgAssignments } = await admin
      .from("contact_building_assignments")
      .select("id, unit_number, role_in_building")
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

    // ---- Schlüssel: Anzahl Einheiten ----
    const unitCount = (bldgAssignments ?? []).filter(
      (a: any) => a.role_in_building === "eigentuemer" && a.unit_number,
    ).length;
    const einheitenShare = unitCount > 0 ? 1 / unitCount : 0;

    // ---- NUR kalte umlagefähige Konten (Kategorie 1) ----
    // Heizung (Kategorie 2) wird separat über den Messdienst behandelt!
    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select(
        "id, account_number, account_name, default_distribution_key, category, building_id",
      )
      .or(`building_id.eq.${buildingId},building_id.is.null`)
      .eq("is_distributable", true)
      .eq("is_reserve_funded", false);
    const cold = (accounts ?? []).filter((a: any) =>
      String(a.category ?? "").startsWith("1."),
    );
    const coldIds = cold.map((a: any) => a.id);

    // Buchungen im Abrechnungszeitraum summieren
    const { data: bookings } = await admin
      .from("bookings")
      .select("account_id, counter_account_id, amount")
      .eq("building_id", buildingId)
      .gte("booking_date", period.period_from)
      .lte("booking_date", period.period_to);
    const sums: Record<string, number> = {};
    (bookings ?? []).forEach((b: any) => {
      const accId = coldIds.includes(b.account_id)
        ? b.account_id
        : coldIds.includes(b.counter_account_id)
          ? b.counter_account_id
          : null;
      if (!accId) return;
      sums[accId] = (sums[accId] ?? 0) + Number(b.amount ?? 0);
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const factorFor = (key: string | null) => {
      const k = (key ?? "mea").toLowerCase();
      if (k === "einheiten") return einheitenShare;
      if (k.startsWith("verbrauch")) return null; // -> consumption_based
      return meaShare; // mea + Fallback
    };

    const positions = cold
      .map((a: any) => {
        const total = Math.abs(sums[a.id] ?? 0);
        const f = factorFor(a.default_distribution_key);
        return {
          account_number: a.account_number,
          account_name: a.account_name,
          total_amount: round2(total),
          distribution_key: a.default_distribution_key ?? "mea",
          consumption_based: f === null,
          share_amount: f === null ? round2(total * meaShare) : round2(total * f),
        };
      })
      .filter((p) => p.total_amount > 0);

    // ---- Heizung/Warmwasser/Wasser aus dem Messdienst ----
    const { data: heat } = await admin
      .from("heating_distribution_values")
      .select("amount, note")
      .eq("assignment_id", assignment_id)
      .eq("billing_period_id", period_id)
      .maybeSingle();
    const heating = heat
      ? {
          label: "Heizung / Warmwasser / Wasser (Messdienst)",
          amount: round2(Number(heat.amount ?? 0)),
          source: "messdienst" as const,
          note: heat.note ?? null,
        }
      : {
          label: "Heizung / Warmwasser / Wasser (Messdienst)",
          amount: 0,
          source: "missing" as const,
          note: null,
        };

    return json({
      positions,
      heating,
      mea_share: meaShare,
      einheiten_share: einheitenShare,
      unit_count: unitCount,
      own_mea: ownMea,
      total_mea: totalMea,
    });
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
