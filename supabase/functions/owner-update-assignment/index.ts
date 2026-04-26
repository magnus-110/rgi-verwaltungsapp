// supabase/functions/owner-update-assignment/index.ts
// Allows an authenticated owner to update ONLY their own contact_building_assignments
// override fields (per-unit personal data + IBAN). Whitelisted to prevent privilege escalation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_FIELDS = new Set([
  "salutation_override",
  "first_name_override",
  "last_name_override",
  "company_name_override",
  "address_street_override",
  "address_zip_override",
  "address_city_override",
  "phones_override",
  "emails_override",
  "iban_override",
  "iban_holder_override",
  "bank_account_id",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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

    const { assignment_id, patch } = await req.json();
    if (!assignment_id || !patch || typeof patch !== "object") {
      return json({ error: "assignment_id and patch required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify the assignment belongs to a contact owned by this user
    const { data: assignment, error: aErr } = await admin
      .from("contact_building_assignments")
      .select("id, contact_id, contacts!inner(user_id)")
      .eq("id", assignment_id)
      .maybeSingle();
    if (aErr) return json({ error: aErr.message }, 500);
    if (!assignment || (assignment as any).contacts?.user_id !== userId) {
      return json({ error: "Forbidden" }, 403);
    }

    // Whitelist patch fields
    const safePatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (ALLOWED_FIELDS.has(k)) safePatch[k] = v;
    }
    if (Object.keys(safePatch).length === 0) {
      return json({ error: "no allowed fields in patch" }, 400);
    }

    // Normalize IBAN
    if (typeof safePatch.iban_override === "string") {
      const cleaned = safePatch.iban_override.replace(/\s/g, "").toUpperCase();
      safePatch.iban_override = cleaned || null;
    }

    safePatch.updated_at = new Date().toISOString();

    const { error: uErr } = await admin
      .from("contact_building_assignments")
      .update(safePatch)
      .eq("id", assignment_id);
    if (uErr) return json({ error: uErr.message }, 500);

    return json({ success: true });
  } catch (e: any) {
    console.error("owner-update-assignment error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
