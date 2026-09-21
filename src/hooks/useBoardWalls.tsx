import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { BoardRefType, initialsOf } from '@/hooks/useBoardPins';

/**
 * Wer alles im Haus eine Wand hat, und an welchen Wänden eine bestimmte
 * Karte hängt. Grundlage für "Hängt an diesen Wänden" und, ab Etappe 2,
 * für die Team-Ansicht.
 */

export interface WallPerson {
  userId: string;
  name: string;
  initials: string;
}

export interface WallPin extends WallPerson {
  pinId: string;
  pinnedAt: string;
  columnKey: string;
}

/** Alle Mitarbeiter und Admins — jede dieser Personen hat eine Wand. */
export function useWallPeople() {
  return useQuery({
    queryKey: ['wall-people'],
    queryFn: async (): Promise<WallPerson[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, role')
        .in('role', ['admin', 'employee'])
        .order('first_name');
      if (error) throw error;
      return ((data || []) as any[]).map(p => ({
        userId: p.user_id,
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unbenannt',
        initials: initialsOf(p.first_name, p.last_name),
      }));
    },
  });
}

/** An welchen Wänden hängt diese eine Karte? */
export function usePinsForRef(refType: BoardRefType, refId: string | null) {
  return useQuery({
    queryKey: ['pins-for-ref', refType, refId],
    enabled: !!refId,
    queryFn: async (): Promise<WallPin[]> => {
      const { data, error } = await supabase
        .from('board_pins')
        .select('id, user_id, pinned_at, column_key')
        .eq('ref_type', refType)
        .eq('ref_id', refId!);
      if (error) throw error;

      const rows = (data || []) as any[];
      if (rows.length === 0) return [];

      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', rows.map(r => r.user_id));

      const byUser = new Map(((profs || []) as any[]).map(p => [p.user_id, p]));

      return rows.map(r => {
        const p = byUser.get(r.user_id);
        return {
          pinId: r.id,
          userId: r.user_id,
          name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Unbekannt',
          initials: initialsOf(p?.first_name, p?.last_name),
          pinnedAt: r.pinned_at,
          columnKey: r.column_key,
        };
      });
    },
  });
}

/**
 * Eine Karte zusätzlich an der Wand einer anderen Person aufhängen.
 * Die Benachrichtigung dazu kommt in Etappe 2 mit dem Übergabe-Dialog —
 * hier wird sie ohne Meldung angeheftet ("still").
 */
export function usePinToOtherWall() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { refType: BoardRefType; refId: string; targetUserId: string }) => {
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
        ref_type: input.refType,
        ref_id: input.refId,
        column_key: 'wall',
        sort_order: nextSort,
        pinned_by: user?.id ?? null,
      });
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('Dort hängt der Zettel schon.');
        }
        throw error;
      }
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['pins-for-ref', input.refType, input.refId] });
      qc.invalidateQueries({ queryKey: ['board-pins'] });
      qc.invalidateQueries({ queryKey: ['board-supply'] });
      toast({ title: 'Aufgehängt' });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht aufgehängt', description: e.message, variant: 'destructive' }),
  });
}
