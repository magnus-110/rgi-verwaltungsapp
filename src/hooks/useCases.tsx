import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type CaseStatus = "open" | "in_progress" | "waiting_external" | "waiting_owner" | "resolved" | "archived";
export type CasePriority = "low" | "medium" | "high" | "urgent";
export type CaseCategory = "schaden" | "versicherung" | "maengel" | "eigentuemerwechsel" | "rechtliches" | "instandhaltung" | "sonstiges";
export type CaseEventType = "note" | "email" | "document" | "image" | "todo" | "booking" | "meeting" | "phone" | "status_change" | "ai_summary" | "file";

export type ManagementMode = "weg" | "rent";

export interface CaseRow {
  id: string;
  building_id: string;
  management_mode: ManagementMode;
  title: string;
  description: string | null;
  category: CaseCategory;
  status: CaseStatus;
  priority: CasePriority;
  assignee_user_id: string | null;
  unit_number: string | null;
  due_at: string | null;
  closed_at: string | null;
  external_refs: any;
  ai_summary: string | null;
  ai_summary_updated_at: string | null;
  ai_keywords: string[];
  ai_next_steps: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  building_id: string;
  event_type: CaseEventType;
  occurred_at: string;
  title: string | null;
  body: string | null;
  source_table: string | null;
  source_id: string | null;
  attachments: any[];
  extracted_data: any;
  created_by: string;
  created_at: string;
}

export const useCases = (buildingId: string) => {
  return useQuery({
    queryKey: ["cases", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("building_id", buildingId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CaseRow[];
    },
    enabled: !!buildingId,
  });
};

export interface CaseWithBuilding extends CaseRow {
  buildings: { id: string; name: string; address: string | null } | null;
  events_count: number;
}

export const useAllCases = (managementMode: ManagementMode) => {
  return useQuery({
    queryKey: ["cases-all", managementMode],
    queryFn: async () => {
      // Filter via building.management_mode using inner join
      const { data, error } = await supabase
        .from("cases")
        .select("*, buildings!inner(id, name, address, management_mode)")
        .eq("buildings.management_mode", managementMode)
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = (data || []) as any[];

      // Fetch event counts in one query
      const ids = rows.map((r) => r.id);
      const counts = new Map<string, number>();
      if (ids.length) {
        const { data: ev } = await supabase
          .from("case_events")
          .select("case_id")
          .in("case_id", ids);
        (ev || []).forEach((e: any) => counts.set(e.case_id, (counts.get(e.case_id) || 0) + 1));
      }

      return rows.map((r) => ({
        ...r,
        buildings: r.buildings ? { id: r.buildings.id, name: r.buildings.name, address: r.buildings.address } : null,
        events_count: counts.get(r.id) || 0,
      })) as CaseWithBuilding[];
    },
  });
};

export const useCase = (caseId: string | null) => {
  return useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      if (!caseId) return null;
      const { data, error } = await supabase.from("cases").select("*").eq("id", caseId).single();
      if (error) throw error;
      return data as CaseRow;
    },
    enabled: !!caseId,
  });
};

export const useCaseEvents = (caseId: string | null) => {
  return useQuery({
    queryKey: ["case-events", caseId],
    queryFn: async () => {
      if (!caseId) return [];
      const { data, error } = await supabase
        .from("case_events")
        .select("*")
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CaseEvent[];
    },
    enabled: !!caseId,
  });
};

export const useCreateCase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      building_id: string;
      management_mode: ManagementMode;
      title: string;
      description?: string;
      category?: CaseCategory;
      priority?: CasePriority;
      unit_number?: string;
      due_at?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");
      const { data, error } = await supabase
        .from("cases")
        .insert([{ ...input, created_by: user.id }] as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CaseRow;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["cases", data.building_id] });
      qc.invalidateQueries({ queryKey: ["cases-all"] });
      toast({ title: "Vorgang angelegt" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
};

export const useAddCaseEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      case_id: string;
      event_type: CaseEventType;
      title?: string;
      body?: string;
      occurred_at?: string;
      source_table?: string;
      source_id?: string;
      attachments?: any[];
      extracted_data?: any;
      trigger_summary?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke("case-add-event", { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["case-events", vars.case_id] });
      qc.invalidateQueries({ queryKey: ["case", vars.case_id] });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
};

export const useUpdateCaseEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, case_id, ...patch }: { id: string; case_id: string; title?: string | null; body?: string | null; occurred_at?: string; attachments?: any[] }) => {
      const { data, error } = await supabase.from("case_events").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["case-events", vars.case_id] });
      qc.invalidateQueries({ queryKey: ["case", vars.case_id] });
      toast({ title: "Aktualisiert" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
};

export const useDeleteCaseEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, case_id }: { id: string; case_id: string }) => {
      const { error } = await supabase.from("case_events").delete().eq("id", id);
      if (error) throw error;
      return { id, case_id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["case-events", res.case_id] });
      qc.invalidateQueries({ queryKey: ["case", res.case_id] });
      toast({ title: "Gelöscht" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
};

export const useSummarizeCase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (case_id: string) => {
      const { data, error } = await supabase.functions.invoke("case-summarize", { body: { case_id } });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, case_id) => {
      qc.invalidateQueries({ queryKey: ["case", case_id] });
      toast({ title: "Zusammenfassung aktualisiert" });
    },
  });
};

export const useDeleteCase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Best-effort: delete events first (in case FK has no cascade)
      await supabase.from("case_events").delete().eq("case_id", id);
      const { error } = await supabase.from("cases").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cases-all"] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      toast({ title: "Vorgang gelöscht" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
};

export const useUpdateCase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CaseRow> & { id: string }) => {
      const { data, error } = await supabase.from("cases").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as CaseRow;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["cases", data.building_id] });
      qc.invalidateQueries({ queryKey: ["case", data.id] });
      qc.invalidateQueries({ queryKey: ["cases-all"] });
    },
  });
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting_external: "Warte auf Extern",
  waiting_owner: "Warte auf Eigentümer",
  resolved: "Erledigt",
  archived: "Archiviert",
};

export const CASE_PRIORITY_LABEL: Record<CasePriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};

export const CASE_CATEGORY_LABEL: Record<CaseCategory, string> = {
  schaden: "Schaden",
  versicherung: "Versicherung",
  maengel: "Mängel",
  eigentuemerwechsel: "Eigentümerwechsel",
  rechtliches: "Rechtliches",
  instandhaltung: "Instandhaltung",
  sonstiges: "Sonstiges",
};
