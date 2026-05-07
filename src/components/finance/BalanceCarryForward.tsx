import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ArrowRight, Check, RefreshCw, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { getEffectiveOpeningBalance } from "./lib/bookingAggregation";
import { parseAmount } from "./lib/parseAmount";

interface BalanceCarryForwardProps {
  buildingId: string;
  fiscalYear: number;
  periodId: string;
}

export function BalanceCarryForward({ buildingId, fiscalYear, periodId }: BalanceCarryForwardProps) {
  const queryClient = useQueryClient();
  const [isCarrying, setIsCarrying] = useState(false);
  const [overrideMode, setOverrideMode] = useState<Record<string, boolean>>({});
  const prevYear = fiscalYear - 1;

  const { data: carryAccounts = [] } = useQuery({
    queryKey: ["carry-forward-accounts-relevant", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("carry_forward_balance", true)
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return (data || []).filter((a: any) => {
        if (a.settlement_section === "bank" || a.settlement_section === "reserve") return true;
        const num = Number(a.account_number);
        return num >= 1800 && num < 1900;
      });
    },
  });

  // Konto 4000 (Eröffnungsbuchungen) ID ermitteln
  const { data: openingAccountId } = useQuery({
    queryKey: ["opening-account-id", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_number", "4000")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string) || null;
    },
  });

  // Buchungen des aktuellen WJ — nötig für Erkennung von Eröffnungsbuchungen gegen 4000
  const { data: bookings = [] } = useQuery({
    queryKey: ["carry-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount, booking_date")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: prevBalances = [] } = useQuery({
    queryKey: ["account-balances", buildingId, prevYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("*")
        .eq("building_id", buildingId)
        .eq("fiscal_year", prevYear);
      if (error) throw error;
      return data;
    },
  });

  const { data: currentBalances = [], refetch: refetchCurrent } = useQuery({
    queryKey: ["account-balances", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("*")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (error) throw error;
      return data;
    },
  });

  const getPrevClosing = (accountId: string) => {
    const bal = prevBalances.find((b) => b.account_id === accountId);
    return bal?.closing_balance ?? 0;
  };

  const getCurrentOpening = (accountId: string) => {
    const bal = currentBalances.find((b) => b.account_id === accountId);
    return bal?.opening_balance ?? null;
  };

  const isCarriedForward = (accountId: string) => {
    const bal = currentBalances.find((b) => b.account_id === accountId);
    return bal?.is_carried_forward ?? false;
  };

  const carryForwardAll = async () => {
    setIsCarrying(true);
    try {
      const upserts = carryAccounts.map((acc) => ({
        building_id: buildingId,
        account_id: acc.id,
        fiscal_year: fiscalYear,
        opening_balance: getPrevClosing(acc.id),
        closing_balance: getCurrentOpening(acc.id) ?? getPrevClosing(acc.id),
        is_carried_forward: true,
      }));

      const { error } = await supabase.from("account_balances").upsert(upserts, {
        onConflict: "building_id,account_id,fiscal_year",
      });

      if (error) throw error;
      toast.success("Salden erfolgreich übernommen");
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
    } catch (e: any) {
      toast.error("Fehler: " + e.message);
    } finally {
      setIsCarrying(false);
    }
  };

  const updateClosingBalance = async (accountId: string, value: number) => {
    const { error } = await supabase.from("account_balances").upsert({
      building_id: buildingId,
      account_id: accountId,
      fiscal_year: fiscalYear,
      opening_balance: getCurrentOpening(accountId) ?? 0,
      closing_balance: value,
      is_carried_forward: isCarriedForward(accountId),
    }, { onConflict: "building_id,account_id,fiscal_year" });

    if (error) toast.error("Fehler beim Speichern");
    else {
      toast.success("Schlusssaldo gespeichert");
      refetchCurrent();
    }
  };

  const updateOpeningBalance = async (accountId: string, value: number) => {
    const existing = currentBalances.find((b) => b.account_id === accountId);
    const { error } = await supabase.from("account_balances").upsert({
      building_id: buildingId,
      account_id: accountId,
      fiscal_year: fiscalYear,
      opening_balance: value,
      closing_balance: existing?.closing_balance ?? value,
      is_carried_forward: true,
    }, { onConflict: "building_id,account_id,fiscal_year" });

    if (error) toast.error("Fehler beim Speichern");
    else {
      toast.success("Anfangsbestand gespeichert");
      refetchCurrent();
    }
  };

  const allCarried = carryAccounts.length > 0 && carryAccounts.every((acc) => isCarriedForward(acc.id));
  const hasPrevData = prevBalances.length > 0;

  const formatCurrency = (val: number | null) =>
    val !== null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val) : "–";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Saldenübernahme</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Übernahme der Schlusssalden aus {prevYear} als Eröffnungssalden für {fiscalYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allCarried && <Badge className="bg-green-100 text-green-800"><Check className="h-3 w-3 mr-1" /> Übernommen</Badge>}
          {!allCarried && hasPrevData && (
            <Button size="sm" onClick={carryForwardAll} disabled={isCarrying}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isCarrying ? "animate-spin" : ""}`} />
              Salden übernehmen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Hinweis: bevorzugte Quelle ist die Eröffnungsbuchung gegen 4000 */}
        <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 p-3 text-sm mb-4">
          <div className="flex gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-blue-900 dark:text-blue-100 text-xs leading-relaxed">
              Anfangsbestände werden bevorzugt aus <strong>Eröffnungsbuchungen gegen Konto 4000</strong> ermittelt
              (SKR-Standard, z. B. <code className="font-mono">1800 an 4000: 3.510 €</code> zum 01.01.).
              Manuelle Einträge sind nur nötig, wenn keine Eröffnungsbuchung existiert.
            </p>
          </div>
        </div>

        {!hasPrevData && carryAccounts.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm mb-4">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 dark:text-amber-100">Keine Vorjahresdaten</p>
                <p className="text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
                  Für {prevYear} existieren keine Schlusssalden. Wenn du eine Eröffnungsbuchung gegen Konto 4000
                  erfasst hast, wird der Anfangsbestand automatisch erkannt (siehe Spalte „Quelle"). Andernfalls
                  kannst du den Wert manuell in der Spalte „Eröffnung {fiscalYear}" eintragen.
                </p>
              </div>
            </div>
          </div>
        )}
        {carryAccounts.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Keine Bank- oder Rücklagenkonten mit Saldovortrag konfiguriert.
            </p>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
              Aktiviere im <strong>Kontenrahmen</strong>-Tab den Saldovortrag für deine Giro- und Rücklagenkonten (Spalte „Saldo"). Andere Konten (Vorauszahlungen, Abgrenzungen) brauchen keinen manuellen Anfangsbestand — ihr Saldo ergibt sich aus den Buchungen.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Konto</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right w-[140px]">Schluss {prevYear}</TableHead>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="text-right w-[200px]">Eröffnung {fiscalYear}</TableHead>
                <TableHead className="w-[140px]">Quelle</TableHead>
                <TableHead className="text-right w-[160px]">Schluss {fiscalYear}</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carryAccounts.map((acc) => {
                const prevClose = getPrevClosing(acc.id);
                const carried = isCarriedForward(acc.id);
                const currentBal = currentBalances.find((b) => b.account_id === acc.id);

                const effective = getEffectiveOpeningBalance(
                  acc.id,
                  bookings,
                  currentBalances,
                  fiscalYear,
                  openingAccountId,
                );

                const isOverridden = !!overrideMode[acc.id];
                const showInputReadonly = effective.source === "booking_4000" && !isOverridden;
                const displayedOpening = effective.source !== "none" ? effective.amount : (currentBal?.opening_balance ?? null);

                return (
                  <TableRow key={acc.id}>
                    <TableCell className="font-mono text-xs">{acc.account_number}</TableCell>
                    <TableCell className="text-sm">{acc.account_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {hasPrevData ? formatCurrency(prevClose) : "–"}
                    </TableCell>
                    <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell>
                      {showInputReadonly ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-sm">{formatCurrency(effective.amount)}</span>
                        </div>
                      ) : (
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-7 text-xs text-right w-full"
                          defaultValue={displayedOpening != null ? String(displayedOpening).replace(".", ",") : ""}
                          placeholder="0,00"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            if (!raw) return;
                            const val = parseAmount(raw);
                            if (val !== displayedOpening) updateOpeningBalance(acc.id, val);
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {effective.source === "booking_4000" && (
                        <div className="flex flex-col gap-0.5">
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 w-fit">
                            <Check className="h-3 w-3 mr-1" /> Buchung 4000
                          </Badge>
                          {effective.bookingDate && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(effective.bookingDate).toLocaleDateString("de-DE")}
                              {effective.bookingCount && effective.bookingCount > 1 ? ` · ${effective.bookingCount}×` : ""}
                            </span>
                          )}
                          <button
                            type="button"
                            className="text-[10px] text-blue-600 hover:underline text-left"
                            onClick={() => setOverrideMode((m) => ({ ...m, [acc.id]: !isOverridden }))}
                          >
                            {isOverridden ? "Auto übernehmen" : "Manuell überschreiben"}
                          </button>
                        </div>
                      )}
                      {effective.source === "manual" && (
                        <Badge variant="secondary" className="w-fit">Manuell</Badge>
                      )}
                      {effective.source === "none" && (
                        <Badge variant="destructive" className="w-fit">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Fehlt
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-7 text-xs text-right w-full"
                        defaultValue={currentBal?.closing_balance != null ? String(currentBal.closing_balance).replace(".", ",") : ""}
                        placeholder="0,00"
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          if (!raw) return;
                          updateClosingBalance(acc.id, parseAmount(raw));
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {carried && <Check className="h-4 w-4 text-green-600" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
