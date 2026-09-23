import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Jahreszyklus.
 *
 * Alle fünfzehn Pflichten sind Gebäudepflichten: Bankabgleich, Jahresabrechnung,
 * TOPs abfragen, §35a — das macht man für ein Haus, nicht für dreiundzwanzig
 * auf einmal. Die Matrix bleibt die Übersicht; gearbeitet wird je Zelle.
 *
 * Und nicht jedes Haus rechnet nach dem Kalenderjahr ab. Sieben der
 * dreiundzwanzig haben ein verschobenes Wirtschaftsjahr, in vier Varianten.
 * Ein Umschalter für alle wäre also schlicht falsch.
 *
 * annual_cycle_definitions steht noch nicht in der generierten types.ts; bis
 * zum nächsten `npm run db:types` reicht das hier.
 */
const cycleDb = supabase as any;

export type CycleStatus = 'open' | 'in_progress' | 'done';

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Erledigt',
};

export interface CycleDefinition {
  task_key: string;
  label: string;
  sort_order: number;
}

/** Ein Gebäude mit seinem Wirtschaftsjahr. */
export interface CycleBuilding {
  id: string;
  name: string;
  /** 1–12, Standard 1 (Januar). */
  startMonth: number;
  /** 1–28, Standard 1. */
  startDay: number;
}

export interface CycleTask {
  id: string;
  building_id: string;
  task_key: string;
  status: CycleStatus;
  fiscal_year_start: string;
  fiscal_year_end: string;
  note: string | null;
}

export function useCycleDefinitions() {
  return useQuery({
    queryKey: ['cycle-definitions'],
    queryFn: async (): Promise<CycleDefinition[]> => {
      const { data, error } = await cycleDb
        .from('annual_cycle_definitions')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data || []) as CycleDefinition[];
    },
  });
}

/** Die WEG-Gebäude mit ihrem Wirtschaftsjahr aus den Gebäudeinfos. */
export function useCycleBuildings() {
  return useQuery({
    queryKey: ['cycle-buildings'],
    queryFn: async (): Promise<CycleBuilding[]> => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name, fiscal_year_start_month, fiscal_year_start_day')
        .eq('management_mode', 'weg')
        .order('name');
      if (error) throw error;
      return ((data || []) as any[]).map(b => ({
        id: b.id,
        name: b.name,
        startMonth: b.fiscal_year_start_month ?? 1,
        startDay: b.fiscal_year_start_day ?? 1,
      }));
    },
  });
}

/**
 * Alle Zeilen auf einmal.
 *
 * Es sind gut siebenhundert; die holt man einmal und teilt sie danach im
 * Browser auf die Blöcke auf. Sonst bräuchte jede Wirtschaftsjahr-Variante
 * eine eigene Abfrage.
 */
export function useCycleTasks() {
  return useQuery({
    queryKey: ['cycle-tasks'],
    queryFn: async (): Promise<CycleTask[]> => {
      const { data, error } = await supabase
        .from('annual_cycle_tasks')
        .select('id, building_id, task_key, status, fiscal_year_start, fiscal_year_end, note');
      if (error) throw error;
      return (data || []) as unknown as CycleTask[];
    },
  });
}

/** Den Stand einer einzelnen Zelle setzen. */
export function useSetCycleStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { taskId: string; status: CycleStatus }) => {
      const { error } = await supabase
        .from('annual_cycle_tasks')
        .update({
          status: input.status,
          completed_at: input.status === 'done' ? new Date().toISOString() : null,
        } as any)
        .eq('id', input.taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cycle-tasks'] });
      qc.invalidateQueries({ queryKey: ['board-supply'] });
      qc.invalidateQueries({ queryKey: ['board-pins'] });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht geändert', description: e.message, variant: 'destructive' }),
  });
}

/**
 * Eine einzelne Pflicht eines Gebäudes auf die Wand heften.
 *
 * Angeheftet wird die Zeile selbst, keine Kopie — wer sie auf der Wand
 * abhakt, setzt damit auch die Zelle in der Matrix auf erledigt.
 */
export function usePinCycleTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { taskId: string; userId: string; titel: string }) => {
      const { data: top } = await (supabase as any)
        .from('board_pins')
        .select('sort_order')
        .eq('user_id', input.userId)
        .eq('column_key', 'wall')
        .order('sort_order', { ascending: true })
        .limit(1);
      const nextSort = top && top.length ? Number(top[0].sort_order) - 1 : 0;

      const { error } = await (supabase as any).from('board_pins').insert({
        user_id: input.userId,
        ref_type: 'annual_cycle_task',
        ref_id: input.taskId,
        column_key: 'wall',
        sort_order: nextSort,
        pinned_by: input.userId,
      });
      if (error) {
        if ((error as any).code === '23505') throw new Error('Hängt schon an deiner Wand.');
        throw error;
      }
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['board-pins'] });
      qc.invalidateQueries({ queryKey: ['board-supply'] });
      qc.invalidateQueries({ queryKey: ['cycle-pins'] });
      toast({ title: 'Aufgehängt', description: `„${input.titel}" liegt an deiner Wand.` });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht aufgehängt', description: e.message, variant: 'destructive' }),
  });
}

/** Welche Zeilen hängen an der eigenen Wand? */
export function useMyCyclePins(userId: string | undefined) {
  return useQuery({
    queryKey: ['cycle-pins', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from('board_pins')
        .select('ref_id')
        .eq('user_id', userId!)
        .eq('ref_type', 'annual_cycle_task')
        .neq('column_key', 'done');
      if (error) throw error;
      return new Set(((data || []) as any[]).map(p => p.ref_id as string));
    },
  });
}
