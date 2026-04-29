import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface OnboardingProgress {
  id: string;
  user_id: string;
  building_id: string;
  contact_id: string | null;
  current_step: number;
  step_data: Record<string, any>;
  step1_completed_at: string | null;
  step2_completed_at: string | null;
  step3_completed_at: string | null;
  step4_completed_at: string | null;
  step5_completed_at: string | null;
  fully_completed_at: string | null;
  fab_dismissed_at: string | null;
  is_repeat_owner: boolean;
  applies_to_all_assignments?: boolean | null;
}

export interface OnboardingAssignment {
  id: string;
  unit_number: string | null;
  floor_location: string | null;
  unit_kind: string | null;
  label: string;
}

export interface OnboardingContext {
  loading: boolean;
  buildingId: string | null;
  buildingName: string | null;
  isActive: boolean;
  progress: OnboardingProgress | null;
  assignments: OnboardingAssignment[];
  refresh: () => Promise<void>;
}

/**
 * Loads the active onboarding context for the current weg-owner.
 * Picks the first building where:
 *   - the user is assigned (via contacts)
 *   - onboarding_activations.is_active = true
 *   - progress.fully_completed_at IS NULL
 */
export const useOnboardingContext = (): OnboardingContext => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [unitAssignments, setUnitAssignments] = useState<OnboardingAssignment[]>([]);

  const load = useCallback(async () => {
    if (!profile?.user_id) {
      setLoading(false);
      return;
    }

    try {
      // Find the user's contact -> building assignments
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", profile.user_id);

      const contactIds = (contacts ?? []).map((c) => c.id);
      if (contactIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: assignments } = await supabase
        .from("contact_building_assignments" as any)
        .select("building_id, buildings(name)")
        .in("contact_id", contactIds);

      const buildingIds = Array.from(
        new Set((assignments ?? []).map((a: any) => a.building_id))
      );
      if (buildingIds.length === 0) {
        setLoading(false);
        return;
      }

      // Find an active onboarding for one of these buildings
      const { data: activations } = await supabase
        .from("onboarding_activations" as any)
        .select("building_id, is_active")
        .in("building_id", buildingIds)
        .eq("is_active", true)
        .limit(1);

      const activeBuildingId =
        (activations as any[])?.[0]?.building_id ?? null;
      if (!activeBuildingId) {
        setLoading(false);
        return;
      }

      setBuildingId(activeBuildingId);
      setIsActive(true);
      const matchingAssignment = (assignments as any[]).find(
        (a) => a.building_id === activeBuildingId
      );
      setBuildingName(matchingAssignment?.buildings?.name ?? null);

      // Load all active assignments for this contact + building
      // (a single contact may own multiple units in the same building)
      const matchingContactId = contactIds[0]; // contact_id is unique per user
      const { data: unitRows } = await supabase
        .from("contact_building_assignments" as any)
        .select("id, unit_number, floor_location, unit_kind, parent_assignment_id, is_active, created_at")
        .eq("contact_id", matchingContactId)
        .eq("building_id", activeBuildingId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      // Filter to top-level unit assignments only (exclude sub-units like Stellplätze)
      const topLevel = (unitRows as any[] ?? []).filter(
        (r) => !r.parent_assignment_id
      );
      const mapped: OnboardingAssignment[] = topLevel.map((r, idx) => {
        const parts: string[] = [];
        if (r.unit_number) parts.push(`Wohnung ${r.unit_number}`);
        if (r.floor_location) parts.push(r.floor_location);
        const label = parts.length > 0 ? parts.join(" · ") : `Einheit ${idx + 1}`;
        return {
          id: r.id,
          unit_number: r.unit_number,
          floor_location: r.floor_location,
          unit_kind: r.unit_kind,
          label,
        };
      });
      setUnitAssignments(mapped);

      // Fetch or create progress row
      const { data: existing } = await supabase
        .from("onboarding_progress" as any)
        .select("*")
        .eq("user_id", profile.user_id)
        .eq("building_id", activeBuildingId)
        .maybeSingle();

      if (existing && !(existing as any).fully_completed_at) {
        setProgress(existing as any);
      } else if (!existing) {
        const { data: created } = await supabase
          .from("onboarding_progress" as any)
          .insert({
            user_id: profile.user_id,
            building_id: activeBuildingId,
            contact_id: matchingContactId ?? null,
            current_step: 1,
            step_data: {},
          })
          .select("*")
          .single();
        setProgress(created as any);
      } else {
        setProgress(existing as any);
      }
    } catch (e) {
      console.error("Onboarding context load failed", e);
    } finally {
      setLoading(false);
    }
  }, [profile?.user_id]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    loading,
    buildingId,
    buildingName,
    isActive,
    progress,
    assignments: unitAssignments,
    refresh: load,
  };
};

/**
 * Debounced auto-save for step_data. Returns a `flush` function that immediately
 * persists pending changes — call before navigating between steps to avoid loss.
 */
export const useStepAutoSave = (
  buildingId: string | null,
  step: number,
  data: Record<string, any>,
  delay = 600
) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestData = useRef(data);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    latestData.current = data;
  }, [data]);

  const persist = useCallback(async () => {
    if (!buildingId) return;
    setSaving(true);
    try {
      const stepKey = `step${step}` as const;
      const stepPayload = (latestData.current as any)?.[stepKey] ?? {};
      await supabase.functions.invoke("save-onboarding-step", {
        body: { building_id: buildingId, step, data: stepPayload },
      });
    } catch (e) {
      console.error("autosave failed", e);
    } finally {
      setSaving(false);
    }
  }, [buildingId, step]);

  useEffect(() => {
    if (!buildingId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      persist();
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), buildingId, step, delay]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await persist();
  }, [persist]);

  return { saving, flush };
};
