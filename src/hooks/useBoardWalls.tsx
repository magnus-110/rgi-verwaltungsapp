import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

/**
 * Wessen Wand will ich nicht sehen?
 *
 * Rein persönlich und rein eine Frage der Ansicht: die Wand der Person bleibt,
 * wie sie ist, sie taucht nur in der eigenen Team-Übersicht nicht mehr auf.
 * Niemand sonst sieht, wen man ausgeblendet hat.
 */
export function useHiddenWalls(userId: string | undefined) {
  return useQuery({
    queryKey: ['hidden-walls', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from('board_hidden_walls')
        .select('hidden_user_id')
        .eq('user_id', userId!);
      if (error) throw error;
      return new Set(((data || []) as any[]).map(r => r.hidden_user_id as string));
    },
  });
}

/** Eine Wand ausblenden oder wieder einblenden. */
export function useToggleHiddenWall() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      userId: string;
      hiddenUserId: string;
      /** true = ausblenden, false = wieder einblenden. */
      ausblenden: boolean;
      name: string;
    }) => {
      if (input.ausblenden) {
        const { error } = await (supabase as any)
          .from('board_hidden_walls')
          .insert({ user_id: input.userId, hidden_user_id: input.hiddenUserId });
        // 23505 = haengt schon drin; dann ist das Ziel ja bereits erreicht.
        if (error && (error as any).code !== '23505') throw error;
      } else {
        const { error } = await (supabase as any)
          .from('board_hidden_walls')
          .delete()
          .eq('user_id', input.userId)
          .eq('hidden_user_id', input.hiddenUserId);
        if (error) throw error;
      }
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['hidden-walls'] });
      toast({
        title: input.ausblenden ? 'Ausgeblendet' : 'Wieder da',
        description: input.ausblenden
          ? `${input.name} siehst du in der Team-Ansicht nicht mehr.`
          : `${input.name} ist wieder in der Team-Ansicht.`,
      });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht geändert', description: e.message, variant: 'destructive' }),
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
