import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Die Aufgaben, die an einem Vorgang hängen.
 *
 * Der Verlauf zeigt nur die erledigten — dort steht, was passiert ist. Hier
 * steht, was noch aussteht: erst damit sieht man, ob an einem stillen Vorgang
 * wirklich niemand arbeitet oder ob nur noch nichts fertig geworden ist.
 */

export interface CaseTodo {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'done';
  due_date: string | null;
  completed_at: string | null;
  /** An wessen Wand die Aufgabe hängt — leer heißt: an keiner. */
  waende: { name: string; initials: string }[];
}

function initialen(vorname?: string | null, nachname?: string | null) {
  return ((vorname?.[0] ?? '') + (nachname?.[0] ?? '')).toUpperCase() || '??';
}

export function useCaseTodos(caseId: string | null) {
  return useQuery({
    queryKey: ['case-todos', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<CaseTodo[]> => {
      const { data, error } = await (supabase as any)
        .from('todos')
        .select('id, title, status, due_date, completed_at')
        .eq('case_id', caseId!)
        .is('deleted_at', null)
        .order('status')
        .order('due_date', { nullsFirst: false });
      if (error) throw error;

      const rows = (data || []) as any[];
      if (rows.length === 0) return [];

      // An welchen Wänden hängen sie? Eine Abfrage für alle.
      const { data: pins } = await (supabase as any)
        .from('board_pins')
        .select('ref_id, user_id')
        .eq('ref_type', 'todo')
        .neq('column_key', 'done')
        .in('ref_id', rows.map(r => r.id));

      const userIds = Array.from(new Set(((pins || []) as any[]).map(p => p.user_id)));
      const { data: profs } = userIds.length
        ? await supabase
            .from('profiles')
            .select('user_id, first_name, last_name')
            .in('user_id', userIds)
        : { data: [] as any[] };

      const nachUser = new Map(((profs || []) as any[]).map(p => [p.user_id, p]));
      const nachTodo = new Map<string, { name: string; initials: string }[]>();
      ((pins || []) as any[]).forEach(p => {
        const prof = nachUser.get(p.user_id);
        const liste = nachTodo.get(p.ref_id) || [];
        liste.push({
          name: [prof?.first_name, prof?.last_name].filter(Boolean).join(' ') || 'Unbekannt',
          initials: initialen(prof?.first_name, prof?.last_name),
        });
        nachTodo.set(p.ref_id, liste);
      });

      return rows.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        due_date: r.due_date,
        completed_at: r.completed_at,
        waende: nachTodo.get(r.id) || [],
      }));
    },
  });
}
