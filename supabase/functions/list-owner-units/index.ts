// Returns all active building assignments (units) for the currently logged in
// owner. Bypasses RLS edge-cases by using the service role.
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

    const { data: contacts, error: cErr } = await admin
      .from("contacts")
      .select("id")
      .eq("user_id", userId);
    if (cErr) throw cErr;
    const contactIds = (contacts ?? []).map((c: any) => c.id);
    if (contactIds.length === 0) return json({ units: [] });

    const { data: assignments, error: aErr } = await admin
      .from("contact_building_assignments")
      .select(
        "id, unit_number, building_id, is_active, buildings(name, address_street, address_zip, address_city)",
      )
      .in("contact_id", contactIds)
      .eq("is_active", true);
    if (aErr) throw aErr;

    const units = (assignments ?? []).map((r: any) => ({
      id: r.id,
      unit_number: r.unit_number,
      building_id: r.building_id,
      building_name: r.buildings?.name ?? "Gebäude",
      building_address: [
        r.buildings?.address_street,
        [r.buildings?.address_zip, r.buildings?.address_city]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(", "),
    }));

    return json({ units });
  } catch (e: any) {
    console.error("list-owner-units error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
