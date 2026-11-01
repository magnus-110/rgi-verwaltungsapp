// Gemeinsame Datenbank-Abfragen für Abrechnung und Wirtschaftsplan – App (Browser) und Server
// rufen genau diese Funktionen auf. db = supabase-js-Client.

const SEITE = 1000;

/**
 * Alle Zeilen einer Abfrage – Supabase liefert je Anfrage höchstens 1000 Zeilen.
 * `abfrage()` muss jedes Mal eine NEUE Abfrage bauen; sortiert wird nach id, damit die Seiten stabil sind.
 */
export async function alleZeilen<T = any>(abfrage: () => any): Promise<T[]> {
  const alle: T[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await abfrage().order("id", { ascending: true }).range(von, von + SEITE - 1);
    if (error) throw error;
    alle.push(...((data ?? []) as T[]));
    if (!data || data.length < SEITE) break;
  }
  return alle;
}

/** Buchungen eines Zeitraums (nach Buchungsdatum) – Jahresabrechnung */
export function ladeBuchungenZeitraum(db: any, buildingId: string, von: string, bis: string) {
  return alleZeilen(() =>
    db.from("bookings")
      .select("id, account_id, counter_account_id, amount, booking_date, booking_type, booking_category, description, is_35a_relevant, fiscal_year")
      .eq("building_id", buildingId)
      .gte("booking_date", von)
      .lte("booking_date", bis)
      .neq("status", "cancelled"),
  );
}

/** IST-Zahlungen auf Personenkonten (SOLL/IST-Schalter der Abrechnung) */
export function ladeIstZahlungen(db: any, buildingId: string, fiscalYear: number, personenKontoIds: string[]) {
  if (!personenKontoIds.length) return Promise.resolve([]);
  return alleZeilen(() =>
    db.from("bookings")
      .select("id, account_id, amount, counter_account_id, description")
      .eq("building_id", buildingId)
      .eq("fiscal_year", fiscalYear)
      .neq("status", "cancelled")
      .in("account_id", personenKontoIds),
  );
}

/** Buchungen eines Wirtschaftsjahres – Vorjahres-IST im Wirtschaftsplan */
export function ladeBuchungenJahr(db: any, buildingId: string, fiscalYear: number) {
  return alleZeilen(() =>
    db.from("bookings")
      .select("id, account_id, counter_account_id, amount, booking_category")
      .eq("building_id", buildingId)
      .eq("fiscal_year", fiscalYear)
      .neq("status", "cancelled"),
  );
}

/**
 * Plan-Werte des Wirtschaftsplans für die Spalte „Wirtschaftsplan" der Jahresabrechnung:
 * Plan desselben Jahres – der aktive, sonst der neueste.
 */
export async function ladeWirtschaftsplanPositionen(db: any, buildingId: string, fiscalYear: number): Promise<{ account_id: string; planned_amount: number }[]> {
  const { data: plaene, error } = await db
    .from("economic_plans")
    .select("id, status, created_at")
    .eq("building_id", buildingId)
    .eq("fiscal_year", fiscalYear)
    .order("created_at", { ascending: false });
  if (error || !plaene?.length) return [];
  const plan = plaene.find((p: any) => p.status === "active") ?? plaene[0];
  const { data: items, error: iErr } = await db
    .from("economic_plan_items")
    .select("account_id, planned_amount")
    .eq("plan_id", plan.id);
  if (iErr) return [];
  return (items ?? []) as any[];
}
