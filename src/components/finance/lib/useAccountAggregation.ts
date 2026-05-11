import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for account-grouped booking aggregation.
 *
 * Wird von AccountPlanView (Buchen → Buchungen → Kontenplan) UND
 * BookingReviewSection (Abrechnung → Buchungen prüfen) genutzt, damit beide
 * Ansichten IMMER dieselben Zahlen zeigen.
 *
 * Logik (doppelte Buchführung):
 *   - Jede Buchung erscheint auf BEIDEN Konten:
 *       account_id          → +amount (booking_type bleibt)
 *       counter_account_id  → -amount (booking_type wird gedreht)
 *   - Anfangsbestände kommen aus account_balances.
 *   - Konten werden aus chart_of_accounts geladen + defensive Fallbacks.
 *   - Kategorien-Reihenfolge: asset → liability → equity → income → expense.
 */

export interface AggregationOptions {
  bookings: any[];
  fiscalYear: number;
  buildingId?: string | null;
  showAllAccounts?: boolean;
}

const CATEGORY_ORDER = ["asset", "liability", "equity", "income", "revenue", "expense", "expenses"];

export const CATEGORY_LABELS: Record<string, string> = {
  asset: "Aktiva",
  liability: "Passiva",
  equity: "Eigenkapital",
  income: "Erträge",
  revenue: "Erträge",
  expense: "Aufwendungen",
  expenses: "Aufwendungen",
};

export function useAccountAggregation({
  bookings,
  fiscalYear,
  buildingId,
  showAllAccounts = false,
}: AggregationOptions) {
  const { data: accounts = [] } = useQuery({
    queryKey: ["coa-aggregation", buildingId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category, sort_order, building_id, is_billing_relevant");
      if (buildingId) q = q.or(`building_id.eq.${buildingId},building_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: balances = [] } = useQuery({
    queryKey: ["account-balances-aggregation", fiscalYear, buildingId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("account_balances")
        .select("account_id, opening_balance, closing_balance, building_id")
        .eq("fiscal_year", fiscalYear);
      if (buildingId) q = q.eq("building_id", buildingId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const balanceByAccount = useMemo(() => {
    const m: Record<string, number> = {};
    balances.forEach((b: any) => {
      m[b.account_id] = (m[b.account_id] || 0) + Number(b.opening_balance || 0);
    });
    return m;
  }, [balances]);

  // Buchung doppelt erfassen — einmal pro Konto, Vorzeichen sauber gedreht
  const bookingsByAccount = useMemo(() => {
    const m: Record<string, any[]> = {};
    bookings.forEach((b: any) => {
      if (b.account_id) {
        if (!m[b.account_id]) m[b.account_id] = [];
        m[b.account_id].push({ ...b, _side: "primary" });
      }
      if (b.counter_account_id) {
        if (!m[b.counter_account_id]) m[b.counter_account_id] = [];
        const flippedType = b.booking_type === "income" ? "expense" : "income";
        const counterDisplay = b.chart_of_accounts
          ? {
              account_number: b.chart_of_accounts.account_number,
              account_name: b.chart_of_accounts.account_name,
            }
          : null;
        m[b.counter_account_id].push({
          ...b,
          _side: "counter",
          booking_type: flippedType,
          counter_account: counterDisplay,
        });
      }
    });
    Object.values(m).forEach((arr) =>
      arr.sort((a, b) => String(b.booking_date).localeCompare(String(a.booking_date)))
    );
    return m;
  }, [bookings]);

  const grouped = useMemo(() => {
    const accMap = new Map<string, any>();
    accounts.forEach((a: any) => accMap.set(a.id, a));

    Object.keys(bookingsByAccount).forEach((accId) => {
      if (!accMap.has(accId)) {
        const sample = bookingsByAccount[accId][0];
        accMap.set(accId, {
          id: accId,
          account_number: sample.chart_of_accounts?.account_number || "?",
          account_name: sample.chart_of_accounts?.account_name || "Unbekannt",
          category: "expense",
          sort_order: 9999,
        });
      }
    });

    const list = Array.from(accMap.values()).filter((a) => {
      const accBookings = bookingsByAccount[a.id] || [];
      const movement = accBookings.reduce((s, b: any) => {
        const sign = b.booking_type === "income" ? 1 : -1;
        return s + sign * Number(b.amount || 0);
      }, 0);
      const opening = balanceByAccount[a.id] || 0;
      const closing = opening + movement;
      if (showAllAccounts) return true;
      return Math.abs(closing) >= 0.005;
    });

    const byCat: Record<string, any[]> = {};
    list.forEach((a) => {
      const cat = a.category || "expense";
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(a);
    });

    Object.values(byCat).forEach((arr) =>
      arr.sort((a, b) =>
        String(a.account_number).localeCompare(String(b.account_number), "de", { numeric: true })
      )
    );

    const orderedCats = Object.keys(byCat).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      const aRank = ai === -1 ? 99 : ai;
      const bRank = bi === -1 ? 99 : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a.localeCompare(b);
    });

    return orderedCats.map((cat) => ({ category: cat, accounts: byCat[cat] }));
  }, [accounts, bookingsByAccount, balanceByAccount, showAllAccounts]);

  return { grouped, bookingsByAccount, balanceByAccount, accounts };
}
