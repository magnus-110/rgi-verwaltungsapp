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
          if (contactId) {
            // Find assignment
            const { data: assignment } = await admin
              .from("contact_building_assignments")
              .select("id")
              .eq("contact_id", contactId)
              .eq("building_id", buildingId)
              .limit(1)
              .maybeSingle();

            // Wohnfläche → area_sqm_override + Verteilerschlüssel (share_type='qm')
            if (payload.qm != null && assignment) {
              const qmNum = Number(payload.qm);
              await admin
                .from("contact_building_assignments")
                .update({ area_sqm_override: qmNum })
                .eq("id", assignment.id);
              const { data: existingQm } = await admin
                .from("contact_building_shares")
                .select("id")
                .eq("assignment_id", assignment.id)
                .eq("share_type", "qm")
                .limit(1)
                .maybeSingle();
              if (existingQm) {
                await admin
                  .from("contact_building_shares")
                  .update({ share_value: qmNum })
                  .eq("id", existingQm.id);
              } else {
                await admin
                  .from("contact_building_shares")
                  .insert({ assignment_id: assignment.id, share_type: "qm", share_value: qmNum });
              }
            }

            // MEA → contact_building_shares (share_type='mea')
            if (payload.mea != null && assignment) {
              const meaValue = String(payload.mea);
              const { data: existingShare } = await admin
                .from("contact_building_shares")
                .select("id")
                .eq("assignment_id", assignment.id)
                .eq("share_type", "mea")
                .limit(1)
                .maybeSingle();
              if (existingShare) {
                await admin
                  .from("contact_building_shares")
                  .update({ share_value: meaValue })
                  .eq("id", existingShare.id);
              } else {
                await admin
                  .from("contact_building_shares")
                  .insert({ assignment_id: assignment.id, share_type: "mea", share_value: meaValue });
              }
            }

            // Hausgeld → contact_building_costs (cost_type='hausgeld')
            if (payload.hausgeld != null && assignment) {
              const amt = Number(payload.hausgeld);
              const { data: existingCost } = await admin
                .from("contact_building_costs")
                .select("id")
                .eq("assignment_id", assignment.id)
                .ilike("cost_type", "%hausgeld%")
                .limit(1)
                .maybeSingle();
              if (existingCost) {
                await admin
                  .from("contact_building_costs")
                  .update({ amount: amt })
                  .eq("id", existingCost.id);
              } else {
                await admin
                  .from("contact_building_costs")
                  .insert({ assignment_id: assignment.id, cost_type: "Hausgeld", amount: amt });
              }
            }
          }
          break;
        }
        case "gebaeudeinformationen": {
          const update: Record<string, any> = {};
          const HEATING_LABELS: Record<string, string> = {
            gas: "Gas", oel: "Öl", fernwaerme: "Fernwärme", waermepumpe: "Wärmepumpe",
            pellets: "Pellets", strom: "Strom",
          };
          const types: string[] = Array.isArray(payload.heating_types)
            ? payload.heating_types
            : payload.heating_type ? [payload.heating_type] : [];
          if (types.length > 0) {
            const labels = types.map((t: string) =>
              t === "sonstiges" ? (payload.heating_other || "Sonstiges") : (HEATING_LABELS[t] || t)
            );
            update.heating_type = labels.join(", ");
          }
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
            const email = item?.email || null;
            const notes = item?.notes || null;

            // Check existing entry to bump suggested_by_count
            const { data: existing } = await admin
              .from("building_service_providers")
              .select("id, suggested_by_count")
              .eq("building_id", buildingId)
              .ilike("name", name)
              .eq("category", category)
              .limit(1)
              .maybeSingle();

            if (existing) {
              await admin
                .from("building_service_providers")
                .update({
                  suggested_by_count: (existing.suggested_by_count || 1) + 1,
                  phone: phone || undefined,
                  email: email || undefined,
                  notes: notes || undefined,
                })
                .eq("id", existing.id);
            } else {
              await admin.from("building_service_providers").insert({
                building_id: buildingId,
                name,
                category,
                phone,
                email,
                notes,
                source: "onboarding",
              });
            }

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
          await admin.from("building_assessments").insert({
            building_id: buildingId,
            user_id: sub.user_id,
            contact_id: contactId,
            condition_rating: payload.condition_rating ?? null,
            problem_areas: Array.isArray(payload.problem_areas) ? payload.problem_areas : [],
            willing_cash_audit: payload.willing_cash_audit ?? null,
            etv_location_suggestion: payload.etv_location ?? null,
            notes: payload.notes ?? null,
            source: "onboarding",
          });

          // Cash auditor → set on assignment
          if (payload.willing_cash_audit === true && contactId) {
            await admin
              .from("contact_building_assignments")
              .update({ is_cash_auditor: true })
              .eq("contact_id", contactId)
              .eq("building_id", buildingId);
          }
          // Beirat-Mitgliedschaft (gewählt) → Funktionskennzeichen auf der Eigentümerzuordnung
          const beiratMember = payload.is_beirat_member ?? payload.willing_beirat;
          if (beiratMember === true && contactId) {
            await admin
              .from("contact_building_assignments")
              .update({ is_beirat: true })
              .eq("contact_id", contactId)
              .eq("building_id", buildingId);
          }
          break;
        }
        default:
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
