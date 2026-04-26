// Apply a single field from an onboarding submission to the target tables.
// Tracks applied fields in submissions.applied_fields (jsonb array of strings).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEATING_LABELS: Record<string, string> = {
  gas: "Gas", oel: "Öl", fernwaerme: "Fernwärme", waermepumpe: "Wärmepumpe",
  pellets: "Pellets", strom: "Strom",
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

    // Permission check: admin or employee
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile || !["admin", "employee"].includes((profile as any).role)) {
      return json({ error: "Forbidden" }, 403);
    }

    const { submission_id, field, value } = await req.json();
    if (!submission_id || !field) {
      return json({ error: "submission_id and field required" }, 400);
    }

    const { data: sub, error: subErr } = await admin
      .from("onboarding_submissions")
      .select("*")
      .eq("id", submission_id)
      .maybeSingle();
    if (subErr || !sub) return json({ error: "Submission not found" }, 404);

    const buildingId = (sub as any).building_id as string;
    const contactId = (sub as any).contact_id as string | null;
    const payload = ((sub as any).payload || {}) as Record<string, any>;

    // Compute the unique field-key we store in applied_fields
    let appliedKey = field as string;

    try {
      switch (field) {
        // ---------- STEP 2: Wohnungsdaten ----------
        case "qm":
        case "mea":
        case "hausgeld": {
          if (!contactId) return json({ error: "Kein Kontakt zugeordnet" }, 400);
          const { data: assignment } = await admin
            .from("contact_building_assignments")
            .select("id")
            .eq("contact_id", contactId)
            .eq("building_id", buildingId)
            .limit(1)
            .maybeSingle();
          if (!assignment) return json({ error: "Keine Zuordnung gefunden" }, 400);
          const aid = (assignment as any).id;

          if (field === "qm") {
            const v = payload.square_meters ?? payload.qm;
            if (v == null) return json({ error: "Kein Wert vorhanden" }, 400);
            await admin
              .from("contact_building_assignments")
              .update({ area_sqm_override: Number(String(v).replace(",", ".")) })
              .eq("id", aid);
          } else if (field === "mea") {
            const v = payload.mea_share ?? payload.mea;
            if (v == null) return json({ error: "Kein Wert vorhanden" }, 400);
            const meaValue = String(v);
            const { data: existingShare } = await admin
              .from("contact_building_shares")
              .select("id")
              .eq("assignment_id", aid)
              .eq("share_type", "mea")
              .limit(1)
              .maybeSingle();
            if (existingShare) {
              await admin
                .from("contact_building_shares")
                .update({ share_value: meaValue })
                .eq("id", (existingShare as any).id);
            } else {
              await admin
                .from("contact_building_shares")
                .insert({ assignment_id: aid, share_type: "mea", share_value: meaValue });
            }
          } else if (field === "hausgeld") {
            const v = payload.monthly_fee ?? payload.hausgeld;
            if (v == null) return json({ error: "Kein Wert vorhanden" }, 400);
            const amt = Number(String(v).replace(",", "."));
            const { data: existingCost } = await admin
              .from("contact_building_costs")
              .select("id")
              .eq("assignment_id", aid)
              .ilike("cost_type", "%hausgeld%")
              .limit(1)
              .maybeSingle();
            if (existingCost) {
              await admin
                .from("contact_building_costs")
                .update({ amount: amt })
                .eq("id", (existingCost as any).id);
            } else {
              await admin
                .from("contact_building_costs")
                .insert({ assignment_id: aid, cost_type: "Hausgeld", amount: amt });
            }
          }
          break;
        }

        // ---------- STEP 3: Gebäude ----------
        case "heating_type": {
          // value: { raw: string }   raw is the original key (gas/oel/...) or freitext
          const raw = String(value?.raw || "").trim();
          if (!raw) return json({ error: "Kein Wert" }, 400);
          const label = raw === "sonstiges"
            ? (payload.heating_other || "Sonstiges")
            : (HEATING_LABELS[raw] || raw);
          // Append to existing if not already present
          const { data: b } = await admin
            .from("buildings")
            .select("heating_type")
            .eq("id", buildingId)
            .maybeSingle();
          const current = String((b as any)?.heating_type || "").trim();
          const parts = current ? current.split(",").map((s) => s.trim()).filter(Boolean) : [];
          if (!parts.some((p) => p.toLowerCase() === label.toLowerCase())) parts.push(label);
          await admin.from("buildings").update({ heating_type: parts.join(", ") }).eq("id", buildingId);
          appliedKey = `heating_type:${raw}`;
          break;
        }
        case "problem_area": {
          const area = String(value?.area || "").trim();
          if (!area) return json({ error: "Kein Wert" }, 400);
          await admin.from("building_assessments").insert({
            building_id: buildingId,
            user_id: (sub as any).user_id,
            contact_id: contactId,
            problem_areas: [area],
            notes: payload?.problem_notes?.[area] ?? null,
            source: "onboarding",
          });
          appliedKey = `problem_area:${area}`;
          break;
        }

        // ---------- STEP 4: Dienstleister ----------
        case "provider": {
          // value: { trade, name, contact_id?, category? }
          const name = String(value?.name || "").trim();
          if (!name) return json({ error: "Kein Provider" }, 400);
          const category = String(value?.category || value?.trade || "sonstige");
          const phone = value?.phone || null;
          const email = value?.email || null;

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
                suggested_by_count: ((existing as any).suggested_by_count || 1) + 1,
              })
              .eq("id", (existing as any).id);
          } else {
            await admin.from("building_service_providers").insert({
              building_id: buildingId,
              name,
              category,
              phone,
              email,
              source: "onboarding",
            });
          }
          appliedKey = `provider:${category}:${name.toLowerCase()}`;
          break;
        }

        // ---------- STEP 5: Einschätzung ----------
        case "cash_auditor": {
          if (!contactId) return json({ error: "Kein Kontakt zugeordnet" }, 400);
          const { error: upErr, count } = await admin
            .from("contact_building_assignments")
            .update({ is_cash_auditor: true }, { count: "exact" })
            .eq("contact_id", contactId)
            .eq("building_id", buildingId);
          if (upErr) return json({ error: `DB-Fehler: ${upErr.message}` }, 500);
          if (!count) return json({ error: "Keine Zuordnung gefunden zum Aktualisieren" }, 400);
          break;
        }
        case "beirat_member": {
          if (!contactId) return json({ error: "Kein Kontakt zugeordnet" }, 400);
          const { error: upErr, count } = await admin
            .from("contact_building_assignments")
            .update({ role_in_building: "beirat" }, { count: "exact" })
            .eq("contact_id", contactId)
            .eq("building_id", buildingId);
          if (upErr) return json({ error: `DB-Fehler: ${upErr.message}` }, 500);
          if (!count) return json({ error: "Keine Zuordnung gefunden" }, 400);
          break;
        }
        case "etv_location": {
          const loc = String(value?.location || payload.etv_location || "").trim();
          if (!loc) return json({ error: "Kein Ort" }, 400);
          // Persist as latest assessment suggestion
          await admin.from("building_assessments").insert({
            building_id: buildingId,
            user_id: (sub as any).user_id,
            contact_id: contactId,
            etv_location_suggestion: loc,
            source: "onboarding",
          });
          appliedKey = `etv_location:${loc.toLowerCase()}`;
          break;
        }

        default:
          return json({ error: `Unbekanntes Feld: ${field}` }, 400);
      }
    } catch (mergeErr: any) {
      console.error("apply-field merge error", mergeErr);
      return json({ error: `Übernahme fehlgeschlagen: ${mergeErr?.message || mergeErr}` }, 500);
    }

    // Append appliedKey to applied_fields if missing
    const current: string[] = Array.isArray((sub as any).applied_fields)
      ? (sub as any).applied_fields
      : [];
    if (!current.includes(appliedKey)) {
      const next = [...current, appliedKey];
      await admin
        .from("onboarding_submissions")
        .update({ applied_fields: next })
        .eq("id", submission_id);
    }

    return json({ success: true, applied_key: appliedKey });
  } catch (e: any) {
    console.error("onboarding-apply-field error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
