/**
 * Datenzugriff für die Heizkosten-Oberfläche
 * ==========================================
 *
 * Alle Abfragen an einer Stelle, damit die Komponenten nur noch anzeigen.
 * Der Rechenkern selbst liegt in `@/lib/heizkosten` und kennt die Datenbank
 * nicht.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Die Heizkostentabellen sind neu; die generierten Supabase-Typen kennen sie
// erst nach `npm run db:types`. Bis dahin derselbe Zugang wie in daten.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hk = (tabelle: string): any => (supabase as any).from(tabelle);

// ──────────────────────────────────────────────────────
// Typen der Oberfläche
// ──────────────────────────────────────────────────────

export interface AnlageZeile {
  id: string;
  building_id: string;
  name: string;
  provider: string | null;
  provider_property_no: string | null;
  energy_source: string;
  billing_area_m2: number | null;
  connected_hot_water: boolean;
  separation_method: 'wmz' | 'formel' | 'fest' | 'keine';
  heating_base_share: number;
  hotwater_base_share: number;
  ww_share_rounding: 'prozent2' | 'exakt';
  /** Umlageschlüssel für das Gemeinschaftseigentum, z. B. 'qm' oder 'einheit' */
  common_area_share_type: string | null;
  notes: string | null;
}

export interface ZuordnungZeile {
  id: string;
  heating_system_id: string;
  provider_user_no: string;
  provider_external_no: string | null;
  provider_user_name: string | null;
  provider_location: string | null;
  assignment_id: string | null;
  unit_number: string | null;
  /** Gemeinschaftseigentum — hat keinen Empfänger, wird auf alle umgelegt */
  is_common_area: boolean | null;
  common_area_m2: number | null;
  /** Abrechnungsfläche laut Messdienstleister */
  billing_area_m2: number | null;
  confidence: 'bestaetigt' | 'vorschlag' | 'unbestaetigt';
  matched_by: string | null;
}

export interface GeraetZeile {
  id: string;
  heating_system_id: string;
  mapping_id: string | null;
  device_no: string;
  device_type: 'hkv' | 'wmz' | 'wwz' | 'kwz' | 'fbh';
  device_type_raw: string | null;
  room: string | null;
  position: string | null;
  rating_factor: number | null;
  rating_factor_source: string | null;
  calibration_year: number | null;
  calibration_valid_until: string | null;
}

export interface AblesungZeile {
  id: string;
  device_id: string;
  period_from: string;
  period_to: string;
  previous_value: number | null;
  current_value: number | null;
  consumption: number | null;
  is_estimated: boolean;
  estimate_level: number | null;
  estimate_reason: string | null;
}

export interface EinheitDerApp {
  id: string;
  unit_number: string | null;
  name: string;
  qm: number | null;
}

/** Kurzstatus einer Anlage für die Übersichtsliste. */
export interface AnlageStatus extends AnlageZeile {
  gebaeude: string;
  nutzeinheiten: number;
  zugeordnet: number;
  bestaetigt: number;
  geraete: number;
  geraeteOhneFaktor: number;
  ablesungen: number;
  letzterLauf: { id: string; status: string; period_to: string } | null;
}

// ──────────────────────────────────────────────────────
// Abfragen
// ──────────────────────────────────────────────────────

/**
 * Die Anlagen der oben gewählten Liegenschaft, mit ihrem Bearbeitungsstand.
 *
 * Ohne Auswahl wird bewusst nichts geladen: die Heizkosten werden immer für
 * eine Liegenschaft gerechnet, eine Liste aller 22 Anlagen nebeneinander
 * verleitet nur dazu, in der falschen zu arbeiten.
 */
export function useAnlagenUebersicht(buildingId?: string | null) {
  return useQuery({
    queryKey: ['heizkosten-anlagen', buildingId ?? 'ohne'],
    enabled: !!buildingId,
    queryFn: async (): Promise<AnlageStatus[]> => {
      const { data: anlagen, error } = await hk('heating_systems')
        .select('*, buildings(name)')
        .eq('is_active', true)
        .eq('building_id', buildingId)
        .order('name');
      if (error) throw new Error(error.message);

      const rows = (anlagen ?? []) as (AnlageZeile & { buildings: { name: string } | null })[];
      if (rows.length === 0) return [];
      const ids = rows.map((a) => a.id);

      // Fehler der Teilabfragen nicht verschlucken: eine stumm leere
      // Geräteliste sieht in der Übersicht wie "kein Gerätestamm" aus.
      const pruefe = <T,>(name: string) => (r: { data: T[] | null; error: { message: string } | null }) => {
        if (r.error) throw new Error(`${name}: ${r.error.message}`);
        return r.data ?? [];
      };

      const [maps, devs, laeufe] = await Promise.all([
        hk('heating_user_mapping').select('heating_system_id, assignment_id, confidence')
          .in('heating_system_id', ids).then(pruefe('Zuordnungen')),
        hk('heating_devices').select('id, heating_system_id, device_type, rating_factor')
          .in('heating_system_id', ids).then(pruefe('Gerätestamm')),
        hk('heating_settlements').select('id, heating_system_id, status, period_to')
          .in('heating_system_id', ids).order('period_to', { ascending: false }).then(pruefe('Rechenläufe')),
      ]);

      const mapRows = maps as { heating_system_id: string; assignment_id: string | null; confidence: string }[];
      const devRows = devs as { id: string; heating_system_id: string; device_type: string; rating_factor: number | null }[];
      const laufRows = laeufe as { id: string; heating_system_id: string; status: string; period_to: string }[];

      // Ablesewerte nur zählen, nicht laden — die Liste braucht keine Details.
      // Gefiltert wird über die Anlage, nicht über die Geräteliste: bei mehreren
      // hundert Geräten würde die Abfrage sonst als überlange Adresse abgewiesen.
      const { data: ables } = devRows.length
        ? await hk('heating_readings')
            .select('device_id, heating_devices!inner(heating_system_id)')
            .in('heating_devices.heating_system_id', ids)
        : { data: [] };
      const ablesungJeGeraet = new Set(((ables ?? []) as { device_id: string }[]).map((a) => a.device_id));

      return rows.map((a) => {
        const m = mapRows.filter((x) => x.heating_system_id === a.id);
        const d = devRows.filter((x) => x.heating_system_id === a.id);
        return {
          ...a,
          gebaeude: a.buildings?.name ?? '',
          nutzeinheiten: m.length,
          zugeordnet: m.filter((x) => x.assignment_id).length,
          bestaetigt: m.filter((x) => x.confidence === 'bestaetigt').length,
          geraete: d.length,
          geraeteOhneFaktor: d.filter((x) => x.device_type === 'hkv' && (x.rating_factor == null || x.rating_factor <= 0)).length,
          ablesungen: d.filter((x) => ablesungJeGeraet.has(x.id)).length,
          letzterLauf: laufRows.find((l) => l.heating_system_id === a.id) ?? null,
        };
      });
    },
  });
}

/** Zuordnungen einer Anlage, zusammen mit den Einheiten des Gebäudes. */
export function useZuordnungen(anlage: AnlageZeile | null) {
  return useQuery({
    queryKey: ['heizkosten-zuordnung', anlage?.id],
    enabled: !!anlage,
    queryFn: async () => {
      const { data: maps, error } = await hk('heating_user_mapping')
        .select('*')
        .eq('heating_system_id', anlage!.id)
        .order('provider_user_no');
      if (error) throw new Error(error.message);

      const { data: assignments } = await supabase
        .from('contact_building_assignments')
        .select('id, unit_number, contacts(first_name, last_name, company_name), contact_building_shares(share_type, share_value)')
        .eq('building_id', anlage!.building_id)
        .eq('is_active', true)
        .in('role_in_building', ['eigentuemer', 'mieter'])
        .order('unit_number');

      type Roh = {
        id: string; unit_number: string | null;
        contacts: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
        contact_building_shares: { share_type: string; share_value: number }[] | null;
      };

      const einheiten: EinheitDerApp[] = ((assignments ?? []) as Roh[]).map((a) => ({
        id: a.id,
        unit_number: a.unit_number,
        name: a.contacts?.company_name
          ?? [a.contacts?.first_name, a.contacts?.last_name].filter(Boolean).join(' ')
          ?? '',
        qm: a.contact_building_shares?.find((s) => s.share_type === 'qm')?.share_value ?? null,
      }));

      return { zuordnungen: (maps ?? []) as ZuordnungZeile[], einheiten };
    },
  });
}

/**
 * Die Umlageschlüssel, die für dieses Gebäude zur Verfügung stehen.
 *
 * Es sind genau die Anteile, die in der App ohnehin schon je Person gepflegt
 * werden. Aufgeführt wird nur, wozu es auch Werte gibt — ein Schlüssel ohne
 * hinterlegte Anteile würde die Umlage stillschweigend auf die Fläche
 * zurückfallen lassen.
 */
export function useUmlageSchluessel(buildingId: string | null) {
  return useQuery({
    queryKey: ['heizkosten-umlageschluessel', buildingId],
    enabled: !!buildingId,
    queryFn: async (): Promise<{ wert: string; bezeichnung: string; anzahl: number }[]> => {
      const [{ data: arten }, { data: werte }] = await Promise.all([
        supabase.from('building_share_types').select('value, label').eq('building_id', buildingId!),
        supabase.from('contact_building_shares')
          .select('share_type, contact_building_assignments!inner(building_id)')
          .eq('contact_building_assignments.building_id', buildingId!),
      ]);

      const anzahl = new Map<string, number>();
      for (const w of (werte ?? []) as { share_type: string }[]) {
        anzahl.set(w.share_type, (anzahl.get(w.share_type) ?? 0) + 1);
      }
      const label = new Map((arten ?? []).map((a) => [a.value as string, a.label as string]));

      const liste = Array.from(anzahl.entries()).map(([wert, n]) => ({
        wert,
        bezeichnung: UMLAGE_LABEL[wert] ?? label.get(wert) ?? wert,
        anzahl: n,
      }));
      // Die Wohnfläche steht immer zur Wahl — sie ist der gesetzliche Regelfall.
      if (!liste.some((l) => l.wert === 'qm')) {
        liste.push({ wert: 'qm', bezeichnung: UMLAGE_LABEL.qm, anzahl: 0 });
      }
      return liste.sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, 'de'));
    },
  });
}

/** Gerätestamm und die Ablesewerte des Zeitraums. */
export function useGeraeteMitAblesung(
  anlageId: string | null,
  periodFrom: string,
  periodTo: string,
) {
  return useQuery({
    queryKey: ['heizkosten-geraete', anlageId, periodFrom, periodTo],
    enabled: !!anlageId,
    queryFn: async () => {
      const { data: devs, error } = await hk('heating_devices')
        .select('*')
        .eq('heating_system_id', anlageId)
        .order('device_no');
      if (error) throw new Error(error.message);
      const geraete = (devs ?? []) as GeraetZeile[];
      if (geraete.length === 0) return { geraete, ablesungen: [] as AblesungZeile[] };

      const { data: reads } = await hk('heating_readings')
        .select('*')
        .in('device_id', geraete.map((d) => d.id))
        .eq('period_from', periodFrom)
        .eq('period_to', periodTo);

      return { geraete, ablesungen: (reads ?? []) as AblesungZeile[] };
    },
  });
}

/** Die Rechenläufe einer Anlage, neuester zuerst. */
export function useRechenlaeufe(anlageId: string | null) {
  return useQuery({
    queryKey: ['heizkosten-laeufe', anlageId],
    enabled: !!anlageId,
    queryFn: async () => {
      const { data, error } = await hk('heating_settlements')
        .select('*')
        .eq('heating_system_id', anlageId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ──────────────────────────────────────────────────────
// Schreiben
// ──────────────────────────────────────────────────────

/** Eine Zuordnung setzen oder bestätigen. */
export async function speichereZuordnung(
  mappingId: string,
  assignmentId: string | null,
  unitNumber: string | null,
  bestaetigt: boolean,
) {
  const { error } = await hk('heating_user_mapping')
    .update({
      assignment_id: assignmentId,
      unit_number: unitNumber,
      confidence: bestaetigt ? 'bestaetigt' : (assignmentId ? 'vorschlag' : 'unbestaetigt'),
      matched_by: bestaetigt ? 'manuell' : undefined,
    })
    .eq('id', mappingId);
  if (error) throw new Error(error.message);
}

/** Den Umlageschlüssel für das Gemeinschaftseigentum einer Anlage setzen. */
export async function speichereUmlageSchluessel(anlageId: string, wert: string) {
  const { error } = await hk('heating_systems')
    .update({ common_area_share_type: wert })
    .eq('id', anlageId);
  if (error) throw new Error(error.message);
}

/** Ablesewerte eines Zeitraums speichern. */
export interface AblesungEingabe {
  deviceId: string;
  previous: number | null;
  current: number | null;
  isEstimated: boolean;
  estimateLevel: number | null;
  estimateReason: string | null;
}

export async function speichereAblesungen(
  werte: AblesungEingabe[],
  periodFrom: string,
  periodTo: string,
  quelle: 'manuell' | 'upload' | 'chat' | 'import' = 'manuell',
) {
  if (werte.length === 0) return;
  const rows = werte.map((w) => ({
    device_id: w.deviceId,
    period_from: periodFrom,
    period_to: periodTo,
    previous_value: w.previous,
    current_value: w.current,
    consumption: w.current != null && w.previous != null
      ? Number((w.current - w.previous).toFixed(3))
      : w.current,
    is_estimated: w.isEstimated,
    estimate_level: w.estimateLevel,
    estimate_reason: w.estimateReason,
    source: quelle,
  }));
  const { error } = await hk('heating_readings')
    .upsert(rows, { onConflict: 'device_id,period_from,period_to' });
  if (error) throw new Error(error.message);
}

/** Alle Abfragen einer Anlage neu laden. */
export function useHeizkostenAktualisieren() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['heizkosten-anlagen'] });
    qc.invalidateQueries({ queryKey: ['heizkosten-zuordnung'] });
    qc.invalidateQueries({ queryKey: ['heizkosten-geraete'] });
    qc.invalidateQueries({ queryKey: ['heizkosten-laeufe'] });
    // Die Jahresabrechnung liest aus heating_distribution_values.
    qc.invalidateQueries({ queryKey: ['heating-dist-values-settlement'] });
    qc.invalidateQueries({ queryKey: ['brunata-values'] });
  };
}

// ──────────────────────────────────────────────────────
// Anzeige-Hilfen
// ──────────────────────────────────────────────────────

/** Klartext für die verbreiteten Umlageschlüssel. */
export const UMLAGE_LABEL: Record<string, string> = {
  qm: 'Wohnfläche',
  einheit: 'Einheiten',
  mea: 'Miteigentumsanteil',
  personen: 'Personen',
  garagen: 'Garagen',
  stellplaetze: 'Stellplätze',
};

export const ENERGIE_LABEL: Record<string, string> = {
  oil: 'Heizöl',
  gas: 'Erdgas',
  pellets: 'Pellets',
  district_heating: 'Fernwärme',
  chp: 'Blockheizkraftwerk',
  wood: 'Holz',
  other: 'Sonstige',
};

export const GERAETEART_LABEL: Record<string, string> = {
  hkv: 'Heizkostenverteiler',
  wmz: 'Wärmezähler',
  wwz: 'Warmwasserzähler',
  kwz: 'Kaltwasserzähler',
  fbh: 'Fußbodenheizung',
};

export const GERAETEART_EINHEIT: Record<string, string> = {
  hkv: 'Einheiten',
  wmz: 'MWh',
  wwz: 'm³',
  kwz: 'm³',
  fbh: 'MWh',
};

export const eurFormat = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export const zahlFormat = (n: number | null | undefined, stellen = 3) =>
  n == null ? '—' : n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: stellen });
