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

    // Step 1 (Stammdaten/SEPA) -> live persisted, no admin approval
    if (stepNum === 1) {
      // Caller frontend already wrote contact + IBAN data via supabase-js (RLS allowed).
      // Here we only mark it as completed.
    } else {
      // Create submission record for admin review
      const category = STEP_CATEGORIES[stepNum];
      const { error: subErr } = await admin.from("onboarding_submissions").insert({
        user_id: userId,
        contact_id: contactId,
        building_id,
        step: stepNum,
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
