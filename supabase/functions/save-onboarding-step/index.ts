// Auto-save the current step's data into onboarding_progress.step_data (JSONB merge).
// Owner-only — RLS enforces ownership via auth.uid().
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { building_id, step, data } = await req.json();
    if (!building_id || !step) return json({ error: "building_id and step required" }, 400);
    const stepNum = Number(step);
    if (![1, 2, 3, 4, 5].includes(stepNum)) return json({ error: "invalid step" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Load existing progress
    const { data: existing } = await admin
      .from("onboarding_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("building_id", building_id)
      .maybeSingle();

    const currentStepData = (existing?.step_data as Record<string, unknown>) || {};
    const merged = {
      ...currentStepData,
      [`step${stepNum}`]: { ...(currentStepData[`step${stepNum}`] as object || {}), ...(data || {}) },
    };

    if (existing) {
      const { error } = await admin
        .from("onboarding_progress")
        .update({
          step_data: merged,
          current_step: Math.max(existing.current_step || 1, stepNum),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) return json({ error: error.message }, 500);

      // Sync IBAN/SEPA from step 1 into contact_bank_accounts (master data)
      await syncBankAccountFromStep1(admin, userId, stepNum, data);

      return json({ success: true, id: existing.id });
    }

    const { data: created, error } = await admin
      .from("onboarding_progress")
      .insert({
        user_id: userId,
        building_id,
        current_step: stepNum,
        step_data: merged,
      })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);

    // Sync IBAN/SEPA from step 1 into contact_bank_accounts (master data)
    await syncBankAccountFromStep1(admin, userId, stepNum, data);

    return json({ success: true, id: created.id });
  } catch (e: any) {
    console.error("save-onboarding-step error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
