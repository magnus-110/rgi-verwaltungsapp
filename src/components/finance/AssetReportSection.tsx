import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Landmark, Droplets, Flame, Package } from "lucide-react";


interface AssetReportSectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

export function AssetReportSection({ buildingId, periodId, fiscalYear }: AssetReportSectionProps) {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  // Bank account balances — robust via settlement_section="bank" mit Fallback auf 1800–1899
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["asset-bank-accounts", buildingId, fiscalYear],
    queryFn: async () => {
      const { data: accounts, error: accErr } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category, settlement_section")
        .or(`building_id.is.null,building_id.eq.${buildingId}`);
      if (accErr) throw accErr;
      const bankAccs = (accounts || []).filter((a: any) => {
        if (a.settlement_section === "bank") return true;
        const num = Number(a.account_number);
        return num >= 1800 && num < 1900;
      });
      if (!bankAccs.length) return [];

      const accountIds = bankAccs.map(a => a.id);
      const { data: balances, error: balErr } = await supabase
        .from("account_balances")
        .select("*")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .in("account_id", accountIds);
      if (balErr) throw balErr;

      return bankAccs.map(acc => {
        const bal = balances?.find(b => b.account_id === acc.id);
        return {
          ...acc,
          closing_balance: bal?.closing_balance ?? 0,
        };
      });
    },
  });

  // Prepayment/accrual accounts (1470-1473)
  const { data: accrualAccounts = [] } = useQuery({
    queryKey: ["asset-accrual-accounts", buildingId, fiscalYear],
    queryFn: async () => {
      const { data: accounts, error: accErr } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .in("account_number", ["1470", "1471", "1472", "1473"]);
      if (accErr) throw accErr;
      if (!accounts?.length) return [];

      const accountIds = accounts.map(a => a.id);
      const { data: balances, error: balErr } = await supabase
        .from("account_balances")
        .select("*")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .in("account_id", accountIds);
      if (balErr) throw balErr;

      return accounts.map(acc => {
        const bal = balances?.find(b => b.account_id === acc.id);
        return {
          ...acc,
          closing_balance: bal?.closing_balance ?? 0,
        };
      });
    },
  });

  // Fuel inventory value
  const { data: fuelValue = 0 } = useQuery({
    queryKey: ["asset-fuel-value", buildingId, periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuel_inventory" as any)
        .select("end_value_eur")
        .eq("building_id", buildingId)
        .eq("billing_period_id", periodId)
        .maybeSingle();
      if (error) return 0;
      return Number((data as any)?.end_value_eur ?? 0);
    },
  });

  // Reserve account balance
  const { data: reserveAccounts = [] } = useQuery({
    queryKey: ["asset-reserve-accounts", buildingId, fiscalYear],
    queryFn: async () => {
      const { data: accounts, error: accErr } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .ilike("account_name", "%Rücklage%");
      if (accErr) throw accErr;
      if (!accounts?.length) return [];

      const accountIds = accounts.map(a => a.id);
      const { data: balances, error: balErr } = await supabase
        .from("account_balances")
        .select("*")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .in("account_id", accountIds);
      if (balErr) throw balErr;

      return accounts.map(acc => {
        const bal = balances?.find(b => b.account_id === acc.id);
        return { ...acc, closing_balance: bal?.closing_balance ?? 0 };
      });
    },
  });

  const bankTotal = bankAccounts.reduce((s, a) => s + a.closing_balance, 0);
  const accrualTotal = accrualAccounts.reduce((s, a) => s + a.closing_balance, 0);
  const reserveTotal = reserveAccounts.reduce((s, a) => s + a.closing_balance, 0);
  const grandTotal = bankTotal + accrualTotal + fuelValue + reserveTotal;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Übersicht über das Vermögen der WEG zum Stichtag des Geschäftsjahres {fiscalYear}.
      </p>

      {/* Bankkonten */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Bankkonten
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {bankAccounts.map(acc => (
                <TableRow key={acc.id}>
                  <TableCell className="text-xs font-mono">{acc.account_number}</TableCell>
                  <TableCell className="text-sm">{acc.account_name}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.closing_balance)}</TableCell>
                </TableRow>
              ))}
              {bankAccounts.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-xs text-muted-foreground text-center">Keine Bankkonten gefunden</TableCell></TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-medium text-sm">Summe Bankkonten</TableCell>
                <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(bankTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Rücklagen */}
      {reserveAccounts.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" /> Erhaltungsrücklage
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {reserveAccounts.map(acc => (
                  <TableRow key={acc.id}>
                    <TableCell className="text-xs font-mono">{acc.account_number}</TableCell>
                    <TableCell className="text-sm">{acc.account_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.closing_balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium text-sm">Summe Rücklagen</TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(reserveTotal)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Abgrenzungen */}
      {accrualAccounts.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Droplets className="h-4 w-4" /> Vorauszahlungen & Abgrenzungen
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {accrualAccounts.map(acc => (
                  <TableRow key={acc.id}>
                    <TableCell className="text-xs font-mono">{acc.account_number}</TableCell>
                    <TableCell className="text-sm">{acc.account_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.closing_balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium text-sm">Summe Vorauszahlungen</TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(accrualTotal)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Brennstoff */}
      {fuelValue > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="h-4 w-4" /> Brennstoffbestand
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-sm">Restbestand Brennstoff</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(fuelValue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Grand Total */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Gesamtvermögen der WEG</span>
            <span className="text-lg font-bold font-mono">{formatCurrency(grandTotal)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
