// Marks a step as completed.
// - Step 1 (Stammdaten/SEPA): writes directly to contacts (sofort live).
// - Steps 2-5: creates an onboarding_submissions row for admin approval.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STEP_CATEGORIES: Record<number, string> = {
  2: "wohnungsdaten",
  3: "gebaeudeinformationen",
  4: "dienstleister",
  5: "bewertung",
};

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

    const { building_id, step, payload } = await req.json();
    if (!building_id || !step) return json({ error: "building_id and step required" }, 400);
    const stepNum = Number(step);
    if (![1, 2, 3, 4, 5].includes(stepNum)) return json({ error: "invalid step" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Locate the user's contact for this building
    const { data: assignment } = await admin
      .from("contact_building_assignments")
      .select("contact_id, contacts!inner(user_id)")
      .eq("building_id", building_id)
      .eq("contacts.user_id", userId)
      .limit(1)
      .maybeSingle();

    const contactId = (assignment as any)?.contact_id || null;

    // Ensure progress row exists
    const { data: existing } = await admin
      .from("onboarding_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("building_id", building_id)
      .maybeSingle();

    let progressId = existing?.id;
    if (!existing) {
      const { data: created, error } = await admin
        .from("onboarding_progress")
        .insert({ user_id: userId, building_id, contact_id: contactId, current_step: stepNum })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 500);
      progressId = created.id;
    }

    // Step 1 (Stammdaten) -> writes building-specific overrides ONLY.
    // Global contacts / contact_persons / contact_phones / contact_emails / contact_bank_accounts are NOT touched.
    if (stepNum === 1) {
      if (!contactId) {
        return json({ error: "No contact assignment found for user/building" }, 400);
      }
      const p = payload || {};
      const ibanClean = typeof p.iban === "string" ? p.iban.replace(/\s/g, "").toUpperCase() : null;
      const overrideUpdate: Record<string, any> = {
        address_street_override: p.street ?? null,
        address_zip_override: p.zip ?? null,
        address_city_override: p.city ?? null,
        phones_override: Array.isArray(p.phones) ? p.phones : null,
        emails_override: Array.isArray(p.emails) ? p.emails : null,
        iban_override: ibanClean || null,
        primary_contact_self: typeof p.contact_self === "boolean" ? p.contact_self : null,
        primary_contact_other: p.contact_self === false ? p.contact_other ?? null : null,
        expectations_override: p.expectations || null,
        updated_at: new Date().toISOString(),
      };
      const { error: ovErr } = await admin
        .from("contact_building_assignments")
        .update(overrideUpdate)
        .eq("contact_id", contactId)
        .eq("building_id", building_id);
      if (ovErr) {
        console.error("override update error", ovErr);
        return json({ error: ovErr.message }, 500);
      }
    } else {
      // Create submission record for admin review
      const category = STEP_CATEGORIES[stepNum];
      const { error: subErr } = await admin.from("onboarding_submissions").insert({
        user_id: userId,
        contact_id: contactId,
        building_id,
        category,
        payload: payload || {},
        status: "pending",
      });
      if (subErr) {
        console.error("submission insert error", subErr);
        return json({ error: subErr.message }, 500);
      }
    }

    // Mark step as completed (set stepN_completed_at)
    const completionField = `step${stepNum}_completed_at`;
    const update: Record<string, any> = {
      [completionField]: new Date().toISOString(),
      current_step: Math.min(stepNum + 1, 5),
      updated_at: new Date().toISOString(),
    };
    if (stepNum === 5) update.completed_at = new Date().toISOString();

    const { error: updErr } = await admin
      .from("onboarding_progress")
      .update(update)
      .eq("id", progressId);
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ success: true, progress_id: progressId, step: stepNum });
  } catch (e: any) {
    console.error("submit-onboarding-step error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
