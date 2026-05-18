// Apply a single field from an onboarding submission to the target tables.
// Tracks applied fields in submissions.applied_fields (jsonb array of strings).
// IMPORTANT: For Step-2-fields (qm/mea/hausgeld) the per-unit assignment_id MUST
// be respected so multi-unit owners get their data on the correct unit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEATING_LABELS: Record<string, string> = {
  gas: "Gas", oel: "Öl", fernwaerme: "Fernwärme", waermepumpe: "Wärmepumpe",
  pellets: "Pellets", strom: "Strom",
};

const UNIT_KIND_LABELS: Record<string, string> = {
  parking_garage: "Tiefgaragen-Stellplatz",
  parking_outdoor: "Außenstellplatz",
  cellar: "Keller",
  attic: "Speicher/Dachboden",
  garden: "Gartenanteil",
  storage: "Abstellraum",
  other: "Sonstige Einheit",
};

const parseNum = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
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

    const reqBody = await req.json();
    console.log("apply-field request", JSON.stringify(reqBody));
    const { submission_id, field, value } = reqBody;
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
    const subAssignmentId = (sub as any).assignment_id as string | null;
    let payload = ((sub as any).payload || {}) as Record<string, any>;

    // If the submission still carries a legacy per_unit map AND value tells us
    // which unit, narrow the payload to that unit so qm/mea/hausgeld work.
    const targetAssignmentId: string | null =
      (value && typeof value === "object" && value.assignment_id) ||
      subAssignmentId ||
      null;
    if (
      payload.per_unit &&
      typeof payload.per_unit === "object" &&
      targetAssignmentId &&
      payload.per_unit[targetAssignmentId]
    ) {
      payload = { ...payload, ...payload.per_unit[targetAssignmentId] };
    }

    // Compute the unique field-key we store in applied_fields
    let appliedKey = field as string;

    try {
      switch (field) {
        // ---------- STEP 2: Wohnungsdaten ----------
        case "qm":
        case "mea":
        case "hausgeld": {
          if (!contactId) return json({ error: "Kein Kontakt zugeordnet" }, 400);
          // Resolve assignment: explicit > submission > fallback (single-unit)
          let aid: string | null = targetAssignmentId;
          if (!aid) {
            const { data: assignment } = await admin
              .from("contact_building_assignments")
              .select("id")
              .eq("contact_id", contactId)
              .eq("building_id", buildingId)
              .is("parent_assignment_id", null)
              .eq("is_active", true)
              .limit(1)
              .maybeSingle();
            aid = (assignment as any)?.id ?? null;
          }
          if (!aid) return json({ error: "Keine Zuordnung gefunden" }, 400);

          if (field === "qm") {
            const v = payload.square_meters ?? payload.qm;
            const num = parseNum(v);
            if (num == null) return json({ error: "Kein Wert vorhanden" }, 400);
            // 1) Override auf der Zuordnung
            await admin
              .from("contact_building_assignments")
              .update({ area_sqm_override: num })
              .eq("id", aid);
            // 2) Zusätzlich als Verteilerschlüssel in contact_building_shares (share_type='qm')
            const { data: existingQmShare } = await admin
              .from("contact_building_shares")
              .select("id")
              .eq("assignment_id", aid)
              .eq("share_type", "qm")
              .limit(1)
              .maybeSingle();
            if (existingQmShare) {
              await admin
                .from("contact_building_shares")
                .update({ share_value: num })
                .eq("id", (existingQmShare as any).id);
            } else {
              await admin
                .from("contact_building_shares")
                .insert({ assignment_id: aid, share_type: "qm", share_value: num });
            }
          } else if (field === "mea") {
            const v = payload.mea_share ?? payload.mea;
            if (v == null || v === "") return json({ error: "Kein Wert vorhanden" }, 400);
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
            const amt = parseNum(v);
            if (amt == null) return json({ error: "Kein Wert vorhanden" }, 400);
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
          // Per-unit applied key
          appliedKey = `${field}:${aid}`;
          break;
        }

        // ---------- STEP 2 extra: Sub-Einheit (TG, Stellplatz, Keller, ...) ----------
        case "secondary_unit": {
          if (!contactId) return json({ error: "Kein Kontakt zugeordnet" }, 400);
          const idx = Number(value?.index ?? -1);
          const su = (payload.secondary_units || [])[idx];
          if (!su) return json({ error: "Sub-Einheit nicht gefunden" }, 400);

          // Parent assignment = main assignment of this submission/owner in this building
          let parentAid: string | null = targetAssignmentId;
          if (!parentAid) {
            const { data: assignment } = await admin
              .from("contact_building_assignments")
              .select("id")
              .eq("contact_id", contactId)
              .eq("building_id", buildingId)
              .is("parent_assignment_id", null)
              .eq("is_active", true)
              .limit(1)
              .maybeSingle();
            parentAid = (assignment as any)?.id ?? null;
          }
          if (!parentAid) return json({ error: "Hauptzuordnung nicht gefunden" }, 400);

          // Insert sub-assignment (skip if a similar one already exists)
          const unitKind = String(su.unit_kind || "other");
          const unitNumber = (su.unit_number || "").toString().trim() || null;
          const { data: existingSub } = await admin
            .from("contact_building_assignments")
            .select("id")
            .eq("parent_assignment_id", parentAid)
            .eq("unit_kind", unitKind)
            .eq("contact_id", contactId)
            .eq("building_id", buildingId)
            .limit(1)
            .maybeSingle();

          let subAid: string;
          if (existingSub) {
            subAid = (existingSub as any).id;
            await admin
              .from("contact_building_assignments")
              .update({ unit_number: unitNumber, is_active: true })
              .eq("id", subAid);
          } else {
            const { data: created, error: insErr } = await admin
              .from("contact_building_assignments")
              .insert({
                contact_id: contactId,
                building_id: buildingId,
                parent_assignment_id: parentAid,
                role_in_building: "eigentuemer",
                unit_kind: unitKind,
                unit_number: unitNumber,
                is_active: true,
                notes: `Aus Onboarding übernommen (${UNIT_KIND_LABELS[unitKind] || unitKind})`,
              })
              .select("id")
              .single();
            if (insErr || !created) {
              return json({ error: `Sub-Einheit anlegen fehlgeschlagen: ${insErr?.message}` }, 500);
            }
            subAid = (created as any).id;
          }

          // Optional: MEA + Hausgeld
          const meaVal = su.mea_share;
          if (meaVal != null && String(meaVal).trim() !== "") {
            const { data: existingShare } = await admin
              .from("contact_building_shares")
              .select("id")
              .eq("assignment_id", subAid)
              .eq("share_type", "mea")
              .limit(1)
              .maybeSingle();
            if (existingShare) {
              await admin
                .from("contact_building_shares")
                .update({ share_value: String(meaVal) })
                .eq("id", (existingShare as any).id);
            } else {
              await admin
                .from("contact_building_shares")
                .insert({ assignment_id: subAid, share_type: "mea", share_value: String(meaVal) });
            }
          }
          const feeNum = parseNum(su.monthly_fee);
          if (feeNum != null) {
            const { data: existingCost } = await admin
              .from("contact_building_costs")
              .select("id")
              .eq("assignment_id", subAid)
              .ilike("cost_type", "%hausgeld%")
              .limit(1)
              .maybeSingle();
            if (existingCost) {
              await admin
                .from("contact_building_costs")
                .update({ amount: feeNum })
                .eq("id", (existingCost as any).id);
            } else {
              await admin
                .from("contact_building_costs")
                .insert({ assignment_id: subAid, cost_type: "Hausgeld", amount: feeNum });
            }
          }

          appliedKey = `secondary_unit:${parentAid}:${idx}`;
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
          // value: { trade, name, contact_id?, category?, phone?, email? }
          const name = String(value?.name || "").trim();
          if (!name) return json({ error: "Kein Provider" }, 400);
          const category = String(value?.category || value?.trade || "Sonstige");
          const phone = value?.phone ? String(value.phone).trim() : null;
          const email = value?.email ? String(value.email).trim() : null;

          // 1) Find or create a contact (company) with this name
          let providerContactId: string | null = null;
          const { data: existingContact } = await admin
            .from("contacts")
            .select("id")
            .ilike("company_name", name)
            .in("contact_type", ["company", "service_provider"])
            .limit(1)
            .maybeSingle();

          if (existingContact) {
            providerContactId = (existingContact as any).id;
          } else {
            const { data: newContact, error: cErr } = await admin
              .from("contacts")
              .insert({
                company_name: name,
                contact_type: "service_provider",
                short_name: name.slice(0, 40),
              })
              .select("id")
              .single();
            if (cErr) return json({ error: `Kontakt anlegen fehlgeschlagen: ${cErr.message}` }, 500);
            providerContactId = (newContact as any).id;

            // Optional: phone/email as primary
            if (phone) {
              await admin.from("contact_phones").insert({
                contact_id: providerContactId, phone_number: phone, label: "Geschäftlich",
              });
            }
            if (email) {
              await admin.from("contact_emails").insert({
                contact_id: providerContactId, email, label: "Geschäftlich", is_primary: true,
              });
            }
          }

          // 2) Ensure assignment as Dienstleister exists for this building
          const { data: existingAssign } = await admin
            .from("contact_building_assignments")
            .select("id")
            .eq("contact_id", providerContactId!)
            .eq("building_id", buildingId)
            .eq("role_in_building", "dienstleister")
            .limit(1)
            .maybeSingle();

          if (!existingAssign) {
            const { error: aErr } = await admin.from("contact_building_assignments").insert({
              contact_id: providerContactId,
              building_id: buildingId,
              role_in_building: "dienstleister",
              service_category: category,
              is_active: true,
              notes: "Aus Onboarding übernommen",
            });
            if (aErr) return json({ error: `Zuordnung fehlgeschlagen: ${aErr.message}` }, 500);
          } else {
            await admin
              .from("contact_building_assignments")
              .update({ service_category: category, is_active: true })
              .eq("id", (existingAssign as any).id);
          }

          // 3) Mirror in building_service_providers (for stats/widgets)
          const { data: bsp } = await admin
            .from("building_service_providers")
            .select("id, suggested_by_count")
            .eq("building_id", buildingId)
            .ilike("name", name)
            .eq("category", category)
            .limit(1)
            .maybeSingle();
          if (bsp) {
            await admin
              .from("building_service_providers")
              .update({ suggested_by_count: ((bsp as any).suggested_by_count || 1) + 1 })
              .eq("id", (bsp as any).id);
          } else {
            await admin.from("building_service_providers").insert({
              building_id: buildingId, name, category, phone, email, source: "onboarding",
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
          // Write directly to building.etv_default_location so it shows in overview
          const { error: bErr } = await admin
            .from("buildings")
            .update({ etv_default_location: loc })
            .eq("id", buildingId);
          if (bErr) return json({ error: `Speichern fehlgeschlagen: ${bErr.message}` }, 500);
          // Also keep an audit trail in assessments
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
