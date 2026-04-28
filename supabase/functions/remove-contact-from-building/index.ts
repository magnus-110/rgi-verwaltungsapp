// Removes a contact's assignment to a building.
// - Deletes the assignment (cascades shares, costs, etv_attendees, etv_votes, sub-assignments).
// - If contact still has other assignments: only revoke building access (weg_owner_buildings/tenants).
// - If this was the last assignment: delete the auth user fully (contact entry remains).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .single();
    if (profile?.role !== "admin") return json({ error: "Forbidden" }, 403);

    const { assignment_id } = await req.json();
    if (!assignment_id) return json({ error: "assignment_id required" }, 400);

    // 1. Load assignment
    const { data: assignment, error: aErr } = await admin
      .from("contact_building_assignments")
      .select("id, contact_id, building_id")
      .eq("id", assignment_id)
      .maybeSingle();
    if (aErr) return json({ error: aErr.message }, 500);
    if (!assignment) return json({ error: "Assignment not found" }, 404);

    const { contact_id, building_id } = assignment;

    // 2. Delete sub-assignments (parent_assignment_id) explicitly first — they have ON DELETE SET NULL,
    //    but for hierarchy cleanup we want them gone with the parent.
    await admin
      .from("contact_building_assignments")
      .delete()
      .eq("parent_assignment_id", assignment_id);

    // 3. Delete the assignment itself (cascades shares, costs, etv_attendees, etv_votes)
    const { error: delErr } = await admin
      .from("contact_building_assignments")
      .delete()
      .eq("id", assignment_id);
    if (delErr) return json({ error: delErr.message }, 500);

    // 4. Check remaining assignments for this contact
    const { data: remaining } = await admin
      .from("contact_building_assignments")
      .select("id, building_id")
      .eq("contact_id", contact_id);

    // 5. Account cleanup
    const { data: contact } = await admin
      .from("contacts")
      .select("user_id")
      .eq("id", contact_id)
      .maybeSingle();
    const userId = contact?.user_id;

    let accountDeleted = false;

    if (userId) {
      if (!remaining || remaining.length === 0) {
        // Last assignment removed -> wipe the auth account, keep the contact.
        // Detach contact from auth user first so cascade doesn't touch contact row.
        await admin.from("contacts").update({ user_id: null }).eq("id", contact_id);

        // Best-effort cleanup of building-link tables (in case any still exist)
        await admin.from("weg_owner_buildings").delete().eq("user_id", userId);
        await admin.from("tenants").delete().eq("user_id", userId);

        const { error: authDelErr } = await admin.auth.admin.deleteUser(userId);
        if (authDelErr) {
          console.error("auth.admin.deleteUser failed", authDelErr);
        } else {
          accountDeleted = true;
        }
      } else {
        // Contact still has other assignments -> only revoke this building.
        await admin
          .from("weg_owner_buildings")
          .delete()
          .eq("user_id", userId)
          .eq("building_id", building_id);
        await admin
          .from("tenants")
          .delete()
          .eq("user_id", userId)
          .eq("building_id", building_id);

        // If profiles.building_id pointed at the removed building, repoint to a remaining one (or null)
        const { data: prof } = await admin
          .from("profiles")
          .select("building_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (prof?.building_id === building_id) {
          const fallback = remaining[0]?.building_id ?? null;
          await admin
            .from("profiles")
            .update({ building_id: fallback })
            .eq("user_id", userId);
        }
      }
    }

    return json({
      success: true,
      account_deleted: accountDeleted,
      remaining_assignments: remaining?.length ?? 0,
    });
  } catch (e: any) {
    console.error("remove-contact-from-building error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
