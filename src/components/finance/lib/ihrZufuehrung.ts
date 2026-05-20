import { supabase } from "@/integrations/supabase/client";

export const IHR_DURCHLAUF_ACCOUNT_NUMBER = "4030";
export const IHR_DURCHLAUF_ACCOUNT_NAME = "Durchlaufkonto";
export const IHR_DURCHLAUF_CATEGORY = "5. Eröffnungen & Abgrenzung";

export const IHR_PLAN_ACCOUNT_NUMBER = "1930";
export const IHR_PLAN_ACCOUNT_NAME = "Planmäßige IHR Wohnungen";
export const IHR_PLAN_CATEGORY = "4. WEG-Systemkonten & Rücklagen";

/**
 * Erkennt Rücklagenkonten (Konto-Nr. 1810–1820, inkl. Unterkonten 1811–1819).
 * Diese sind die "Festgeld / Sparbuch"-Bankkonten der Erhaltungsrücklage.
 */
export function isReserveAccount(account: { account_number?: string | null } | null | undefined): boolean {
  if (!account) return false;
  const n = (account.account_number || "").trim();
  if (!n) return false;
  if (n === "1820") return true;
  if (/^181\d$/.test(n)) return true; // 1810..1819
  return false;
}

/**
 * Liefert ein Konto (nach Konto-Nr.) für ein Building. Legt es bei Bedarf an.
 */
async function ensureAccountByNumber(
  buildingId: string,
  accountNumber: string,
  fallback: { name: string; category: string; sort_order: number }
): Promise<string> {
  const { data: own } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("building_id", buildingId)
    .eq("account_number", accountNumber)
    .maybeSingle();
  if (own?.id) return own.id;

  const { data: global } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .is("building_id", null)
    .eq("account_number", accountNumber)
    .maybeSingle();

  const insertPayload: any = {
    building_id: buildingId,
    account_number: accountNumber,
    account_name: global?.account_name || fallback.name,
    category: global?.category || fallback.category,
    settlement_section: global?.settlement_section ?? null,
    is_billing_relevant: false,
    is_heating_relevant: false,
    is_wirtschaftsplan_relevant: false,
    is_distributable: false,
    is_reserve_funded: false,
    carry_forward_balance: true,
    is_35a_relevant: false,
    sort_order: global?.sort_order ?? fallback.sort_order,
  };
  const { data: created, error } = await supabase
    .from("chart_of_accounts")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw error;
  return created!.id;
}

export async function ensureDurchlaufAccount(buildingId: string): Promise<string> {
  return ensureAccountByNumber(buildingId, IHR_DURCHLAUF_ACCOUNT_NUMBER, {
    name: IHR_DURCHLAUF_ACCOUNT_NAME,
    category: IHR_DURCHLAUF_CATEGORY,
    sort_order: 95,
  });
}

export async function ensurePlanIhrAccount(buildingId: string): Promise<string> {
  return ensureAccountByNumber(buildingId, IHR_PLAN_ACCOUNT_NUMBER, {
    name: IHR_PLAN_ACCOUNT_NAME,
    category: IHR_PLAN_CATEGORY,
    sort_order: 84,
  });
}

/**
 * Erstellt die interne IHR-Zuführungs-Buchung 4030 → 1930.
 *
 *   account_id         = 1930 Planmäßige IHR Wohnungen  (+ Buchung)
 *   counter_account_id = 4030 Durchlaufkonto
 *   booking_type       = "income"   (positiver Zugang auf 1930)
 *   booking_date       = 31.12. des Wirtschaftsjahres
 *   receipt_number     = "intern"
 *   description        = "Rücklagenbildung {YYYY}" (+ optional originaltext)
 */
export async function createIhrZufuehrungBooking(params: {
  buildingId: string;
  amount: number;
  fiscalYear: number;
  description?: string | null;
  createdBy?: string | null;
}): Promise<string> {
  const planAccountId = await ensurePlanIhrAccount(params.buildingId);
  const durchlaufAccountId = await ensureDurchlaufAccount(params.buildingId);

  const bookingDate = `${params.fiscalYear}-12-31`;
  const description = params.description?.trim()
    ? params.description.trim()
    : `Rücklagenbildung ${params.fiscalYear}`;

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      building_id: params.buildingId,
      account_id: planAccountId,
      counter_account_id: durchlaufAccountId,
      booking_date: bookingDate,
      amount: Math.abs(params.amount),
      description,
      fiscal_year: params.fiscalYear,
      source: "manual",
      status: "pending",
      booking_type: "income",
      booking_reference: "intern",
      receipt_number: "intern",
      created_by: params.createdBy ?? null,
    } as any)
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}
