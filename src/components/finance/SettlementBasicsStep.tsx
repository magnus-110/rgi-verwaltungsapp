import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, PiggyBank, Users, Info, AlertTriangle, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getEffectiveOpeningBalance } from "./lib/bookingAggregation";

interface SettlementBasicsStepProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

/**
 * SettlementBasicsStep
 * --------------------
 * Schritt 1 der Jahresabrechnung: Read-only Zusammenfassung der Grundlagen.
 * - Anfangsbestände (aus Eröffnungsbuchung 4000 oder manuell)
 * - Geleistete Hausgelder (aus Personenkonten)
 * - IHR-Zuführung (aus Wirtschaftsplan; Fallback: Hinweis)
 * - Anzahl Eigentümer + Einheiten-Override-Status
 */
export function SettlementBasicsStep({ buildingId, periodId, fiscalYear }: SettlementBasicsStepProps) {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  // Building (für Einheiten-Override)
  const { data: building } = useQuery({
    queryKey: ["basics-building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, unit_count, unit_count_for_billing")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Period (für Datumsbereich-Filter)
  const { data: period } = useQuery({
    queryKey: ["basics-period", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_periods")
        .select("period_from, period_to")
        .eq("id", periodId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Carry-forward accounts + bookings + balances → Anfangsbestände
  const { data: accounts = [] } = useQuery({
    queryKey: ["basics-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category, settlement_section, carry_forward_balance")
        .or(`building_id.is.null,building_id.eq.${buildingId}`);
      if (error) throw error;
      return data;
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["basics-bookings", buildingId, period?.period_from, period?.period_to],
    enabled: !!period,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount, booking_date, booking_type")
        .eq("building_id", buildingId)
        .gte("booking_date", period!.period_from)
        .lte("booking_date", period!.period_to)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  const { data: balances = [] } = useQuery({
    queryKey: ["basics-balances", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("account_id, opening_balance")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (error) throw error;
      return data;
    },
  });

  // Wirtschaftsplan → IHR-Zuführung
  const { data: economicPlan } = useQuery({
    queryKey: ["basics-economic-plan", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_plans")
        .select("id, total_reserve, total_costs, status")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Eigentümeranzahl
  const { data: ownerCount = 0 } = useQuery({
    queryKey: ["basics-owners", buildingId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contact_building_assignments")
        .select("id", { count: "exact", head: true })
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .eq("role_in_building", "eigentuemer");
      if (error) throw error;
      return count || 0;
    },
  });

  // Compute opening balances per account
  const opening4000 = accounts.find((a: any) => a.account_number === "4000");
  const opening4000Id = opening4000?.id || null;
  const carryAccounts = accounts.filter((a: any) => a.carry_forward_balance);
  const flatBalances = balances.map((b: any) => ({
    account_id: b.account_id,
    opening_balance: b.opening_balance,
  }));

  const openings = carryAccounts.map((acc: any) => {
    const eff = getEffectiveOpeningBalance(
      acc.id,
      bookings as any,
      flatBalances,
      fiscalYear,
      opening4000Id,
    );
    return { acc, amount: eff.amount, source: eff.source };
  });

  const giroOpening = openings
    .filter((o) => o.acc.category !== "ruecklage")
    .reduce((s, o) => s + o.amount, 0);
  const reserveOpening = openings
    .filter((o) => o.acc.category === "ruecklage")
    .reduce((s, o) => s + o.amount, 0);

  // Hausgeldsumme (Bewegungen auf Personenkonten)
  const personAccounts = accounts.filter((a: any) => a.account_number?.startsWith("0000"));
  const hausgeldTotal = personAccounts.reduce((s: number, acc: any) => {
    const total = bookings.reduce((bs, b: any) => {
      const amt = Number(b.amount) || 0;
      if (b.account_id === acc.id) return bs + amt;
      if (b.counter_account_id === acc.id) return bs - amt;
      return bs;
    }, 0);
    return s + Math.abs(total);
  }, 0);

  const reserveContribution = economicPlan?.total_reserve ? Number(economicPlan.total_reserve) : 0;
  const effectiveUnits = building?.unit_count_for_billing ?? building?.unit_count ?? 0;

  return (
    <div className="space-y-3">
      {/* Übersichts-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5" /> Anfangsbestand Bank
            </div>
            <p className="text-lg font-semibold font-mono">{formatCurrency(giroOpening)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {openings.filter((o) => o.acc.category !== "ruecklage" && o.source === "booking_4000").length > 0
                ? "aus Eröffnungsbuchung 4000"
                : openings.filter((o) => o.acc.category !== "ruecklage" && o.source === "manual").length > 0
                  ? "manuell hinterlegt"
                  : "keine Daten"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <PiggyBank className="h-3.5 w-3.5" /> Anfangsbestand Rücklage
            </div>
            <p className="text-lg font-semibold font-mono">{formatCurrency(reserveOpening)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {openings.filter((o) => o.acc.category === "ruecklage" && o.source === "booking_4000").length > 0
                ? "aus Eröffnungsbuchung 4000"
                : openings.filter((o) => o.acc.category === "ruecklage" && o.source === "manual").length > 0
                  ? "manuell hinterlegt"
                  : "keine Daten"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5" /> Geleistete Hausgelder
            </div>
            <p className="text-lg font-semibold font-mono">{formatCurrency(hausgeldTotal)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">aus Personenkonten</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" /> Einheiten
            </div>
            <p className="text-lg font-semibold font-mono">
              {effectiveUnits}
              {building?.unit_count_for_billing != null && building?.unit_count_for_billing !== building?.unit_count && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  (Stamm: {building.unit_count})
                </span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{ownerCount} Eigentümer</p>
          </CardContent>
        </Card>
      </div>

      {/* IHR-Plan-Status */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2">
              <PiggyBank className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-sm font-medium">IHR-Zuführung laut Wirtschaftsplan {fiscalYear}</p>
                {economicPlan ? (
                  <>
                    <p className="text-xl font-bold font-mono mt-1">{formatCurrency(reserveContribution)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        Status: {economicPlan.status}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        wird 1:1 in die Einzelabrechnungen übernommen (Sollstellung)
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-700">
                      Kein Wirtschaftsplan für {fiscalYear} hinterlegt — IHR-Zuführung wird mit 0,00 € angesetzt.
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/finanzen/wirtschaftsplan">Wirtschaftsplan öffnen</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 p-3 rounded-md border border-dashed text-xs text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>
          Diese Grundlagen werden automatisch aus den Stammdaten gelesen und sind read-only. Sie ändern sich,
          sobald du Eröffnungsbuchungen erfasst, den Wirtschaftsplan aktualisierst oder Eigentümer-Zuordnungen anpasst.
        </span>
      </div>
    </div>
  );
}
