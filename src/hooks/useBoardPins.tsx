import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { boardDb } from '@/integrations/supabase/board';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

/**
 * Pinnwand-Datenschicht.
 *
 * Grundregel aus dem Umsetzungsplan: Eine Karte ist eine Anheftung (board_pins),
 * keine Kopie. Die Quelle (todo, case, annual_cycle_task) bleibt unangetastet.
 * Nichts landet von selbst auf einer Wand — es gibt nur pinToWall().
 */

export type BoardRefType = 'todo' | 'case' | 'annual_cycle_task' | 'maintenance';
export type BoardColumnKey = 'wall' | 'waiting' | 'done';

export interface BoardPin {
  id: string;
  user_id: string;
  ref_type: BoardRefType;
  ref_id: string;
  column_key: BoardColumnKey;
  waiting_for: string | null;
  note: string | null;
  sort_order: number;
  pinned_at: string;
  pinned_by: string | null;
  done_at: string | null;
}

/** Herkunft einer Karte — bestimmt Punktfarbe und Kleinschrift auf dem Zettel. */
export type BoardOrigin =
  | 'vorgang'
  | 'jahreszyklus'
  | 'frist'
  | 'wiedervorlage'
  | 'ohne_termin'
  | 'wartung';

export const ORIGIN_LABEL: Record<BoardOrigin, string> = {
  vorgang: 'Vorgang',
  jahreszyklus: 'Jahreszyklus',
  frist: 'Frist',
  wiedervorlage: 'Wiedervorlage',
  ohne_termin: 'Ohne Termin',
  wartung: 'Wartung',
};

export const ORIGIN_DOT: Record<BoardOrigin, string> = {
  vorgang: 'bg-[#ee7202]',
  jahreszyklus: 'bg-[#5b7fa6]',
  frist: 'bg-[#b4472b]',
  wiedervorlage: 'bg-[#6b8a55]',
  ohne_termin: 'bg-[#b6b0a4]',
  wartung: 'bg-[#7a6fa0]',
};

/** Ein Eintrag, egal ob er auf einer Wand hängt oder noch im Vorrat liegt. */
export interface BoardItem {
  refType: BoardRefType;
  refId: string;
  title: string;
  /** Gebäude, ggf. mit Einheit — die graue Zeile unter dem Titel. */
  context: string | null;
  origin: BoardOrigin;
  dueDate: string | null;
  followUpAt: string | null;
  createdAt: string | null;
  progress: { done: number; total: number } | null;
  /** Nur gesetzt, wenn der Eintrag angeheftet ist. */
  pin?: BoardPin;
  /** Andere Personen, an deren Wand dieselbe Karte hängt. */
  alsoOn: { userId: string; name: string; initials: string }[];
}

export function initialsOf(firstName?: string | null, lastName?: string | null, fallback = '??') {
  const a = (firstName || '').trim();
  const b = (lastName || '').trim();
  const out = `${a.charAt(0)}${b.charAt(0)}`.toUpperCase();
  return out.trim() || fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tage seit einem Datum, nie negativ. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Math.floor((Date.now() - then) / 86400000);
  return diff < 0 ? 0 : diff;
}

export function formatDateDe(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Herkunft eines Todos ableiten — es gibt kein Feld dafür, nur die Datenlage. */
function originOfTodo(t: { due_date: string | null; follow_up_at: string | null; source_type?: string | null }): BoardOrigin {
  if (t.source_type === 'maintenance') return 'wartung';
  if (t.source_type === 'annual_cycle') return 'jahreszyklus';
  if (t.source_type === 'case') return 'vorgang';
  if (t.follow_up_at) return 'wiedervorlage';
  if (t.due_date) return 'frist';
  return 'ohne_termin';
}

type ProfileLite = { user_id: string; first_name: string | null; last_name: string | null };

/**
 * Alle Anheftungen aller Kollegen, inklusive der aufgelösten Quelldaten.
 * Bewusst nicht nach Benutzer gefiltert: die Team-Ansicht (Etappe 2) braucht
 * dieselben Daten, und "hängt auch bei Anna" lässt sich nur so berechnen.
 */
export function useBoardPins() {
  return useQuery({
    queryKey: ['board-pins'],
    queryFn: async (): Promise<BoardItem[]> => {
      const { data: pinRows, error } = await boardDb
        .from('board_pins')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const pins = (pinRows || []) as unknown as BoardPin[];
      if (pins.length === 0) return [];

      const todoIds = pins.filter(p => p.ref_type === 'todo' || p.ref_type === 'maintenance').map(p => p.ref_id);
      const caseIds = pins.filter(p => p.ref_type === 'case').map(p => p.ref_id);
      const cycleIds = pins.filter(p => p.ref_type === 'annual_cycle_task').map(p => p.ref_id);

      const [todosRes, casesRes, cycleRes, profilesRes] = await Promise.all([
        todoIds.length
          ? supabase
              .from('todos')
              .select('id, title, due_date, follow_up_at, source_type, created_at, status, deleted_at, building:buildings(name)' as '*')
              .in('id', todoIds)
          : Promise.resolve({ data: [], error: null } as any),
        caseIds.length
          ? supabase
              .from('cases')
              .select('id, title, unit_number, created_at, status, building:buildings(name)')
              .in('id', caseIds)
          : Promise.resolve({ data: [], error: null } as any),
        cycleIds.length
          ? supabase
              .from('annual_cycle_tasks')
              .select('id, task_key, status, fiscal_year_start, building:buildings(name)')
              .in('id', cycleIds)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', Array.from(new Set(pins.map(p => p.user_id)))),
      ]);

      const todos = (todosRes.data || []) as any[];
      const cases = (casesRes.data || []) as any[];
      const cycles = (cycleRes.data || []) as any[];
      const profiles = (profilesRes.data || []) as ProfileLite[];

      // Fortschritt der Checklisten in einem Rutsch
      let subtaskByTodo = new Map<string, { done: number; total: number }>();
      if (todoIds.length) {
        const { data: subs } = await supabase
          .from('todo_subtasks')
          .select('todo_id, is_completed')
          .in('todo_id', todoIds);
        (subs || []).forEach((s: any) => {
          const cur = subtaskByTodo.get(s.todo_id) || { done: 0, total: 0 };
          cur.total += 1;
          if (s.is_completed) cur.done += 1;
          subtaskByTodo.set(s.todo_id, cur);
        });
      }

      const profileByUser = new Map(profiles.map(p => [p.user_id, p]));
      const todoById = new Map(todos.map(t => [t.id, t]));
      const caseById = new Map(cases.map(c => [c.id, c]));
      const cycleById = new Map(cycles.map(c => [c.id, c]));

      // Wer hat dieselbe Quelle sonst noch angeheftet?
      const pinsByRef = new Map<string, BoardPin[]>();
      pins.forEach(p => {
        const key = `${p.ref_type}:${p.ref_id}`;
        pinsByRef.set(key, [...(pinsByRef.get(key) || []), p]);
      });

      const items: BoardItem[] = [];

      for (const pin of pins) {
        let title: string | null = null;
        let context: string | null = null;
        let origin: BoardOrigin = 'ohne_termin';
        let dueDate: string | null = null;
        let followUpAt: string | null = null;
        let createdAt: string | null = null;
        let progress: { done: number; total: number } | null = null;

        if (pin.ref_type === 'todo' || pin.ref_type === 'maintenance') {
          const t = todoById.get(pin.ref_id);
          if (!t || t.deleted_at) continue;
          title = t.title;
          context = t.building?.name || null;
          origin = originOfTodo(t);
          dueDate = t.due_date;
          followUpAt = t.follow_up_at;
          createdAt = t.created_at;
          progress = subtaskByTodo.get(t.id) || null;
        } else if (pin.ref_type === 'case') {
          const c = caseById.get(pin.ref_id);
          if (!c) continue;
          title = c.title;
          context = [c.building?.name, c.unit_number ? `Whg. ${c.unit_number}` : null]
            .filter(Boolean)
            .join(' · ') || null;
          origin = 'vorgang';
          createdAt = c.created_at;
        } else if (pin.ref_type === 'annual_cycle_task') {
          const c = cycleById.get(pin.ref_id);
          if (!c) continue;
          title = c.task_key;
          context = c.building?.name || null;
          origin = 'jahreszyklus';
        }

        if (!title) continue;

        const others = (pinsByRef.get(`${pin.ref_type}:${pin.ref_id}`) || [])
          .filter(p => p.user_id !== pin.user_id)
          .map(p => {
            const prof = profileByUser.get(p.user_id);
            const name = [prof?.first_name, prof?.last_name].filter(Boolean).join(' ') || 'Unbekannt';
            return {
              userId: p.user_id,
              name,
              initials: initialsOf(prof?.first_name, prof?.last_name),
            };
          });

        items.push({
          refType: pin.ref_type,
          refId: pin.ref_id,
          title,
          context,
          origin,
          dueDate,
          followUpAt,
          createdAt,
          progress,
          pin,
          alsoOn: others,
        });
      }

      return items;
    },
  });
}

export interface SupplyColumn {
  key: string;
  label: string;
  items: BoardItem[];
}

/**
 * Der Vorrat. In Etappe 1 nur die beiden Todo-Spalten aus dem Plan:
 * "Frist läuft" und "Ohne Termin". Vorgänge, Jahreszyklus und Wartung
 * kommen in Etappe 3 und 4 dazu.
 *
 * Ausgeblendet wird, was auf der eigenen Wand schon hängt, was noch nicht
 * sichtbar sein soll (show_in_list_date) und was auf Wiedervorlage liegt.
 */
export function useBoardSupply() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['board-supply', user?.id, profile?.role],
    enabled: !!user?.id,
    queryFn: async (): Promise<SupplyColumn[]> => {
      const today = todayIso();

      const [{ data: todoRows, error }, { data: myPins }] = await Promise.all([
        supabase
          .from('todos')
          .select('id, title, due_date, follow_up_at, source_type, created_at, status, deleted_at, is_internal, show_in_list_date, building:buildings(name)' as '*')
          .neq('status', 'done')
          .is('deleted_at', null)
          .order('due_date', { ascending: true, nullsFirst: false }),
        boardDb
          .from('board_pins')
          .select('ref_type, ref_id')
          .eq('user_id', user!.id),
      ]);
      if (error) throw error;

      const mine = new Set(((myPins || []) as any[]).map(p => `${p.ref_type}:${p.ref_id}`));

      const visible = ((todoRows || []) as any[]).filter(t => {
        if (mine.has(`todo:${t.id}`)) return false;
        if (profile?.role === 'employee' && t.is_internal) return false;
        if (t.show_in_list_date && t.show_in_list_date > today) return false;
        if (t.follow_up_at && t.follow_up_at > today) return false;
        return true;
      });

      const toItem = (t: any): BoardItem => ({
        refType: 'todo',
        refId: t.id,
        title: t.title,
        context: t.building?.name || null,
        origin: originOfTodo(t),
        dueDate: t.due_date,
        followUpAt: t.follow_up_at,
        createdAt: t.created_at,
        progress: null,
        alsoOn: [],
      });

      const horizon = addDaysIso(14);

      const fristLaeuft = visible
        .filter(t => t.due_date && t.due_date <= horizon)
        .map(toItem);

      const ohneTermin = visible
        .filter(t => !t.due_date)
        .map(toItem);

      const demnaechst = visible
        .filter(t => t.due_date && t.due_date > horizon)
        .map(toItem);

      return [
        { key: 'frist', label: 'Frist läuft', items: fristLaeuft },
        { key: 'demnaechst', label: 'Demnächst', items: demnaechst },
        { key: 'ohne_termin', label: 'Ohne Termin', items: ohneTermin },
      ];
    },
  });
}

function invalidateBoard(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['board-pins'] });
  qc.invalidateQueries({ queryKey: ['board-supply'] });
}

/** Zettel an die eigene (oder eine fremde) Wand heften. */
export function usePinToWall() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      refType: BoardRefType;
      refId: string;
      /** Standard: die eigene Wand. */
      targetUserId?: string;
      note?: string;
    }) => {
      const targetUserId = input.targetUserId || user!.id;

      // Ganz nach oben: kleinster vorhandener sort_order minus 1.
      const { data: top } = await boardDb
        .from('board_pins')
        .select('sort_order')
        .eq('user_id', targetUserId)
        .eq('column_key', 'wall')
        .order('sort_order', { ascending: true })
        .limit(1);
      const nextSort = top && top.length ? Number((top[0] as any).sort_order) - 1 : 0;

      const { error } = await boardDb.from('board_pins').insert({
        user_id: targetUserId,
        ref_type: input.refType,
        ref_id: input.refId,
        column_key: 'wall',
        note: input.note ?? null,
        sort_order: nextSort,
        pinned_by: user?.id ?? null,
      });

      if (error) {
        // Unique-Constraint: hängt dort schon.
        if ((error as any).code === '23505') {
          throw new Error('Dieser Zettel hängt dort bereits.');
        }
        throw error;
      }
    },
    onSuccess: () => invalidateBoard(qc),
    onError: (e: any) =>
      toast({ title: 'Nicht angeheftet', description: e.message, variant: 'destructive' }),
  });
}

/** Zettel abnehmen. Die Aufgabe selbst bleibt bestehen. */
export function useUnpin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pinId: string) => {
      const { error } = await boardDb.from('board_pins').delete().eq('id', pinId);
      if (error) throw error;
    },
    onSuccess: () => invalidateBoard(qc),
    onError: (e: any) =>
      toast({ title: 'Konnte nicht abgenommen werden', description: e.message, variant: 'destructive' }),
  });
}

/**
 * Neue Reihenfolge nach dem Ziehen.
 * Gesetzt wird der Mittelwert der beiden Nachbarn — dadurch muss nur eine
 * einzige Zeile geschrieben werden, nicht die ganze Liste.
 */
export function useReorderPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pinId: string; before: number | null; after: number | null }) => {
      const { before, after } = input;
      let newSort: number;
      if (before === null && after === null) newSort = 0;
      else if (before === null) newSort = (after as number) - 1;
      else if (after === null) newSort = (before as number) + 1;
      else newSort = (before + after) / 2;

      const { error } = await boardDb
        .from('board_pins')
        .update({ sort_order: newSort })
        .eq('id', input.pinId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board-pins'] }),
  });
}

/** Erledigt: die Quelle wird geschlossen, der Zettel rutscht in die Spalte "done". */
export function useCompleteBoardItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: BoardItem) => {
      if (item.refType === 'todo' || item.refType === 'maintenance') {
        const { error } = await supabase
          .from('todos')
          .update({ status: 'done', completed_at: new Date().toISOString() } as any)
          .eq('id', item.refId);
        if (error) throw error;
      } else if (item.refType === 'case') {
        const { error } = await supabase
          .from('cases')
          .update({ status: 'resolved', closed_at: new Date().toISOString() } as any)
          .eq('id', item.refId);
        if (error) throw error;
      } else if (item.refType === 'annual_cycle_task') {
        const { error } = await supabase
          .from('annual_cycle_tasks')
          .update({ status: 'done', completed_at: new Date().toISOString() } as any)
          .eq('id', item.refId);
        if (error) throw error;
      }

      if (item.pin) {
        await boardDb
          .from('board_pins')
          .update({ column_key: 'done', done_at: new Date().toISOString() })
          .eq('id', item.pin.id);
      }
    },
    onSuccess: () => {
      invalidateBoard(qc);
      qc.invalidateQueries({ queryKey: ['todos'] });
    },
    onError: (e: any) =>
      toast({ title: 'Konnte nicht erledigt werden', description: e.message, variant: 'destructive' }),
  });
}

/** "Wartet auf" — der Zettel bleibt, rutscht aber in die Leiste unten. */
export function useSetWaiting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pinId: string; waitingFor: string | null }) => {
      const { error } = await boardDb
        .from('board_pins')
        .update({
          column_key: input.waitingFor ? 'waiting' : 'wall',
          waiting_for: input.waitingFor,
        })
        .eq('id', input.pinId);
      if (error) throw error;
    },
    onSuccess: () => invalidateBoard(qc),
  });
}

/** "+ Zettel schreiben" — legt eine Aufgabe an und hängt sie sofort auf. */
export function useCreateNote() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { title: string; buildingId?: string | null; dueDate?: string | null }) => {
      const { data: todo, error } = await supabase
        .from('todos')
        .insert({
          title: input.title,
          building_id: input.buildingId || null,
          due_date: input.dueDate || null,
          status: 'open',
          priority: 'medium',
          source_type: 'manual',
          created_by: user!.id,
          assigned_to: user!.id,
        } as any)
        .select('id')
        .single();
      if (error) throw error;

      const { data: top } = await boardDb
        .from('board_pins')
        .select('sort_order')
        .eq('user_id', user!.id)
        .eq('column_key', 'wall')
        .order('sort_order', { ascending: true })
        .limit(1);
      const nextSort = top && top.length ? Number((top[0] as any).sort_order) - 1 : 0;

      const { error: pinError } = await boardDb.from('board_pins').insert({
        user_id: user!.id,
        ref_type: 'todo',
        ref_id: (todo as any).id,
        column_key: 'wall',
        sort_order: nextSort,
        pinned_by: user!.id,
      });
      if (pinError) throw pinError;
    },
    onSuccess: () => {
      invalidateBoard(qc);
      qc.invalidateQueries({ queryKey: ['todos'] });
    },
    onError: (e: any) =>
      toast({ title: 'Zettel nicht angelegt', description: e.message, variant: 'destructive' }),
  });
}
