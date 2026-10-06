import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { boardDb } from '@/integrations/supabase/board';
import { toast } from '@/hooks/use-toast';
import type { BoardItem } from '@/hooks/useBoardPins';

/**
 * Eine erledigte Aufgabe zurück an die Wand holen.
 *
 * Zwei Dinge gehören zusammen: Die Quelle wird wieder geöffnet (sonst hinge
 * eine abgehakte Aufgabe an der Wand) und die eigene Anheftung wandert aus der
 * Spalte "done" zurück ganz nach vorne auf die Wand. Die Anheftungen der
 * Kollegen bleiben, wo sie sind.
 */
export function useRestoreBoardItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (item: BoardItem) => {
      if (!item.pin) throw new Error('Diese Aufgabe hängt an keiner Wand.');

      if (item.refType === 'todo' || item.refType === 'maintenance') {
        const { error } = await supabase
          .from('todos')
          .update({ status: 'open', completed_at: null } as any)
          .eq('id', item.refId);
        if (error) throw error;
      } else if (item.refType === 'case') {
        const { error } = await supabase
          .from('cases')
          .update({ status: 'in_progress', closed_at: null } as any)
          .eq('id', item.refId);
        if (error) throw error;
      } else if (item.refType === 'annual_cycle_task') {
        const { error } = await supabase
          .from('annual_cycle_tasks')
          .update({ status: 'open', completed_at: null } as any)
          .eq('id', item.refId);
        if (error) throw error;
      }

      // Ganz nach vorne: kleinster vorhandener sort_order minus 1.
      const { data: top } = await boardDb
        .from('board_pins')
        .select('sort_order')
        .eq('user_id', item.pin.user_id)
        .eq('column_key', 'wall')
        .order('sort_order', { ascending: true })
        .limit(1);
      const nextSort = top && top.length ? Number((top[0] as any).sort_order) - 1 : 0;

      const { error: pinError } = await boardDb
        .from('board_pins')
        .update({ column_key: 'wall', done_at: null, waiting_for: null, sort_order: nextSort })
        .eq('id', item.pin.id);
      if (pinError) throw pinError;
    },
    onSuccess: (_d, item) => {
      qc.invalidateQueries({ queryKey: ['board-pins'] });
      qc.invalidateQueries({ queryKey: ['board-supply'] });
      qc.invalidateQueries({ queryKey: ['todos'] });
      qc.invalidateQueries({ queryKey: ['todo', item.refId] });
      qc.invalidateQueries({ queryKey: ['cycle-tasks'] });
      qc.invalidateQueries({ queryKey: ['cycle-pins'] });
      qc.invalidateQueries({ queryKey: ['case-todos'] });
      qc.invalidateQueries({ queryKey: ['case-overview-one'] });
      toast({ title: 'Zurückgeholt', description: `„${item.title}" hängt wieder an deiner Wand.` });
    },
    onError: (e: any) =>
      toast({ title: 'Konnte nicht zurückgeholt werden', description: e.message, variant: 'destructive' }),
  });
}
