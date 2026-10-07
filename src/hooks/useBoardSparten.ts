import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { boardDb, type BoardSparteRow } from '@/integrations/supabase/board';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

/**
 * Sparten der Pinnwand — z. B. „Offene Posten", „Nebenkosten", „Allgemein".
 *
 * Jede Person hat ihre eigenen Sparten; sie gliedern nur die eigene Wand.
 * Die Sparte haengt an der Karte (board_pins.sparte_id), nicht an der Aufgabe.
 * Wird eine Sparte geloescht, rutschen ihre Karten nach „Ohne Sparte".
 */

export type BoardSparte = BoardSparteRow;

/** Farben zur Auswahl. Schluessel wird gespeichert, Klassen nur hier. */
export const SPARTEN_FARBEN: { key: string; label: string; dot: string }[] = [
  { key: 'stein', label: 'Grau', dot: 'bg-[#8a8478]' },
  { key: 'orange', label: 'Orange', dot: 'bg-[#ee7202]' },
  { key: 'rot', label: 'Rot', dot: 'bg-[#b4472b]' },
  { key: 'gruen', label: 'Grün', dot: 'bg-[#6b8a55]' },
  { key: 'blau', label: 'Blau', dot: 'bg-[#5b7fa6]' },
  { key: 'lila', label: 'Lila', dot: 'bg-[#7a6fa0]' },
  { key: 'gelb', label: 'Gelb', dot: 'bg-[#d4a017]' },
  { key: 'tuerkis', label: 'Türkis', dot: 'bg-[#3d8a8a]' },
];

export function sparteDot(color: string | null | undefined): string {
  return SPARTEN_FARBEN.find(f => f.key === color)?.dot ?? SPARTEN_FARBEN[0].dot;
}

const KEY = ['board-sparten'];

export function useBoardSparten() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...KEY, user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<BoardSparte[]> => {
      const { data, error } = await boardDb
        .from('board_sparten')
        .select('*')
        .eq('user_id', user!.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BoardSparte[];
    },
  });
}

function fehler(titel: string) {
  return (e: any) => toast({ title: titel, description: e?.message, variant: 'destructive' });
}

export function useCreateSparte() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; color: string }): Promise<BoardSparte> => {
      // Neue Sparten kommen ans Ende.
      const { data: letzte } = await boardDb
        .from('board_sparten')
        .select('sort_order')
        .eq('user_id', user!.id)
        .order('sort_order', { ascending: false })
        .limit(1);
      const sort = letzte && letzte.length ? Number((letzte[0] as any).sort_order) + 1 : 0;

      const { data, error } = await boardDb
        .from('board_sparten')
        .insert({ user_id: user!.id, name: input.name.trim(), color: input.color, sort_order: sort })
        .select('*')
        .single();
      if (error) throw error;
      return data as BoardSparte;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: fehler('Sparte nicht angelegt'),
  });
}

export function useUpdateSparte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string; sort_order?: number }) => {
      const patch: Partial<BoardSparte> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.color !== undefined) patch.color = input.color;
      if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
      const { error } = await boardDb.from('board_sparten').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: fehler('Sparte nicht gespeichert'),
  });
}

export function useDeleteSparte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await boardDb.from('board_sparten').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Karten dieser Sparte stehen jetzt ohne Sparte da.
      qc.invalidateQueries({ queryKey: ['board-pins'] });
    },
    onError: fehler('Sparte nicht gelöscht'),
  });
}

/** Sparte einer Karte auf der eigenen Wand (null = ohne Sparte). */
export function sparteIdVon(pin: object | null | undefined): string | null {
  return (pin as { sparte_id?: string | null } | null | undefined)?.sparte_id ?? null;
}

/**
 * Karte in eine Sparte legen. Mit `sortOrder` landet sie gleichzeitig an
 * dieser Stelle der Reihenfolge.
 */
export function useSetPinSparte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pinId: string; sparteId: string | null; sortOrder?: number }) => {
      const patch: { sparte_id: string | null; sort_order?: number } = { sparte_id: input.sparteId };
      if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
      const { error } = await boardDb.from('board_pins').update(patch).eq('id', input.pinId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board-pins'] }),
    onError: fehler('Sparte nicht geändert'),
  });
}

/**
 * Frisch angeheftete Aufgabe auf der eigenen Wand in eine Sparte legen —
 * nach dem Ziehen aus dem Vorrat oder nach dem Schreiben in einem Abschnitt.
 */
export function useSetRefSparte() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { refId: string; sparteId: string | null }) => {
      const { error } = await boardDb
        .from('board_pins')
        .update({ sparte_id: input.sparteId })
        .eq('user_id', user!.id)
        .eq('ref_id', input.refId)
        .eq('column_key', 'wall');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board-pins'] }),
    onError: fehler('Sparte nicht gesetzt'),
  });
}
