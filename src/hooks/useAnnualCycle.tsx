import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

/**
 * Jahreszyklus.
 *
 * Entscheidung 9 des Umsetzungsplans: Die Matrix erzeugt keine Aufgaben von
 * selbst. Sie bleibt Übersicht; was ansteht, landet als Vorrat-Eintrag daneben
 * und kommt nur auf die Wand, wenn jemand es herüberholt.
 *
 * annual_cycle_definitions und annual_cycle_open stehen noch nicht in der
 * generierten types.ts; bis zum nächsten `npm run db:types` reicht das hier.
 */
const cycleDb = supabase as any;

export interface CycleDefinition {
  task_key: string;
  label: string;
  relevant_from_month: number;
  relevant_to_month: number | null;
  sort_order: number;
}

export interface CycleOpenRow {
  id: string;
  building_id: string;
  building_name: string | null;
  task_key: string;
  status: string;
  fiscal_year_start: string;
  fiscal_year_end: string;
  note: string | null;
  label: string;
  sort_order: number;
  fenster_von: string;
  fenster_bis: string | null;
  im_fenster: boolean;
  on_a_wall: boolean;
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

export function useSaveCycleDefinition() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      task_key: string;
      relevant_from_month: number;
      relevant_to_month: number | null;
    }) => {
      const { error } = await cycleDb
        .from('annual_cycle_definitions')
        .update({
          relevant_from_month: input.relevant_from_month,
          relevant_to_month: input.relevant_to_month,
        })
        .eq('task_key', input.task_key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cycle-definitions'] });
      qc.invalidateQueries({ queryKey: ['cycle-open'] });
      qc.invalidateQueries({ queryKey: ['board-supply'] });
    },
    onError: (e: any) =>
      toast({ title: 'Zeitfenster nicht gespeichert', description: e.message, variant: 'destructive' }),
  });
}

/** Alle offenen Zeilen mit Zeitfenster. */
export function useCycleOpen() {
  return useQuery({
    queryKey: ['cycle-open'],
    queryFn: async (): Promise<CycleOpenRow[]> => {
      const { data, error } = await cycleDb.from('annual_cycle_open').select('*');
      if (error) throw error;
      return (data || []) as CycleOpenRow[];
    },
  });
}

/** Der volle Stand eines Wirtschaftsjahres für die Matrix, inklusive erledigter Zeilen. */
export function useCycleMatrix(fiscalYearStart: string) {
  return useQuery({
    queryKey: ['cycle-matrix', fiscalYearStart],
    queryFn: async () => {
      const [{ data: tasks, error }, { data: buildings }] = await Promise.all([
        supabase
          .from('annual_cycle_tasks')
          .select('id, building_id, task_key, status, fiscal_year_end, note')
          .eq('fiscal_year_start', fiscalYearStart),
        supabase
          .from('buildings')
          .select('id, name')
          .eq('management_mode', 'weg')
          .order('name'),
      ]);
      if (error) throw error;
      return {
        tasks: (tasks || []) as any[],
        buildings: (buildings || []) as { id: string; name: string }[],
      };
    },
  });
}

export interface BundledDuty {
  taskKey: string;
  label: string;
  sortOrder: number;
  /** Eine Zeile je Gebäude — wird zu einem Unterpunkt der einen Karte. */
  zeilen: CycleOpenRow[];
  fensterBis: string | null;
}

/**
 * „Jetzt dran" — die offenen Zeilen im Zeitfenster, gebündelt nach Pflicht.
 *
 * Der wichtigste Punkt dieses Bildschirms: Eine Pflicht über 23 Gebäude wird
 * zu EINER Karte mit 23 Unterpunkten, nicht zu 23 Karten.
 */
export function useDutiesDueNow() {
  const { data: rows = [], isLoading } = useCycleOpen();

  const buendel: BundledDuty[] = [];
  const map = new Map<string, BundledDuty>();

  rows
    .filter(r => r.im_fenster && !r.on_a_wall)
    .forEach(r => {
      let b = map.get(r.task_key);
      if (!b) {
        b = {
          taskKey: r.task_key,
          label: r.label,
          sortOrder: r.sort_order,
          zeilen: [],
          fensterBis: r.fenster_bis,
        };
        map.set(r.task_key, b);
        buendel.push(b);
      }
      b.zeilen.push(r);
    });

  buendel.sort((a, b) => a.sortOrder - b.sortOrder);
  return { buendel, isLoading, alleOffen: rows.length };
}

/**
 * Eine Pflicht als einen Zettel aufhängen: eine Aufgabe, ein Unterpunkt
 * je Gebäude. Der Unique-Index auf (source_type, source_id) sorgt dafür,
 * dass dieselbe Pflicht im selben Wirtschaftsjahr nicht zweimal entsteht.
 */
export function usePinDutyAsNote() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (duty: BundledDuty) => {
      const jahr = duty.zeilen[0]?.fiscal_year_start?.slice(0, 4) ?? '';
      const titel = `${duty.label}${jahr ? ` ${jahr}` : ''}`;

      // Deterministische Quelle: dieselbe Pflicht im selben Jahr ergibt
      // immer dieselbe Kennung.
      const quelle = `${duty.taskKey}:${duty.zeilen[0]?.fiscal_year_start ?? ''}`;
      const sourceId = await uuidAusText(quelle);

      const { data: vorhanden } = await supabase
        .from('todos')
        .select('id')
        .eq('source_type', 'annual_cycle')
        .eq('source_id', sourceId)
        .maybeSingle();

      let todoId = (vorhanden as any)?.id as string | undefined;

      if (!todoId) {
        const { data: todo, error } = await supabase
          .from('todos')
          .insert({
            title: titel,
            description: `${duty.zeilen.length} Gebäude · aus dem Jahreszyklus`,
            status: 'open',
            priority: 'medium',
            source_type: 'annual_cycle',
            source_id: sourceId,
            due_date: duty.fensterBis,
            created_by: user!.id,
          } as any)
          .select('id')
          .single();
        if (error) throw error;
        todoId = (todo as any).id;

        const punkte = duty.zeilen.map((z, i) => ({
          todo_id: todoId,
          title: z.building_name || 'Gebäude',
          created_by: user!.id,
          sort_order: i,
        }));
        const { error: subError } = await supabase.from('todo_subtasks').insert(punkte as any);
        if (subError) throw subError;
      }

      // Auf die eigene Wand heften.
      const { data: top } = await (supabase as any)
        .from('board_pins')
        .select('sort_order')
        .eq('user_id', user!.id)
        .eq('column_key', 'wall')
        .order('sort_order', { ascending: true })
        .limit(1);
      const nextSort = top && top.length ? Number(top[0].sort_order) - 1 : 0;

      const { error: pinError } = await (supabase as any).from('board_pins').insert({
        user_id: user!.id,
        ref_type: 'todo',
        ref_id: todoId,
        column_key: 'wall',
        sort_order: nextSort,
        pinned_by: user!.id,
      });
      if (pinError && (pinError as any).code !== '23505') throw pinError;

      return { anzahl: duty.zeilen.length, titel };
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['board-pins'] });
      qc.invalidateQueries({ queryKey: ['board-supply'] });
      qc.invalidateQueries({ queryKey: ['todos'] });
      toast({
        title: 'Aufgehängt',
        description: `„${res.titel}" liegt als ein Zettel mit ${res.anzahl} Punkten an deiner Wand.`,
      });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht aufgehängt', description: e.message, variant: 'destructive' }),
  });
}

/**
 * Aus einem Text eine feste UUID bilden, damit derselbe Ursprung immer
 * dieselbe Kennung ergibt (SHA-256, auf UUID-Form gebracht).
 */
async function uuidAusText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(hash.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
