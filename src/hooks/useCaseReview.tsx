import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Die Durchsicht der Vorgänge.
 *
 * Entscheidung 7 und 8 des Umsetzungsplans: kein manueller Status, keine
 * Verantwortlichen. Der Zustand wird abgeleitet — aus den Tagen seit der
 * letzten Bewegung. Und statt zu sortieren wird gruppiert, damit niemand
 * einen Schwellenwert festlegen muss.
 *
 * case_overview steht noch nicht in der generierten types.ts; bis zum
 * nächsten `npm run db:types` reicht dieser enge Zugriff.
 */
const reviewDb = supabase as any;

export type SilenceBucket =
  | 'ueber_3_monate'
  | 'zwei_bis_drei_monate'
  | 'ein_bis_zwei_monate'
  | 'zwei_bis_vier_wochen'
  | 'in_bewegung';

export const BUCKET_LABEL: Record<SilenceBucket, string> = {
  ueber_3_monate: 'Über 3 Monate still',
  zwei_bis_drei_monate: '2 bis 3 Monate still',
  ein_bis_zwei_monate: '1 bis 2 Monate still',
  zwei_bis_vier_wochen: '2 bis 4 Wochen still',
  in_bewegung: 'In Bewegung',
};

export const BUCKET_DOT: Record<SilenceBucket, string> = {
  ueber_3_monate: 'bg-[#B4472B]',
  zwei_bis_drei_monate: 'bg-[#D98218]',
  ein_bis_zwei_monate: 'bg-[#E0A93C]',
  zwei_bis_vier_wochen: 'bg-[#B6B0A4]',
  in_bewegung: 'bg-[#6B8A55]',
};

/** Reihenfolge von „am längsten still" nach „braucht nichts". */
export const BUCKET_ORDER: SilenceBucket[] = [
  'ueber_3_monate',
  'zwei_bis_drei_monate',
  'ein_bis_zwei_monate',
  'zwei_bis_vier_wochen',
  'in_bewegung',
];

export interface CaseOverview {
  id: string;
  title: string;
  building_id: string | null;
  building_name: string | null;
  unit_number: string | null;
  category: string | null;
  status: string;
  priority: string | null;
  snooze_until: string | null;
  long_runner: boolean;
  created_at: string;
  last_movement_at: string;
  silent_days: number;
  /** 'in' | 'out' bei Mails, sonst der Ereignistyp (note, phone, document …). */
  last_kind: string;
  last_who: string | null;
  last_subject: string | null;
  on_a_wall: boolean;
  silence_bucket: SilenceBucket;
  /** Worum es geht — von der KI aus Titel, Beschreibung und Verlauf. */
  ai_summary: string | null;
  /** Was zuletzt passiert ist und woran es hängt. */
  ai_last_step: string | null;
  ai_summary_updated_at: string | null;
}

export const OFFENE_STATUS = ['open', 'in_progress', 'waiting_external', 'waiting_owner'];

export const STATUS_LABEL: Record<string, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting_external: 'Wartet auf extern',
  waiting_owner: 'Wartet auf Eigentümer',
  resolved: 'Erledigt',
  archived: 'Archiviert',
};

/**
 * Alle Vorgänge — auch erledigte und ruhende.
 *
 * Es sind gut hundert Zeilen; die holt man einmal und filtert danach im
 * Browser. Das macht die Suche sofort und erlaubt, auch einen längst
 * abgeschlossenen Vorgang wiederzufinden, ohne dafür neu zu laden.
 */
export function useCaseReview() {
  return useQuery({
    queryKey: ['case-review'],
    queryFn: async (): Promise<CaseOverview[]> => {
      const { data, error } = await reviewDb
        .from('case_overview')
        .select('*')
        .order('silent_days', { ascending: false });
      if (error) throw error;
      return (data || []) as CaseOverview[];
    },
  });
}

/** Der Normalfall der Durchsicht: offen und nicht ruhend. */
export function istInDurchsicht(c: CaseOverview, heute: string): boolean {
  if (!OFFENE_STATUS.includes(c.status)) return false;
  if (c.snooze_until && c.snooze_until > heute) return false;
  return true;
}

/** Die vier Kennzahlen über der Liste. */
export function useCaseReviewStats() {
  return useQuery({
    queryKey: ['case-review-stats'],
    queryFn: async () => {
      const heute = new Date().toISOString().slice(0, 10);

      const { data, error } = await reviewDb
        .from('case_overview')
        .select('silent_days, on_a_wall, snooze_until, status');
      if (error) throw error;

      const alle = (data || []) as Pick<
        CaseOverview,
        'silent_days' | 'on_a_wall' | 'snooze_until' | 'status'
      >[];
      const offen = alle.filter(c => OFFENE_STATUS.includes(c.status));
      const ruhend = offen.filter(c => c.snooze_until && c.snooze_until > heute);
      const sichtbar = offen.filter(c => !c.snooze_until || c.snooze_until <= heute);
      const laengerAlsMonat = sichtbar.filter(c => c.silent_days > 30);

      return {
        offen: offen.length,
        laengerAlsMonat: laengerAlsMonat.length,
        aufKeinerWand: laengerAlsMonat.filter(c => !c.on_a_wall).length,
        ruhend: ruhend.length,
      };
    },
  });
}

export interface ActivityWeek {
  week_start: string;
  cnt: number;
}

/** Aktivitätsstreifen für viele Vorgänge in einer einzigen Abfrage. */
export function useActivityWeeks(caseIds: string[]) {
  const schluessel = caseIds.slice().sort().join(',');

  return useQuery({
    queryKey: ['case-activity-weeks', schluessel],
    enabled: caseIds.length > 0,
    queryFn: async (): Promise<Map<string, number[]>> => {
      const { data, error } = await reviewDb.rpc('case_activity_weeks_bulk', {
        p_case_ids: caseIds,
      });
      if (error) throw error;

      const map = new Map<string, number[]>();
      ((data || []) as any[]).forEach(row => {
        const list = map.get(row.case_id) || [];
        list.push(row.cnt);
        map.set(row.case_id, list);
      });
      return map;
    },
  });
}

/** Verlauf eines einzelnen Vorgangs für die Akte. */
export function useCaseActivityWeeks(caseId: string | null) {
  return useQuery({
    queryKey: ['case-activity-week', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await reviewDb.rpc('case_activity_weeks', {
        p_case_id: caseId,
      });
      if (error) throw error;
      return ((data || []) as ActivityWeek[]).map(w => w.cnt);
    },
  });
}

/**
 * Ruhen lassen. Das einzige Feld, das am Vorgang von Hand gepflegt wird —
 * und auch das nur, um ihn für eine Weile aus der Durchsicht zu nehmen.
 */
export function useSnoozeCase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { caseId: string; bis: string | null }) => {
      const { error } = await supabase
        .from('cases')
        .update({ snooze_until: input.bis } as any)
        .eq('id', input.caseId);
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['case-review'] });
      qc.invalidateQueries({ queryKey: ['case-review-stats'] });
      qc.invalidateQueries({ queryKey: ['case-overview-one', input.caseId] });
      toast({
        title: input.bis ? 'Ruht bis später' : 'Ruht nicht mehr',
        description: input.bis
          ? 'Verschwindet so lange aus der Durchsicht und kommt dann von selbst zurück.'
          : undefined,
      });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht geändert', description: e.message, variant: 'destructive' }),
  });
}

/** Vorgang abschließen. */
export function useResolveCase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (caseId: string) => {
      const { error } = await supabase
        .from('cases')
        .update({ status: 'resolved', closed_at: new Date().toISOString() } as any)
        .eq('id', caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-review'] });
      qc.invalidateQueries({ queryKey: ['case-review-stats'] });
      qc.invalidateQueries({ queryKey: ['board-pins'] });
      toast({ title: 'Vorgang erledigt' });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht erledigt', description: e.message, variant: 'destructive' }),
  });
}

/** Ein einzelner Vorgang mit abgeleitetem Zustand, für die Akte. */
export function useCaseOverviewOne(caseId: string | null) {
  return useQuery({
    queryKey: ['case-overview-one', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<CaseOverview | null> => {
      const { data, error } = await reviewDb
        .from('case_overview')
        .select('*')
        .eq('id', caseId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CaseOverview) ?? null;
    },
  });
}
