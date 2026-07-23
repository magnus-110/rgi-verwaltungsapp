import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** CRUD für Umfragen (Verwaltung). */

export type SurveyStatus = "draft" | "open" | "paused" | "closed" | "archived";

export interface AdminSurvey {
  id: string;
  building_id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  opens_at: string | null;
  closes_at: string | null;
  quorum_pct: number | null;
  is_visible_to_owners: boolean;
  welcome_title: string | null;
  welcome_message: string | null;
  end_title: string | null;
  end_message: string | null;
  safety_notice: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
  vote_count?: number;
}

export function useAdminSurveys(buildingId?: string, includeArchived = false) {
  return useQuery({
    queryKey: ["admin-surveys", buildingId, includeArchived],
    enabled: !!buildingId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("surveys")
        .select("*, survey_items(count), survey_votes(count)")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });
      if (!includeArchived) q = q.neq("status", "archived");
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        item_count: s.survey_items?.[0]?.count ?? 0,
        vote_count: s.survey_votes?.[0]?.count ?? 0,
      })) as AdminSurvey[];
    },
  });
}

export function useAdminSurvey(surveyId?: string) {
  return useQuery({
    queryKey: ["admin-survey", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("surveys")
        .select("*")
        .eq("id", surveyId)
        .maybeSingle();
      if (error) throw error;
      return data as AdminSurvey | null;
    },
  });
}

export function useCreateSurvey() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: { building_id: string; title: string; description?: string }) => {
      const { data, error } = await (supabase as any)
        .from("surveys")
        .insert({
          building_id: payload.building_id,
          title: payload.title,
          description: payload.description ?? null,
          status: "draft",
          is_visible_to_owners: true,
          welcome_title: "Ihre Meinung zählt",
          welcome_message:
            "Wir möchten wissen, welche Verbesserungen Ihnen am wichtigsten sind. Sie sehen mehrere Themen – bei jedem tippen Sie einfach auf Ja, Neutral oder Nein.",
          end_title: "Vielen Dank für Ihre Teilnahme!",
          end_message:
            "Ihre Rückmeldung hilft uns, die nächste Eigentümerversammlung vorzubereiten. Wir werten alle Antworten aus und senden Ihnen vor der Versammlung eine Übersicht.",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-surveys"] });
      toast({ title: "Umfrage erstellt" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateSurvey() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminSurvey> }) => {
      const { error } = await (supabase as any).from("surveys").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin-surveys"] });
      qc.invalidateQueries({ queryKey: ["admin-survey", v.id] });
      qc.invalidateQueries({ queryKey: ["owner-survey", v.id] });
      qc.invalidateQueries({ queryKey: ["owner-visible-surveys"] });
    },
    onError: (e: any) => toast({ title: "Speichern fehlgeschlagen", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteSurvey() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("surveys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-surveys"] });
      toast({ title: "Umfrage gelöscht" });
    },
    onError: (e: any) =>
      toast({ title: "Löschen nicht möglich", description: e.message, variant: "destructive" }),
  });
}

export function useDuplicateSurvey() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, buildingId }: { id: string; buildingId?: string }) => {
      const { data: src, error: e1 } = await (supabase as any)
        .from("surveys")
        .select("*")
        .eq("id", id)
        .single();
      if (e1) throw e1;
      const { data: newSurvey, error: e2 } = await (supabase as any)
        .from("surveys")
        .insert({
          building_id: buildingId ?? src.building_id,
          title: src.title + " (Kopie)",
          description: src.description,
          status: "draft",
          quorum_pct: src.quorum_pct,
          is_visible_to_owners: src.is_visible_to_owners,
          welcome_title: src.welcome_title,
          welcome_message: src.welcome_message,
          end_title: src.end_title,
          end_message: src.end_message,
        })
        .select("id")
        .single();
      if (e2) throw e2;

      const { data: items } = await (supabase as any)
        .from("survey_items")
        .select("*")
        .eq("survey_id", id)
        .order("position");
      const idMap = new Map<string, string>();
      for (const it of items || []) {
        const { data: newIt, error: e3 } = await (supabase as any)
          .from("survey_items")
          .insert({
            survey_id: newSurvey.id,
            position: it.position,
            group_label: it.group_label,
            title: it.title,
            explanation: it.explanation,
            cost_tier: it.cost_tier,
            is_safety: it.is_safety,
            item_type: it.item_type,
            followup_question: it.followup_question,
            followup_options: it.followup_options,
          })
          .select("id")
          .single();
        if (e3) throw e3;
        idMap.set(it.id, newIt.id);
      }
      // Dependencies erst nachziehen (referenzieren neue Item-IDs)
      for (const it of items || []) {
        if (it.depends_on_item_id && idMap.has(it.depends_on_item_id)) {
          await (supabase as any)
            .from("survey_items")
            .update({
              depends_on_item_id: idMap.get(it.depends_on_item_id),
              depends_on_choice: it.depends_on_choice,
            })
            .eq("id", idMap.get(it.id));
        }
      }
      return newSurvey.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-surveys"] });
      toast({ title: "Umfrage dupliziert" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}
