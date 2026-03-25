import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Flame, AlertTriangle } from "lucide-react";

interface HeatingAccountsSectionProps {
  buildingId: string;
  fiscalYear: number;
}

export function HeatingAccountsSection({ buildingId, fiscalYear }: HeatingAccountsSectionProps) {
  // Heizkosten-relevante Konten
  const { data: heatingAccounts = [] } = useQuery({
    queryKey: ["heating-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("is_heating_relevant", true)
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Buchungen pro Konto für das Jahr
  const { data: bookings = [] } = useQuery({
    queryKey: ["heating-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, amount, booking_category")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
    enabled: heatingAccounts.length > 0,
  });

  // Vorjahres-Buchungen für Vergleich
  const { data: prevBookings = [] } = useQuery({
    queryKey: ["heating-bookings", buildingId, fiscalYear - 1],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, amount, booking_category")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear - 1)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
    enabled: heatingAccounts.length > 0,
  });

  const getAccountTotal = (accountId: string, bkgs: typeof bookings) =>
    bkgs.filter((b) => b.account_id === accountId && b.booking_category !== "heating_repost")
      .reduce((s, b) => s + Math.abs(Number(b.amount)), 0);

  const totalCurrent = heatingAccounts.reduce((s, a) => s + getAccountTotal(a.id, bookings), 0);
  const totalPrev = heatingAccounts.reduce((s, a) => s + getAccountTotal(a.id, prevBookings), 0);
  const yoyChange = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0;

  const formatCurrency = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-5 w-5" /> Heizkosten-relevante Konten
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {heatingAccounts.length} Konten markiert — Gesamt: {formatCurrency(totalCurrent)}
          {totalPrev > 0 && (
            <span className={`ml-2 ${Math.abs(yoyChange) > 10 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
              ({yoyChange > 0 ? "+" : ""}{yoyChange.toFixed(1)}% vs. Vorjahr)
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        {heatingAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Keine Konten als heizkosten-relevant markiert. Aktiviere "HK-relevant" im Kontenrahmen.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Konto</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right">{fiscalYear}</TableHead>
                <TableHead className="text-right">{fiscalYear - 1}</TableHead>
                <TableHead className="text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {heatingAccounts.map((acc) => {
                const curr = getAccountTotal(acc.id, bookings);
                const prev = getAccountTotal(acc.id, prevBookings);
                const diff = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
                const isWarning = Math.abs(diff) > 10 && prev > 0;

                return (
                  <TableRow key={acc.id} className={isWarning ? "bg-amber-50" : ""}>
                    <TableCell className="font-mono text-xs">{acc.account_number}</TableCell>
                    <TableCell className="text-sm">{acc.account_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(curr)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(prev)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {prev > 0 ? (
                        <span className={isWarning ? "text-amber-600 font-medium" : ""}>
                          {isWarning && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                          {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
                        </span>
                      ) : "–"}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-medium border-t-2">
                <TableCell></TableCell>
                <TableCell>Gesamt</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalCurrent)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(totalPrev)}</TableCell>
                <TableCell className="text-right">
                  {totalPrev > 0 && (
                    <span className={Math.abs(yoyChange) > 10 ? "text-amber-600" : ""}>
                      {yoyChange > 0 ? "+" : ""}{yoyChange.toFixed(1)}%
                    </span>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
