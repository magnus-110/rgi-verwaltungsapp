// Approve or reject an onboarding submission. Admin/employee only.
// On approve: merges payload into target tables based on category.
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

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify admin/employee
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile || !["admin", "employee"].includes(profile.role)) {
      return json({ error: "Forbidden" }, 403);
    }

    const { submission_id, action, review_note, edited_payload, mark_as_global_suggestion } = await req.json();
    if (!submission_id || !["approve", "reject"].includes(action)) {
      return json({ error: "submission_id and valid action required" }, 400);
    }

    const { data: sub, error: subErr } = await admin
      .from("onboarding_submissions")
      .select("*")
      .eq("id", submission_id)
      .maybeSingle();
    if (subErr || !sub) return json({ error: "Submission not found" }, 404);
    if (sub.status !== "pending") return json({ error: "Submission already processed" }, 400);

    if (action === "reject") {
      const { error } = await admin
        .from("onboarding_submissions")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_note: review_note || null,
        })
        .eq("id", submission_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, status: "rejected" });
    }

    // ----- APPROVE: merge payload into target tables -----
    const payload = (edited_payload || sub.payload || {}) as Record<string, any>;
    const buildingId = sub.building_id as string;
    const contactId = sub.contact_id as string | null;

    try {
      switch (sub.category) {
        case "wohnungsdaten": {
          // Merge into contact_building_assignments (MEA, m², Hausgeld)
          if (contactId) {
            const update: Record<string, any> = {};
            if (payload.mea != null) update.shares = String(payload.mea);
            if (payload.qm != null) update.area_sqm = Number(payload.qm);
            if (payload.hausgeld != null) update.monthly_amount = Number(payload.hausgeld);
            if (Object.keys(update).length > 0) {
              await admin
                .from("contact_building_assignments")
                .update(update)
                .eq("contact_id", contactId)
                .eq("building_id", buildingId);
            }
          }
          break;
        }
        case "gebaeudeinformationen": {
          const update: Record<string, any> = {};
          if (payload.heating_type) update.heating_type = payload.heating_type;
          if (Object.keys(update).length > 0) {
            await admin.from("buildings").update(update).eq("id", buildingId);
          }
          break;
        }
        case "dienstleister": {
          const items = Array.isArray(payload.providers) ? payload.providers : [];
          for (const item of items) {
            const name = String(item?.name || "").trim();
            if (!name) continue;
            const category = item?.category || payload.category || "sonstige";
            const phone = item?.phone || null;
            // Insert into building_service_providers if table exists; otherwise into contacts as suggestion
            const { error: spErr } = await admin
              .from("building_service_providers" as any)
              .insert({
                building_id: buildingId,
                name,
                category,
                phone,
              });
            if (spErr) console.warn("service_providers insert failed", spErr.message);

            if (mark_as_global_suggestion) {
              await admin.from("contacts").insert({
                contact_type: "company",
                company_name: name,
                suggest_in_onboarding: true,
                onboarding_category: category,
              } as any);
            }
          }
          break;
        }
        case "bewertung": {
          // Persist into a building_assessments table if available; otherwise just keep as submission
          const insertBody: Record<string, any> = {
            building_id: buildingId,
            user_id: sub.user_id,
            condition_rating: payload.condition_rating ?? null,
            willing_cash_audit: payload.willing_cash_audit ?? null,
            notes: payload.notes ?? null,
          };
          const { error: aErr } = await admin
            .from("building_assessments" as any)
            .insert(insertBody);
          if (aErr) console.warn("building_assessments insert failed", aErr.message);
          break;
        }
        default:
          // Unknown category — just mark approved without merging
          break;
      }
    } catch (mergeErr: any) {
      console.error("merge error", mergeErr);
      return json({ error: `Übernahme fehlgeschlagen: ${mergeErr?.message || mergeErr}` }, 500);
    }

    const { error: updErr } = await admin
      .from("onboarding_submissions")
      .update({
        status: "approved",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: review_note || null,
        payload: edited_payload || sub.payload,
      })
      .eq("id", submission_id);
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ success: true, status: "approved" });
  } catch (e: any) {
    console.error("onboarding-approve-submission error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
