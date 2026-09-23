import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { initialsOf } from '@/hooks/useBoardPins';

/**
 * Der Verlauf einer Aufgabe — ein Strang statt zwei.
 *
 * Bisher standen Kommentare an einer Stelle und die Ereignisse nirgends. Wer
 * eine Aufgabe öffnet, will aber in fünf Sekunden sehen, was zuletzt passiert
 * ist: wer sie geschrieben hat, wer sie wem hingelegt hat, was abgehakt wurde
 * und was dazu gesagt wurde. Deshalb wird das hier zusammengeführt.
 *
 * Es gibt keine Ereignistabelle für Aufgaben, und es braucht auch keine: alle
 * Angaben stehen schon in den Zeilen selbst — wann ein Punkt abgehakt wurde,
 * wann jemand die Aufgabe aufgehängt hat. Sie werden nur eingesammelt.
 */

export type VerlaufArt = 'angelegt' | 'aufgehaengt' | 'abgehakt' | 'kommentar' | 'erledigt';

export interface VerlaufEintrag {
  key: string;
  art: VerlaufArt;
  /** Wann es passiert ist. */
  zeitpunkt: string;
  /** Wer es getan hat. */
  name: string;
  initials: string;
  /** Der Satz, der im Verlauf steht — ohne den Namen davor. */
  text: string;
  /** Freitext (nur bei Kommentaren). */
  body?: string | null;
}

interface Person {
  name: string;
  initials: string;
}

const UNBEKANNT: Person = { name: 'Unbekannt', initials: '??' };

export function useTodoVerlauf(todoId: string | null) {
  return useQuery({
    queryKey: ['todo-verlauf', todoId],
    enabled: !!todoId,
    queryFn: async (): Promise<VerlaufEintrag[]> => {
      const [{ data: todo }, { data: kommentare }, { data: punkte }, { data: pins }] =
        await Promise.all([
          supabase
            .from('todos')
            .select('id, created_at, created_by, completed_at, status')
            .eq('id', todoId!)
            .maybeSingle(),
          supabase
            .from('todo_comments')
            .select('id, content, created_by, created_at')
            .eq('todo_id', todoId!),
          (supabase as any)
            .from('todo_subtasks')
            .select('id, title, is_completed, completed_at, completed_by')
            .eq('todo_id', todoId!),
          (supabase as any)
            .from('board_pins')
            .select('id, user_id, pinned_by, pinned_at')
            .eq('ref_type', 'todo')
            .eq('ref_id', todoId!),
        ]);

      const t = todo as any;

      // Alle vorkommenden Personen in einer Abfrage.
      const ids = new Set<string>();
      if (t?.created_by) ids.add(t.created_by);
      ((kommentare || []) as any[]).forEach(k => k.created_by && ids.add(k.created_by));
      ((punkte || []) as any[]).forEach(p => p.completed_by && ids.add(p.completed_by));
      ((pins || []) as any[]).forEach(p => {
        if (p.user_id) ids.add(p.user_id);
        if (p.pinned_by) ids.add(p.pinned_by);
      });

      const { data: profs } = ids.size
        ? await supabase
            .from('profiles')
            .select('user_id, first_name, last_name')
            .in('user_id', Array.from(ids))
        : { data: [] as any[] };

      const leute = new Map<string, Person>(
        ((profs || []) as any[]).map(p => [
          p.user_id,
          {
            name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unbenannt',
            initials: initialsOf(p.first_name, p.last_name),
          },
        ])
      );
      const wer = (id: string | null | undefined) => (id ? leute.get(id) ?? UNBEKANNT : UNBEKANNT);

      const eintraege: VerlaufEintrag[] = [];

      if (t?.created_at) {
        const p = wer(t.created_by);
        eintraege.push({
          key: `angelegt:${t.id}`,
          art: 'angelegt',
          zeitpunkt: t.created_at,
          name: p.name,
          initials: p.initials,
          text: 'hat die Aufgabe geschrieben',
        });
      }

      ((pins || []) as any[]).forEach(pin => {
        // Sich selbst etwas hinzulegen ist kein Ereignis, das erzählt werden muss.
        if (pin.pinned_by === pin.user_id) return;
        const von = wer(pin.pinned_by);
        const an = wer(pin.user_id);
        eintraege.push({
          key: `pin:${pin.id}`,
          art: 'aufgehaengt',
          zeitpunkt: pin.pinned_at,
          name: von.name,
          initials: von.initials,
          text: `hat sie ${an.name.split(' ')[0]} hingelegt`,
        });
      });

      ((punkte || []) as any[]).forEach(punkt => {
        if (!punkt.is_completed || !punkt.completed_at) return;
        const p = wer(punkt.completed_by);
        eintraege.push({
          key: `punkt:${punkt.id}`,
          art: 'abgehakt',
          zeitpunkt: punkt.completed_at,
          name: p.name,
          initials: p.initials,
          text: `hat „${punkt.title}" abgehakt`,
        });
      });

      ((kommentare || []) as any[]).forEach(k => {
        const p = wer(k.created_by);
        eintraege.push({
          key: `kommentar:${k.id}`,
          art: 'kommentar',
          zeitpunkt: k.created_at,
          name: p.name,
          initials: p.initials,
          text: '',
          body: k.content,
        });
      });

      if (t?.status === 'done' && t?.completed_at) {
        eintraege.push({
          key: `erledigt:${t.id}`,
          art: 'erledigt',
          zeitpunkt: t.completed_at,
          name: '',
          initials: '✓',
          text: 'Aufgabe erledigt',
        });
      }

      return eintraege.sort(
        (a, b) => new Date(b.zeitpunkt).getTime() - new Date(a.zeitpunkt).getTime()
      );
    },
  });
}
