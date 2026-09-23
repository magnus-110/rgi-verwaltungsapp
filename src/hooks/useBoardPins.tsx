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
  /**
   * Gesetzt, wenn der Eintrag nicht direkt angeheftet werden kann, sondern
   * auf einer eigenen Seite bearbeitet wird (Jahreszyklus).
   */
  linkTo?: string;
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

/** "WJ 2025" beim Kalenderjahr, sonst "WJ 2025/26". */
export function wirtschaftsjahr(start: string | null, ende: string | null): string {
  if (!start) return '';
  const a = new Date(start);
  if (Number.isNaN(a.getTime())) return '';
  const kalenderjahr = a.getMonth() === 0 && a.getDate() === 1;
  if (kalenderjahr) return `WJ ${a.getFullYear()}`;
  const b = ende ? new Date(ende) : null;
  const zweites = b && !Number.isNaN(b.getTime()) ? b.getFullYear() : a.getFullYear() + 1;
  return `WJ ${a.getFullYear()}/${String(zweites).slice(2)}`;
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
              .select('id, task_key, status, fiscal_year_start, fiscal_year_end, building:buildings(name)')
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

      // Die Klarnamen der Pflichten, damit auf dem Zettel nicht
      // "heizkostenabrechnung_beantragt" steht.
      const pflichtLabel = new Map<string, string>();
      if (cycles.length) {
        const { data: defs } = await (supabase as any)
          .from('annual_cycle_definitions')
          .select('task_key, label');
        ((defs || []) as any[]).forEach(d => pflichtLabel.set(d.task_key, d.label));
      }

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
          // Der Klarname der Pflicht, nicht ihr technischer Schluessel.
          title = pflichtLabel.get(c.task_key) || c.task_key;
          context = [c.building?.name, wirtschaftsjahr(c.fiscal_year_start, c.fiscal_year_end)]
            .filter(Boolean)
            .join(' · ') || null;
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
 * Der Vorrat.
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

      const [{ data: todoRows, error }, { data: myPins }, { data: caseRows }, { data: cycleRows }] = await Promise.all([
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
        // Vorgaenge, die laenger als zwei Wochen still sind und an keiner
        // Wand haengen - genau die Arbeitsliste aus der Durchsicht.
        (supabase as any)
          .from('case_overview')
          .select('id, title, building_name, unit_number, silent_days, on_a_wall, status, snooze_until, created_at')
          .in('status', ['open', 'in_progress', 'waiting_external', 'waiting_owner'])
          .gt('silent_days', 14)
          .eq('on_a_wall', false)
          .order('silent_days', { ascending: false }),
        // Jahreszyklus: je Gebaeude ein Eintrag mit der Zahl der offenen
        // Pflichten — aber nur aus Wirtschaftsjahren, die schon vorbei sind.
        // Einen Jahresabschluss kann man nicht fertigstellen, solange das
        // Jahr noch laeuft; alles andere waere hier nur Rauschen.
        //
        // Angeheftet wird nicht hier, sondern in der Matrix: dort sieht man,
        // welche Pflicht in welchem Jahr gemeint ist.
        (supabase as any)
          .from('annual_cycle_open')
          .select('id, task_key, building_id, building_name, fiscal_year_end, on_a_wall')
          .eq('on_a_wall', false)
          .lt('fiscal_year_end', today),
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

      const vorgaenge: BoardItem[] = ((caseRows || []) as any[])
        .filter(c => !mine.has(`case:${c.id}`))
        .filter(c => !c.snooze_until || c.snooze_until <= today)
        .map(c => ({
          refType: 'case' as const,
          refId: c.id,
          title: c.title,
          context:
            [c.building_name, c.unit_number ? `Whg. ${c.unit_number}` : null]
              .filter(Boolean)
              .join(' · ') || `seit ${c.silent_days} Tagen still`,
          origin: 'vorgang' as const,
          dueDate: null,
          followUpAt: null,
          createdAt: c.created_at ?? null,
          progress: null,
          alsoOn: [],
        }));

      // Jahreszyklus je Gebaeude: alle fuenfzehn Pflichten sind
      // Gebaeudepflichten. Ein Haus mit sieben offenen Punkten ist EIN
      // Eintrag; welche Pflicht gemeint ist, entscheidet man in der Matrix.
      const jeGebaeude = new Map<string, { name: string; anzahl: number }>();
      ((cycleRows || []) as any[]).forEach(r => {
        if (!r.building_id) return;
        const vorhanden = jeGebaeude.get(r.building_id);
        if (vorhanden) vorhanden.anzahl += 1;
        else jeGebaeude.set(r.building_id, { name: r.building_name || 'Gebäude', anzahl: 1 });
      });

      const jahreszyklus: BoardItem[] = Array.from(jeGebaeude.entries())
        .sort((a, b) => a[1].name.localeCompare(b[1].name, 'de'))
        .map(([buildingId, v]) => ({
          refType: 'annual_cycle_task' as const,
          refId: buildingId,
          title: v.name,
          context: `${v.anzahl} ${v.anzahl === 1 ? 'Pflicht offen' : 'Pflichten offen'}`,
          origin: 'jahreszyklus' as const,
          dueDate: null,
          followUpAt: null,
          createdAt: null,
          progress: null,
          alsoOn: [],
          linkTo: '/jahreszyklus',
        }));

      return [
        { key: 'frist', label: 'Frist läuft', items: fristLaeuft },
        { key: 'demnaechst', label: 'Demnächst', items: demnaechst },
        { key: 'ohne_termin', label: 'Ohne Termin', items: ohneTermin },
        { key: 'vorgaenge', label: 'Vorgänge', items: vorgaenge },
        { key: 'jahreszyklus', label: 'Jahresabschluss', items: jahreszyklus },
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
      qc.invalidateQueries({ queryKey: ['case-review'] });
      qc.invalidateQueries({ queryKey: ['cycle-tasks'] });
      qc.invalidateQueries({ queryKey: ['cycle-pins'] });
    },
    onError: (e: any) =>
      toast({ title: 'Konnte nicht erledigt werden', description: e.message, variant: 'destructive' }),
  });
}

/**
 * Erledigt von der Zettel-Seite aus.
 *
 * Drei Dinge auf einmal, weil sie zusammengehören: die Aufgabe wird auf
 * erledigt gesetzt, der Zettel verschwindet von allen Wänden, an denen er
 * hängt, und die Seite schließt sich. Sonst bliebe eine abgehakte Aufgabe
 * bei Kollegen hängen, die nie erfahren, dass sie erledigt ist.
 *
 * Die Anheftungen werden nicht gelöscht, sondern in die Spalte "done"
 * gesetzt — die Wand zeigt sie nicht mehr, aber es bleibt nachvollziehbar,
 * wer den Zettel hatte.
 */
export function useCompleteNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (todoId: string) => {
      const { error } = await supabase
        .from('todos')
        .update({ status: 'done', completed_at: new Date().toISOString() } as any)
        .eq('id', todoId);
      if (error) throw error;

      const { error: pinError } = await boardDb
        .from('board_pins')
        .update({ column_key: 'done', done_at: new Date().toISOString() })
        .eq('ref_type', 'todo')
        .eq('ref_id', todoId)
        .neq('column_key', 'done');
      if (pinError) throw pinError;
    },
    onSuccess: (_d, todoId) => {
      invalidateBoard(qc);
      qc.invalidateQueries({ queryKey: ['todos'] });
      qc.invalidateQueries({ queryKey: ['todo', todoId] });
      toast({ title: 'Erledigt', description: 'Der Zettel ist von der Wand.' });
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
