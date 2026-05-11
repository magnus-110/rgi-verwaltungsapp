import { supabase } from "@/integrations/supabase/client";

export const SOLLSTELLUNG_ACCOUNT_NUMBER = "4020";
export const SOLLSTELLUNG_ACCOUNT_NAME = "WEG-Abrechnung Sollstellung";
export const SOLLSTELLUNG_CATEGORY = "5. Eröffnungen & Abgrenzung";

/**
 * Erkennt, ob ein Konto ein Personenkonto (Hausgeld-Konto eines Eigentümers / Mieters) ist.
 * Konvention: Kategorie beginnt mit "0. Personenkonten".
 */
export function isPersonenkonto(account: { category?: string | null } | null | undefined): boolean {
  if (!account) return false;
  return (account.category || "").trim().toLowerCase().startsWith("0. personenkonten");
}

/**
 * Liefert das Konto 4020 für ein Building. Legt es bei Bedarf an (building-spezifisch).
 */
export async function ensureSollstellungAccount(buildingId: string): Promise<string> {
  // 1. Versuch: building-spezifisch
  const { data: own } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("building_id", buildingId)
    .eq("account_number", SOLLSTELLUNG_ACCOUNT_NUMBER)
    .maybeSingle();
  if (own?.id) return own.id;

  // 2. Versuch: globale Vorlage (building_id IS NULL)
  const { data: global } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .is("building_id", null)
    .eq("account_number", SOLLSTELLUNG_ACCOUNT_NUMBER)
    .maybeSingle();

  // 3. Building-spezifischen Eintrag anlegen
  const insertPayload: any = {
    building_id: buildingId,
    account_number: SOLLSTELLUNG_ACCOUNT_NUMBER,
    account_name: global?.account_name || SOLLSTELLUNG_ACCOUNT_NAME,
    category: global?.category || SOLLSTELLUNG_CATEGORY,
    settlement_section: global?.settlement_section ?? null,
    is_billing_relevant: false,
    is_heating_relevant: false,
    is_wirtschaftsplan_relevant: false,
    is_distributable: false,
    is_reserve_funded: false,
    carry_forward_balance: true,
    is_35a_relevant: false,
    sort_order: global?.sort_order ?? 4020,
  };
  const { data: created, error } = await supabase
    .from("chart_of_accounts")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw error;
  return created!.id;
}

export type SollstellungDirection = "guthaben" | "nachzahlung";

/**
 * Erstellt die interne Sollstellungs-Buchung Personenkonto ↔ 4020.
 *
 * Beobachtetes Muster (vgl. Adolf-Haff-Weg 3, Abrechnung 2024):
 *   - Guthaben:   account_id = Personenkonto, counter_account_id = 4020, booking_type = "expense"
 *   - Nachzahlung: account_id = 4020,         counter_account_id = Personenkonto, booking_type = "expense"
 */
export async function createSollstellungBooking(params: {
  buildingId: string;
  personenkontoId: string;
  amount: number;
  bookingDate: string;
  description: string;
  direction: SollstellungDirection;
  createdBy?: string | null;
}): Promise<string> {
  const sollstellungAccountId = await ensureSollstellungAccount(params.buildingId);
  const fiscalYear = new Date(params.bookingDate).getFullYear();

  const isGuthaben = params.direction === "guthaben";
  const accountId = isGuthaben ? params.personenkontoId : sollstellungAccountId;
  const counterAccountId = isGuthaben ? sollstellungAccountId : params.personenkontoId;

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      building_id: params.buildingId,
      account_id: accountId,
      counter_account_id: counterAccountId,
      booking_date: params.bookingDate,
      amount: Math.abs(params.amount),
      description: params.description,
      fiscal_year: fiscalYear,
      source: "manual",
      status: "pending",
      booking_type: "expense",
      booking_reference: "intern",
      created_by: params.createdBy ?? null,
    } as any)
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}
