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

    const { building_id, step, payload, applies_to_all_assignments } = await req.json();
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

    // Persist applies_to_all_assignments choice (Multi-Einheiten-Modus) at any step.
    if (typeof applies_to_all_assignments === "boolean") {
      await admin
        .from("onboarding_progress")
        .update({ applies_to_all_assignments })
        .eq("id", progressId);
    }

    // Helper: build override-update for one Step1Data payload
    const buildOverrideUpdate = (p: any) => {
      const ibanClean = typeof p.iban === "string" ? p.iban.replace(/\s/g, "").toUpperCase() : null;
      return {
        address_street_override: p.street ?? null,
        address_zip_override: p.zip ?? null,
        address_city_override: p.city ?? null,
        phones_override: Array.isArray(p.phones) ? p.phones : null,
        emails_override: Array.isArray(p.emails) ? p.emails : null,
        iban_override: ibanClean || null,
        iban_holder_override: typeof p.account_holder === "string" ? p.account_holder.trim() || null : null,
        primary_contact_self: typeof p.contact_self === "boolean" ? p.contact_self : null,
        primary_contact_other: p.contact_self === false ? p.contact_other ?? null : null,
        expectations_override: p.expectations || null,
        updated_at: new Date().toISOString(),
      } as Record<string, any>;
    };

    // Step 1 (Stammdaten) -> writes building-specific overrides ONLY.
    if (stepNum === 1) {
      if (!contactId) {
        return json({ error: "No contact assignment found for user/building" }, 400);
      }

      // Multi-Einheiten-Modus: payload.per_unit { [assignment_id]: Step1Data }
      if (payload && typeof payload === "object" && payload.per_unit && typeof payload.per_unit === "object") {
        const perUnit = payload.per_unit as Record<string, any>;
        for (const [assignmentId, p] of Object.entries(perUnit)) {
          const upd = buildOverrideUpdate(p);
          const { error } = await admin
            .from("contact_building_assignments")
            .update(upd)
            .eq("id", assignmentId)
            .eq("contact_id", contactId);
          if (error) {
            console.error("override update error (per_unit)", error);
            return json({ error: error.message }, 500);
          }
        }
      } else {
        const overrideUpdate = buildOverrideUpdate(payload || {});
        // Determine target assignments: by default just this one;
        // if the owner ticked "applies to all my units" we expand to every active
        // assignment of this contact (in this building only — strikte Trennung).
        const { data: progRow } = await admin
          .from("onboarding_progress")
          .select("applies_to_all_assignments")
          .eq("user_id", userId)
          .eq("building_id", building_id)
          .maybeSingle();

        let targets: { id: string }[] = [];
        if ((progRow as any)?.applies_to_all_assignments) {
          const { data: allAsg } = await admin
            .from("contact_building_assignments")
            .select("id")
            .eq("contact_id", contactId)
            .eq("building_id", building_id)
            .eq("is_active", true);
          targets = (allAsg as any) || [];
        }

        if (targets.length === 0) {
          // Fallback: alle Assignments dieses Contacts in diesem Gebäude
          const { error } = await admin
            .from("contact_building_assignments")
            .update(overrideUpdate)
            .eq("contact_id", contactId)
            .eq("building_id", building_id);
          if (error) {
            console.error("override update error", error);
            return json({ error: error.message }, 500);
          }
        } else {
          for (const t of targets) {
            const { error } = await admin
              .from("contact_building_assignments")
              .update(overrideUpdate)
              .eq("id", t.id)
              .eq("contact_id", contactId);
            if (error) {
              console.error("override update error (loop)", error);
              return json({ error: error.message }, 500);
            }
          }
        }
      }
    } else {
      // Steps 2-5: create submission record(s) for admin review.
      const category = STEP_CATEGORIES[stepNum];
      // Replace any existing pending submissions so we don't accumulate duplicates.
      await admin
        .from("onboarding_submissions")
        .delete()
        .eq("user_id", userId)
        .eq("building_id", building_id)
        .eq("category", category)
        .eq("status", "pending");

      // Multi-Einheiten-Modus: pro Assignment einen Datensatz schreiben.
      if (
        stepNum === 2 &&
        payload &&
        typeof payload === "object" &&
        payload.per_unit &&
        typeof payload.per_unit === "object"
      ) {
        const perUnit = payload.per_unit as Record<string, any>;
        const rows = Object.entries(perUnit).map(([assignmentId, p]) => ({
          user_id: userId,
          contact_id: contactId,
          building_id,
          assignment_id: assignmentId,
          category,
          payload: p || {},
          status: "pending",
        }));
        if (rows.length > 0) {
          const { error: subErr } = await admin.from("onboarding_submissions").insert(rows);
          if (subErr) console.error("submission insert error per_unit (non-fatal)", subErr);
        }
      } else {
        const { error: subErr } = await admin.from("onboarding_submissions").insert({
          user_id: userId,
          contact_id: contactId,
          building_id,
          category,
          payload: payload || {},
          status: "pending",
        });
        if (subErr) {
          console.error("submission insert error (non-fatal)", subErr);
        }
      }
    }

    // Mark step as completed (set stepN_completed_at) — idempotent
    const completionField = `step${stepNum}_completed_at`;
    const nowIso = new Date().toISOString();
    const update: Record<string, any> = {
      [completionField]: nowIso,
      current_step: Math.min(stepNum + 1, 5),
      updated_at: nowIso,
    };
    if (stepNum === 5) update.fully_completed_at = nowIso;

    const { data: updated, error: updErr } = await admin
      .from("onboarding_progress")
      .update(update)
      .eq("id", progressId)
      .select("id, step5_completed_at, fully_completed_at")
      .maybeSingle();
    if (updErr) {
      console.error("progress update error", updErr);
      return json({ error: updErr.message }, 500);
    }
    if (!updated) {
      return json({ error: "progress row not updated" }, 500);
    }

    return json({
      success: true,
      progress_id: progressId,
      step: stepNum,
      fully_completed_at: (updated as any).fully_completed_at,
    });
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
