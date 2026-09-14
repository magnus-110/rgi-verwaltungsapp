import { supabase } from "@/integrations/supabase/client";

/**
 * Kopfprinzip (§ 25 Abs. 2 WEG): Jeder Wohnungseigentümer hat grundsätzlich eine Stimme —
 * auch dann, wenn ihm mehrere Einheiten gehören. In der VerwaltungsApp wird das über
 * `etv_attendees.head_weight` abgebildet:
 *   1 = die Einheit zählt als eigener Kopf
 *   0 = die Einheit wird mit einer anderen Einheit desselben Eigentümers zusammengefasst
 *
 * Abweichende Regelungen der Teilungserklärung (z. B. Objektprinzip oder
 * Mehrfachstimmrecht) lassen sich in der Vorbereitung händisch einstellen.
 */

/** Kopfgewicht eines Teilnehmers bzw. einer Stimme — fehlender Wert zählt als voller Kopf. */
export const getHeadWeight = (row: any): number => {
  const value = row?.head_weight;
  if (value === null || value === undefined || value === "") return 1;
  const num = Number(value);
  return Number.isFinite(num) ? num : 1;
};

/** Summe der Köpfe über Teilnehmer- oder Stimmzeilen. */
export const sumHeads = (rows: any[]): number =>
  rows.reduce((sum, row) => sum + getHeadWeight(row), 0);

/** Köpfe hübsch darstellen (2 = "2", 0,5 = "0,5"). */
export const formatHeads = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toLocaleString("de-DE", { maximumFractionDigits: 2 });

/**
 * Altdaten-Alias: In älteren TOPs steht "kopf" statt "headcount".
 * Beide meinen das Kopfprinzip.
 */
export const normalizeVotingPrinciple = (principle?: string | null): string =>
  principle === "kopf" ? "headcount" : principle || "mea";

type HeadRow = {
  id: string;
  head_weight: number | null;
  assignment_id: string;
  contact_building_assignments?: {
    unit_number: string | null;
    contacts?: { id: string } | null;
  } | null;
};

const loadHeadRows = async (meetingId: string): Promise<HeadRow[]> => {
  const { data, error } = await supabase
    .from("etv_attendees")
    .select("id, head_weight, assignment_id, contact_building_assignments!inner(unit_number, contacts!inner(id))")
    .eq("meeting_id", meetingId);
  if (error) throw error;
  return (data || []) as unknown as HeadRow[];
};

const persist = async (updates: { id: string; head_weight: number }[]) => {
  for (const u of updates) {
    const { error } = await (supabase.from("etv_attendees") as any)
      .update({ head_weight: u.head_weight })
      .eq("id", u.id);
    if (error) throw error;
  }
  return updates.length;
};

/**
 * Fasst alle Einheiten desselben Eigentümers (gleiche contact_id) zu einem Kopf zusammen.
 * Die erste Einheit (nach Einheitennummer) behält den Kopf, die weiteren bekommen 0.
 * Gibt die Anzahl geänderter Zeilen zurück.
 */
export const applyHeadGrouping = async (meetingId: string): Promise<number> => {
  const rows = await loadHeadRows(meetingId);
  const byContact = new Map<string, HeadRow[]>();
  for (const row of rows) {
    const contactId = row.contact_building_assignments?.contacts?.id || row.assignment_id;
    const list = byContact.get(contactId) || [];
    list.push(row);
    byContact.set(contactId, list);
  }

  const updates: { id: string; head_weight: number }[] = [];
  byContact.forEach((list) => {
    const sorted = [...list].sort((a, b) =>
      (a.contact_building_assignments?.unit_number || "").localeCompare(
        b.contact_building_assignments?.unit_number || "",
        "de",
        { numeric: true }
      )
    );
    sorted.forEach((row, idx) => {
      const target = idx === 0 ? 1 : 0;
      if (getHeadWeight(row) !== target) updates.push({ id: row.id, head_weight: target });
    });
  });

  return persist(updates);
};

/** Setzt das Kopfgewicht aller Teilnehmer zurück: jede Einheit zählt als eigener Kopf. */
export const resetHeadGrouping = async (meetingId: string): Promise<number> => {
  const rows = await loadHeadRows(meetingId);
  const updates = rows.filter((r) => getHeadWeight(r) !== 1).map((r) => ({ id: r.id, head_weight: 1 }));
  return persist(updates);
};
