import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { BoardItem } from '@/hooks/useBoardPins';
import { createNotification } from '@/hooks/useNotifications';

/**
 * Übergeben = die Aufgabe auf die Wand einer anderen Person ziehen.
 *
 * Entscheidung 5 des Umsetzungsplans: Das ist das Zuweisen. Es gibt kein
 * Feld "Verantwortlicher", das jemand pflegen müsste — Zuständigkeit
 * entsteht dadurch, dass die Aufgabe an einer Wand hängt.
 *
 * Die Benachrichtigung schreibt die App, nicht die Datenbank: nur hier ist
 * bekannt, ob "still hinlegen" angehakt war.
 */

export interface HandoverInput {
  item: BoardItem;
  targetUserId: string;
  targetName: string;
  note?: string | null;
  /** true = ohne Meldung. Die Aufgabe liegt da, aber es klingelt nichts. */
  silent?: boolean;
}

export function useHandoverPin() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (input: HandoverInput) => {
      const pin = input.item.pin;
      if (!pin) throw new Error('Diese Aufgabe hängt an keiner Wand.');
      if (pin.user_id === input.targetUserId) return { zurueckgegeben: false };

      // Ganz nach oben auf die Zielwand.
      const { data: top } = await supabase
        .from('board_pins')
        .select('sort_order')
        .eq('user_id', input.targetUserId)
        .eq('column_key', 'wall')
        .order('sort_order', { ascending: true })
        .limit(1);
      const nextSort = top && top.length ? Number((top[0] as any).sort_order) - 1 : 0;

      // Umhängen statt neu anlegen: Notiz, Wartestatus und Verlauf bleiben.
      const { error } = await supabase
        .from('board_pins')
        .update({
          user_id: input.targetUserId,
          column_key: 'wall',
          sort_order: nextSort,
          note: input.note ?? pin.note,
          pinned_at: new Date().toISOString(),
          pinned_by: user?.id ?? null,
        })
        .eq('id', pin.id);

      if (error) {
        if ((error as any).code === '23505') {
          throw new Error(`Bei ${input.targetName} hängt diese Aufgabe schon.`);
        }
        throw error;
      }

      // Zurückgelegt = der Empfänger ist der, der ihn mir hingelegt hat.
      const zurueckgegeben = pin.pinned_by === input.targetUserId && pin.user_id === user?.id;

      const absender = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Jemand';

      await createNotification({
        userId: input.targetUserId,
        actorUserId: user?.id ?? null,
        type: zurueckgegeben ? 'pin_returned' : 'pin_assigned',
        title: zurueckgegeben
          ? `${absender} hat dir zurückgelegt: ${input.item.title}`
          : `${absender} hat dir eine Aufgabe hingelegt: ${input.item.title}`,
        body: input.note?.trim() || null,
        url:
          input.item.refType === 'todo' || input.item.refType === 'maintenance'
            ? `/pinnwand/${input.item.refId}`
            : '/pinnwand',
        refType: input.item.refType,
        refId: input.item.refId,
        silent: input.silent,
      });

      return { zurueckgegeben };
    },
    onSuccess: (res, input) => {
      qc.invalidateQueries({ queryKey: ['board-pins'] });
      qc.invalidateQueries({ queryKey: ['board-supply'] });
      qc.invalidateQueries({ queryKey: ['pins-for-ref'] });
      toast({
        title: res?.zurueckgegeben ? 'Zurückgelegt' : `Bei ${input.targetName} hingelegt`,
        description: input.silent ? 'Ohne Meldung — die Aufgabe liegt einfach da.' : undefined,
      });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht übergeben', description: e.message, variant: 'destructive' }),
  });
}

/**
 * Zusätzlich aufhängen, ohne wegzunehmen — die Aufgabe hängt dann an zwei
 * Wänden. Anders als beim Übergeben behält der Absender ihn.
 */
export function useAlsoPinToWall() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (input: HandoverInput) => {
      const { data: top } = await supabase
        .from('board_pins')
        .select('sort_order')
        .eq('user_id', input.targetUserId)
        .eq('column_key', 'wall')
        .order('sort_order', { ascending: true })
        .limit(1);
      const nextSort = top && top.length ? Number((top[0] as any).sort_order) - 1 : 0;

      const { error } = await supabase.from('board_pins').insert({
        user_id: input.targetUserId,
        ref_type: input.item.refType,
        ref_id: input.item.refId,
        column_key: 'wall',
        note: input.note ?? null,
        sort_order: nextSort,
        pinned_by: user?.id ?? null,
      });

      if (error) {
        if ((error as any).code === '23505') {
          throw new Error(`Bei ${input.targetName} hängt diese Aufgabe schon.`);
        }
        throw error;
      }

      const absender = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Jemand';

      await createNotification({
        userId: input.targetUserId,
        actorUserId: user?.id ?? null,
        type: 'pin_assigned',
        title: `${absender} hat dir eine Aufgabe hingelegt: ${input.item.title}`,
        body: input.note?.trim() || null,
        url:
          input.item.refType === 'todo' || input.item.refType === 'maintenance'
            ? `/pinnwand/${input.item.refId}`
            : '/pinnwand',
        refType: input.item.refType,
        refId: input.item.refId,
        silent: input.silent,
      });
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['board-pins'] });
      qc.invalidateQueries({ queryKey: ['pins-for-ref'] });
      toast({ title: `Auch bei ${input.targetName} aufgehängt` });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht aufgehängt', description: e.message, variant: 'destructive' }),
  });
}
