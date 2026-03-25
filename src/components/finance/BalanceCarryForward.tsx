import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ArrowRight, Check, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface BalanceCarryForwardProps {
  buildingId: string;
  fiscalYear: number;
  periodId: string;
}

export function BalanceCarryForward({ buildingId, fiscalYear, periodId }: BalanceCarryForwardProps) {
  const queryClient = useQueryClient();
  const [isCarrying, setIsCarrying] = useState(false);
  const prevYear = fiscalYear - 1;

  // Konten mit carry_forward_balance = true
  const { data: carryAccounts = [] } = useQuery({
    queryKey: ["carry-forward-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("carry_forward_balance", true)
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Vorjahres-Salden
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

  // Aktuelle Salden
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
        {carryAccounts.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Keine Konten mit Saldenübernahme markiert.
            </p>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
              Die Einstellung „Saldovortrag" wird pro Konto im <strong>Kontenrahmen</strong>-Tab konfiguriert (Spalte „Saldo"). Im Gebäude-Hub finden Sie den Kontenrahmen ebenfalls unter dem gleichnamigen Tab.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Konto</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right w-[150px]">Schluss {prevYear}</TableHead>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="text-right w-[150px]">Eröffnung {fiscalYear}</TableHead>
                <TableHead className="text-right w-[180px]">Schluss {fiscalYear}</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carryAccounts.map((acc) => {
                const prevClose = getPrevClosing(acc.id);
                const currOpen = getCurrentOpening(acc.id);
                const carried = isCarriedForward(acc.id);
                const mismatch = carried && currOpen !== null && Math.abs(currOpen - prevClose) > 0.01;
                const currentBal = currentBalances.find((b) => b.account_id === acc.id);

                return (
                  <TableRow key={acc.id} className={mismatch ? "bg-amber-50" : ""}>
                    <TableCell className="font-mono text-xs">{acc.account_number}</TableCell>
                    <TableCell className="text-sm">{acc.account_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {hasPrevData ? formatCurrency(prevClose) : "–"}
                    </TableCell>
                    <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {currOpen !== null ? (
                        <span className={carried ? "text-green-700" : ""}>{formatCurrency(currOpen)}</span>
                      ) : "–"}
                      {mismatch && <AlertTriangle className="h-3 w-3 text-amber-600 inline ml-1" />}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-7 text-xs text-right w-full"
                        defaultValue={currentBal?.closing_balance ?? ""}
                        placeholder="0,00"
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) updateClosingBalance(acc.id, val);
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
