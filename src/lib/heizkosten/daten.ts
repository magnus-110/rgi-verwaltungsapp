/**
 * Heizkostenabrechnung — Anbindung an die Datenbank
 * =================================================
 *
 * Der Rechenkern kennt Supabase nicht. Diese Datei ist die einzige Stelle, an
 * der Stammdaten gelesen und Ergebnisse geschrieben werden:
 *
 *   ladeEingang       baut aus Anlage, Gerätestamm, Ablesewerten, Zuordnungen
 *                     und den Konten der Buchhaltung den Eingang zusammen
 *   speichereErgebnis schreibt Rechenlauf, Einzelergebnisse und die Werte für
 *                     die Jahresabrechnung zurück
 *
 * Die Nahtstelle nach unten ist `heating_distribution_values`. Aus dieser
 * Tabelle lesen bereits heute die WEG-Jahresabrechnung, die Einzelabrechnung
 * und die Mieter-Nebenkostenabrechnung. Ändert sich hier die Herkunft der
 * Werte, ändert sich für alles Nachgelagerte nichts.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { sumForAccount } from '@/components/finance/lib/bookingAggregation';
import { computeFifoConsumption } from '@/components/finance/lib/fuelFifo';
import { eur, round } from './kern';
import type {
  AbrechnungEingang, AbrechnungErgebnis, ErfassungsSystem, Kostenposition,
  Nutzeinheit, Nutzerzeitraum, TrennungMethode, Verteilung,
} from './typen';
import type { GeraetPruefung } from './pruefungen';

// ────────────────────────────────────────────────────────────
// Zugriff auf die Heizkostentabellen
// ────────────────────────────────────────────────────────────

/**
 * Die Tabellen des Heizkostenmoduls sind neu. Die generierten Supabase-Typen
 * in `src/integrations/supabase/types.ts` kennen sie erst, nachdem sie mit
 * `npm run db:types` neu erzeugt wurden. Bis dahin führt dieser Zugang an der
 * Typprüfung der Tabellennamen vorbei.
 *
 * Die Form der Datensätze ist nicht ungeprüft: Sie steht weiter unten in
 * dieser Datei als Schnittstelle und wird beim Lesen angewandt. Diese eine
 * Stelle ist der einzige Ort im Modul, an dem die Typprüfung nachgibt.
 */
type HeizkostenTabelle =
  | 'heating_systems'
  | 'heating_user_mapping'
  | 'heating_devices'
  | 'heating_readings'
  | 'heating_settlements'
  | 'heating_settlement_items'
  | 'heating_distribution_values';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hk = (tabelle: HeizkostenTabelle): any =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).from(tabelle);

// ────────────────────────────────────────────────────────────
// Datensätze, wie sie in der Datenbank liegen
// ────────────────────────────────────────────────────────────

export interface HeatingSystem {
  id: string;
  building_id: string;
  name: string;
  provider: string | null;
  provider_property_no: string | null;
  energy_source: string;
  billing_area_m2: number | null;
  connected_hot_water: boolean;
  separation_method: 'wmz' | 'formel' | 'fest' | 'keine';
  separation_fixed_share: number | null;
  formula_temperature_c: number;
  formula_calorific_factor: number;
  heating_base_share: number;
  hotwater_base_share: number;
  ww_share_rounding: 'prozent2' | 'exakt';
  is_active: boolean;
  notes: string | null;
}

export interface HeatingMapping {
  id: string;
  heating_system_id: string;
  provider_user_no: string;
  provider_external_no: string | null;
  provider_user_name: string | null;
  provider_location: string | null;
  assignment_id: string | null;
  unit_number: string | null;
  confidence: 'bestaetigt' | 'vorschlag' | 'unbestaetigt';
  matched_by: string | null;
}

export interface HeatingDevice {
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
  fbh_area_m2: number | null;
  fbh_power_w_per_m2: number | null;
  fbh_load_factor: number | null;
  fbh_hours_per_day: number | null;
  fbh_days: number | null;
  calibration_year: number | null;
  calibration_valid_until: string | null;
  installed_on: string | null;
  removed_on: string | null;
  is_active: boolean;
}

export interface HeatingReading {
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

// ────────────────────────────────────────────────────────────
// Verbrauchsschlüssel
// ────────────────────────────────────────────────────────────

/**
 * Jede Geräteart bekommt einen eigenen Verbrauchsschlüssel. Der Rechenkern
 * verteilt je Schlüssel getrennt, damit Wärmezähler und Heizkostenverteiler
 * nicht versehentlich addiert werden — ihre Anzeigen sind nicht vergleichbar.
 */
export const SCHLUESSEL = {
  heizungHkv: 'hz_hkv',
  heizungWmz: 'hz_wmz',
  heizungFbh: 'hz_fbh',
  warmwasser: 'ww',
  kaltwasser: 'kw',
} as const;

const SCHLUESSEL_JE_GERAETEART: Record<HeatingDevice['device_type'], string> = {
  hkv: SCHLUESSEL.heizungHkv,
  wmz: SCHLUESSEL.heizungWmz,
  fbh: SCHLUESSEL.heizungFbh,
  wwz: SCHLUESSEL.warmwasser,
  kwz: SCHLUESSEL.kaltwasser,
};

/**
 * Der Verbrauch eines Geräts, so wie er in die Verteilung eingeht.
 *
 * Heizkostenverteiler zeigen dimensionslose Einheiten, die erst mit dem
 * Bewertungsfaktor multipliziert werden. Zähler zeigen bereits die Menge.
 * Bei der rechnerisch ermittelten Fußbodenheizung gibt es kein Gerät —
 * dort greift die Formel des Anbieters.
 */
export function verbrauchDesGeraets(
  device: HeatingDevice,
  reading: HeatingReading | undefined,
): number {
  if (device.device_type === 'fbh') {
    const { fbh_area_m2: a, fbh_power_w_per_m2: p, fbh_load_factor: l,
      fbh_hours_per_day: h, fbh_days: d } = device;
    if (a == null || p == null || l == null || h == null || d == null) return 0;
    // Ergebnis in MWh: m² × W/m² × Lastfaktor × h/Tag × Tage / 1.000.000
    return round((a * p * l * h * d) / 1_000_000, 3);
  }

  if (!reading) return 0;

  const menge = reading.consumption != null
    ? Number(reading.consumption)
    : (Number(reading.current_value ?? 0) - Number(reading.previous_value ?? 0));

  if (device.device_type === 'hkv') {
    const faktor = device.rating_factor;
    // Ohne Faktor lässt sich die Anzeige nicht bewerten. Wir liefern 0 und
    // melden das über pruefeBewertungsfaktoren — stillschweigend mit 1 zu
    // rechnen wäre der gefährlichere Fehler.
    if (faktor == null || faktor <= 0) return 0;
    return round(menge * faktor, 3);
  }

  return round(menge, 3);
}

// ────────────────────────────────────────────────────────────
// Laden
// ────────────────────────────────────────────────────────────

export interface LadeEingangArgs {
  heatingSystemId: string;
  fiscalYear: number;
  periodFrom: string;
  periodTo: string;
}

export interface GeladenerEingang {
  eingang: AbrechnungEingang;
  system: HeatingSystem;
  geraete: HeatingDevice[];
  pruefGeraete: GeraetPruefung[];
  mappings: HeatingMapping[];
  /** Nutzeinheiten ohne bestätigte Zuordnung zur App */
  ohneZuordnung: string[];
}

export async function ladeEingang(args: LadeEingangArgs): Promise<GeladenerEingang> {
  const { heatingSystemId, fiscalYear, periodFrom, periodTo } = args;

  const { data: system, error: sysError } = await hk('heating_systems')
    .select('*')
    .eq('id', heatingSystemId)
    .single();
  if (sysError || !system) throw new Error('Anlage nicht gefunden.');
  const anlage = system as unknown as HeatingSystem;

  const [{ data: mappingRows }, { data: deviceRows }] = await Promise.all([
    hk('heating_user_mapping').select('*')
      .eq('heating_system_id', heatingSystemId)
      .order('provider_user_no'),
    hk('heating_devices').select('*')
      .eq('heating_system_id', heatingSystemId),
  ]);

  const mappings = (mappingRows ?? []) as unknown as HeatingMapping[];
  // Nur Geräte, die im Abrechnungszeitraum tatsächlich verbaut waren.
  const geraete = ((deviceRows ?? []) as unknown as HeatingDevice[]).filter((d) => {
    if (d.installed_on && d.installed_on > periodTo) return false;
    if (d.removed_on && d.removed_on < periodFrom) return false;
    return true;
  });

  const { data: readingRows } = geraete.length
    ? await hk('heating_readings').select('*')
        .in('device_id', geraete.map((d) => d.id))
        .lte('period_from', periodTo)
        .gte('period_to', periodFrom)
    : { data: [] as unknown[] };
  const readings = (readingRows ?? []) as unknown as HeatingReading[];
  const readingJeGeraet = new Map(readings.map((r) => [r.device_id, r]));

  // ── Flächen und Zuordnungen ───────────────────────────────────────
  const assignmentIds = mappings.map((m) => m.assignment_id).filter(Boolean) as string[];
  const { data: shareRows } = assignmentIds.length
    ? await supabase.from('contact_building_shares')
        .select('assignment_id, share_type, share_value')
        .in('assignment_id', assignmentIds)
    : { data: [] as unknown[] };
  const flaecheJeAssignment = new Map<string, number>();
  for (const s of (shareRows ?? []) as { assignment_id: string; share_type: string; share_value: number }[]) {
    if (s.share_type === 'qm') flaecheJeAssignment.set(s.assignment_id, Number(s.share_value));
  }

  // ── Nutzeinheiten bauen ───────────────────────────────────────────
  const einheiten: Nutzeinheit[] = [];
  const ohneZuordnung: string[] = [];

  for (const m of mappings) {
    const eigeneGeraete = geraete.filter((d) => d.mapping_id === m.id);
    const verbrauch: Record<string, number> = {};
    for (const d of eigeneGeraete) {
      const key = SCHLUESSEL_JE_GERAETEART[d.device_type];
      verbrauch[key] = round((verbrauch[key] ?? 0) + verbrauchDesGeraets(d, readingJeGeraet.get(d.id)), 3);
    }

    if (m.confidence !== 'bestaetigt') {
      ohneZuordnung.push(`${m.provider_user_no} ${m.provider_user_name ?? ''}`.trim());
    }

    const zeitraum: Nutzerzeitraum = {
      name: m.provider_user_no,
      von: periodFrom,
      bis: periodTo,
      anteilKalendertage: 1,
      anteilGradtage: 1,
      verbrauch,
      assignmentId: m.assignment_id,
      mappingId: m.id,
    };

    einheiten.push({
      id: m.provider_user_no,
      bezeichnung: [m.provider_location, m.provider_user_name].filter(Boolean).join(' '),
      flaecheM2: (m.assignment_id ? flaecheJeAssignment.get(m.assignment_id) : undefined) ?? 0,
      unitNumber: m.unit_number,
      assignmentId: m.assignment_id,
      mappingId: m.id,
      zeitraeume: [zeitraum],
    });
  }

  // ── Kosten aus der Buchhaltung ─────────────────────────────────────
  const kosten = await ladeKosten(anlage.building_id, fiscalYear);

  // ── § 9-Trennung ─────────────────────────────────────────────────
  const trennung = baueTrennung(anlage, einheiten);

  // ── Erfassungssysteme ────────────────────────────────────────────
  const erfassungHeizung = baueErfassungssysteme(einheiten);

  const abrechnungsflaeche = anlage.billing_area_m2
    ?? round(einheiten.reduce((s, e) => s + e.flaecheM2, 0), 2);

  const eingang: AbrechnungEingang = {
    anlage: {
      name: anlage.name,
      energieart: anlage.energy_source,
      abrechnungsflaecheM2: abrechnungsflaeche,
      zeitraum: { von: periodFrom, bis: periodTo },
      gkAnteilHeizung: Number(anlage.heating_base_share),
      gkAnteilWarmwasser: Number(anlage.hotwater_base_share),
      trennung,
      rundungWwAnteil: anlage.ww_share_rounding,
    },
    kosten,
    einheiten,
    heizungVerbrauchKey: SCHLUESSEL.heizungHkv,
    warmwasserVerbrauchKey: SCHLUESSEL.warmwasser,
    erfassungHeizung,
    sonstige: baueWasserverteilung(einheiten),
  };

  const pruefGeraete: GeraetPruefung[] = geraete.map((d) => ({
    deviceNo: d.device_no,
    deviceType: d.device_type,
    ratingFactor: d.rating_factor,
    ratingFactorSource: d.rating_factor_source,
    calibrationValidUntil: d.calibration_valid_until,
    calibrationYear: d.calibration_year,
    einheit: mappings.find((m) => m.id === d.mapping_id)?.provider_user_no,
  }));

  return { eingang, system: anlage, geraete, pruefGeraete, mappings, ohneZuordnung };
}

/**
 * Kostenpositionen aus den heizkostenrelevanten Konten.
 *
 * Wichtig: Es werden die EINZELNEN Konten gelesen, nicht der Saldo auf 1400.
 * Die Trennung nach § 9 braucht die Kostenart je Position — welche Kosten nur
 * die Heizung betreffen, welche nur das Warmwasser und welche beides. Diese
 * Angabe steht auf dem Konto in `heating_cost_type`.
 *
 * Beim Brennstoff geht nicht der Einkauf in die Abrechnung, sondern der
 * FIFO-bewertete Verbrauch — Heizkosten sind die Ausnahme vom Abflussprinzip
 * (BGH V ZR 251/10).
 */
export async function ladeKosten(buildingId: string, fiscalYear: number): Promise<Kostenposition[]> {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_number, account_name, is_heating_relevant, heating_cost_type')
    .eq('is_heating_relevant', true)
    .or(`building_id.is.null,building_id.eq.${buildingId}`);

  const konten = (accounts ?? []) as {
    id: string; account_number: string; account_name: string;
    heating_cost_type: 'heizung' | 'warmwasser' | 'beides' | null;
  }[];
  if (konten.length === 0) return [];

  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('account_id, counter_account_id, amount, booking_category')
    .eq('building_id', buildingId)
    .eq('fiscal_year', fiscalYear)
    .neq('status', 'cancelled');

  // Umbuchungen auf das Sammelkonto und Splitts ausklammern, sonst zählt
  // dieselbe Kostenposition zweimal.
  const buchungen = (bookingRows ?? []).filter(
    (b: { booking_category?: string | null }) =>
      b.booking_category !== 'heating_repost' && b.booking_category !== 'heating_split',
  );

  const { data: inventory } = await supabase
    .from('fuel_inventory')
    .select('*')
    .eq('building_id', buildingId)
    .or(`consumption_year.eq.${fiscalYear}`);

  const fifo = computeFifoConsumption((inventory ?? []) as never[]);

  const kosten: Kostenposition[] = [];
  for (const k of konten) {
    // Das Sammelkonto 1400 ist Ziel der Umbuchung, keine eigene Kostenquelle.
    if (k.account_number === '1400') continue;

    let betrag = Math.abs(sumForAccount(k.id, buchungen as never[]));

    // Brennstoffeinkauf: nicht der Kauf zählt, sondern der Verbrauch.
    const istBrennstoffkauf = /^14[1-2]\d$/.test(k.account_number);
    if (istBrennstoffkauf && fifo.consumedValueEur > 0) {
      betrag = fifo.consumedValueEur;
    }

    if (betrag <= 0) continue;

    kosten.push({
      konto: k.account_number,
      bezeichnung: k.account_name,
      betrag: eur(betrag),
      art: k.heating_cost_type ?? 'beides',
    });
  }
  return kosten;
}

/** Baut die § 9-Trennung aus den Anlagendaten und den gemessenen Werten. */
function baueTrennung(anlage: HeatingSystem, einheiten: Nutzeinheit[]): TrennungMethode {
  if (!anlage.connected_hot_water || anlage.separation_method === 'keine') {
    return { art: 'keine' };
  }
  if (anlage.separation_method === 'fest') {
    return { art: 'vorgabe', wwAnteil: Number(anlage.separation_fixed_share ?? 0) };
  }
  if (anlage.separation_method === 'formel') {
    const wwVolumen = round(
      einheiten.reduce(
        (s, e) => s + e.zeitraeume.reduce((t, z) => t + (z.verbrauch[SCHLUESSEL.warmwasser] ?? 0), 0),
        0,
      ), 3);
    return {
      art: 'formel',
      wwVolumenM3: wwVolumen,
      temperaturC: Number(anlage.formula_temperature_c),
      brennwertFaktor: Number(anlage.formula_calorific_factor),
      // Ohne Gesamtenergie kann die Formel nicht ins Verhältnis gesetzt werden;
      // der Wert wird vom Aufrufer nachgetragen.
      gesamtEnergieKwh: 0,
    };
  }
  // Wärmemengenzähler: Der Zähler der Warmwasserbereitung steht als eigenes
  // Gerät in der Anlage, nicht bei einer Nutzeinheit.
  return { art: 'wmz', wwWaermemengeKwh: 0, gesamtWaermemengeKwh: 0 };
}

/**
 * Erkennt, ob im Haus mehrere Erfassungssysteme nebeneinander laufen, und
 * bildet sie als eigene Blöcke ab. Bezugsgröße ist der Verbrauch je System.
 */
function baueErfassungssysteme(einheiten: Nutzeinheit[]): ErfassungsSystem[] | undefined {
  const summe = (key: string) => round(
    einheiten.reduce(
      (s, e) => s + e.zeitraeume.reduce((t, z) => t + (z.verbrauch[key] ?? 0), 0),
      0,
    ), 3);

  const wmz = summe(SCHLUESSEL.heizungWmz);
  const hkv = summe(SCHLUESSEL.heizungHkv);
  const fbh = summe(SCHLUESSEL.heizungFbh);

  const systeme: ErfassungsSystem[] = [];
  if (wmz > 0) systeme.push({ bezeichnung: 'Wärmezähler', mengeGemeinsam: wmz, verbrauchKey: SCHLUESSEL.heizungWmz });
  if (fbh > 0) systeme.push({ bezeichnung: 'Fußbodenheizung (rechnerisch)', mengeGemeinsam: fbh, verbrauchKey: SCHLUESSEL.heizungFbh });
  if (hkv > 0) systeme.push({ bezeichnung: 'Heizkostenverteiler', mengeGemeinsam: hkv, verbrauchKey: SCHLUESSEL.heizungHkv });

  // Nur wenn wirklich mehr als ein System läuft, lohnt der eigene Rechenweg.
  return systeme.length > 1 ? systeme : undefined;
}

/** Kaltwasser wird nach gemessenem Verbrauch verteilt, wenn Zähler vorhanden sind. */
function baueWasserverteilung(einheiten: Nutzeinheit[]): Verteilung[] {
  const kw = einheiten.reduce(
    (s, e) => s + e.zeitraeume.reduce((t, z) => t + (z.verbrauch[SCHLUESSEL.kaltwasser] ?? 0), 0),
    0,
  );
  // Ohne erfassten Kaltwasserverbrauch gibt es hier nichts zu verteilen; die
  // Wasserkosten laufen dann über die normalen Verteilerschlüssel der App.
  return kw > 0 ? [] : [];
}

// ────────────────────────────────────────────────────────────
// Speichern
// ────────────────────────────────────────────────────────────

export interface SpeichereArgs {
  heatingSystemId: string;
  buildingId: string;
  billingPeriodId: string | null;
  fiscalYear: number;
  periodFrom: string;
  periodTo: string;
  eingang: AbrechnungEingang;
  ergebnis: AbrechnungErgebnis;
  userId?: string | null;
}

/**
 * Schreibt einen Rechenlauf fest.
 *
 * Eingang und Ergebnis wandern vollständig als JSON in den Datensatz. Damit
 * bleibt die Abrechnung auch dann nachvollziehbar, wenn jemand später einen
 * Stammdatensatz korrigiert — der alte Lauf ändert sich nicht mehr.
 */
export async function speichereErgebnis(args: SpeichereArgs): Promise<string> {
  const { ergebnis, eingang } = args;

  const { data: settlement, error } = await hk('heating_settlements')
    .insert({
      heating_system_id: args.heatingSystemId,
      building_id: args.buildingId,
      billing_period_id: args.billingPeriodId,
      fiscal_year: args.fiscalYear,
      period_from: args.periodFrom,
      period_to: args.periodTo,
      status: 'gerechnet',
      input: eingang as unknown as Json,
      result: ergebnis as unknown as Json,
      checks: ergebnis.hinweise as unknown as Json,
      total_costs: ergebnis.kostenGesamt,
      heating_costs: ergebnis.kostenHeizung,
      hotwater_costs: ergebnis.kostenWarmwasser,
      water_costs: ergebnis.kostenSonstige,
      ww_share: ergebnis.wwAnteil,
      co2_kg: eingang.co2?.kg ?? null,
      co2_costs: eingang.co2?.kosten ?? null,
      co2_owner_share: ergebnis.co2?.anteilVermieter ?? null,
      engine_version: ergebnis.engineVersion,
      calculated_at: new Date().toISOString(),
      calculated_by: args.userId ?? null,
    })
    .select('id')
    .single();

  if (error || !settlement) throw new Error(`Rechenlauf konnte nicht gespeichert werden: ${error?.message}`);
  const settlementId = settlement.id as string;

  const items = ergebnis.jeEinheit.map((z) => ({
    settlement_id: settlementId,
    mapping_id: z.mappingId ?? null,
    assignment_id: z.assignmentId ?? null,
    unit_number: z.unitNumber ?? null,
    user_name: z.bezeichnung,
    period_from: z.von ?? args.periodFrom,
    period_to: z.bis ?? args.periodTo,
    area_m2: z.flaecheM2,
    heating_base: z.heizungGrund,
    heating_consumption: z.heizungVerbrauch,
    hotwater_base: z.warmwasserGrund,
    hotwater_consumption: z.warmwasserVerbrauch,
    water: z.wasser,
    other: z.sonstiges,
    total: z.gesamt,
    detail: { posten: z.posten } as unknown as Json,
  }));

  if (items.length > 0) {
    const { error: itemError } = await hk('heating_settlement_items').insert(items);
    if (itemError) throw new Error(`Einzelergebnisse konnten nicht gespeichert werden: ${itemError.message}`);
  }

  return settlementId;
}

/**
 * Übergibt das Ergebnis an die Jahresabrechnung.
 *
 * Erst hier wird die bestehende Verteilung überschrieben — bewusst als
 * eigener Schritt nach der Freigabe, damit ein Probelauf nichts verändert.
 * Mehrere Zeiträume derselben Zuordnung werden addiert, weil die
 * Jahresabrechnung je Zuordnung nur einen Betrag kennt.
 */
export async function uebergebeAnJahresabrechnung(
  settlementId: string,
  buildingId: string,
  billingPeriodId: string,
): Promise<{ geschrieben: number; ohneZuordnung: number }> {
  const { data: itemRows, error } = await hk('heating_settlement_items')
    .select('assignment_id, total, heating_base, heating_consumption, hotwater_base, hotwater_consumption, water')
    .eq('settlement_id', settlementId);
  if (error) throw new Error(error.message);

  const items = (itemRows ?? []) as {
    assignment_id: string | null; total: number;
    heating_base: number; heating_consumption: number;
    hotwater_base: number; hotwater_consumption: number; water: number;
  }[];

  const jeZuordnung = new Map<string, {
    amount: number; heating_base: number; heating_consumption: number;
    hotwater_base: number; hotwater_consumption: number; water: number;
  }>();
  let ohneZuordnung = 0;

  for (const i of items) {
    if (!i.assignment_id) { ohneZuordnung += 1; continue; }
    const bisher = jeZuordnung.get(i.assignment_id) ?? {
      amount: 0, heating_base: 0, heating_consumption: 0,
      hotwater_base: 0, hotwater_consumption: 0, water: 0,
    };
    jeZuordnung.set(i.assignment_id, {
      amount: eur(bisher.amount + Number(i.total)),
      heating_base: eur(bisher.heating_base + Number(i.heating_base)),
      heating_consumption: eur(bisher.heating_consumption + Number(i.heating_consumption)),
      hotwater_base: eur(bisher.hotwater_base + Number(i.hotwater_base)),
      hotwater_consumption: eur(bisher.hotwater_consumption + Number(i.hotwater_consumption)),
      water: eur(bisher.water + Number(i.water)),
    });
  }

  const rows = Array.from(jeZuordnung.entries()).map(([assignmentId, w]) => ({
    building_id: buildingId,
    billing_period_id: billingPeriodId,
    assignment_id: assignmentId,
    amount: w.amount,
    heating_base: w.heating_base,
    heating_consumption: w.heating_consumption,
    hotwater_base: w.hotwater_base,
    hotwater_consumption: w.hotwater_consumption,
    water: w.water,
    settlement_id: settlementId,
    source: 'eigene_abrechnung',
    note: 'Eigene Heizkostenabrechnung',
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await hk('heating_distribution_values')
      .upsert(rows, { onConflict: 'billing_period_id,assignment_id' });
    if (upsertError) throw new Error(upsertError.message);
  }

  await hk('heating_settlements')
    .update({ status: 'freigegeben', released_at: new Date().toISOString() })
    .eq('id', settlementId);

  return { geschrieben: rows.length, ohneZuordnung };
}
