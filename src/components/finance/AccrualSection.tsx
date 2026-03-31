import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Check, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface AccrualSectionProps {
  buildingId: string;
  fiscalYear: number;
  periodFrom?: string;
  periodTo?: string;
}

export function AccrualSection({ buildingId, fiscalYear, periodFrom, periodTo }: AccrualSectionProps) {
  const yearStart = periodFrom || `${fiscalYear}-01-01`;
  const yearEnd = periodTo || `${fiscalYear}-12-31`;

  const { data: bookings = [] } = useQuery({
    queryKey: ["accrual-check-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, chart_of_accounts!bookings_account_id_fkey(account_number, account_name)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled")
        .order("booking_date");
      if (error) throw error;
      return data;
    },
  });

  const { data: accrualBookings = [] } = useQuery({
    queryKey: ["accrual-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, chart_of_accounts!bookings_account_id_fkey(account_number, account_name)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .eq("booking_category", "accrual")
        .neq("status", "cancelled")
        .order("booking_date");
      if (error) throw error;
      return data;
    },
  });

  const potentialAccruals = bookings.filter((b: any) => {
    if (b.booking_category === "accrual" || b.booking_category === "heating_repost") return false;
    const ppFrom = b.performance_period_from;
    const ppTo = b.performance_period_to;
    if (!ppFrom || !ppTo) return false;
    return ppFrom < yearStart || ppTo > yearEnd;
  });

  const wrongYearBookings = bookings.filter((b: any) => {
    if (b.booking_category === "accrual" || b.booking_category === "heating_repost") return false;
    const bDate = b.booking_date;
    const bYear = new Date(bDate).getFullYear();
    return bYear !== fiscalYear;
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const totalAccruals = accrualBookings.reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Abgrenzungsbuchungen</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Prüfung von Buchungen mit jahresübergreifendem Leistungszeitraum ({format(new Date(yearStart), "dd.MM.yyyy", { locale: de })} – {format(new Date(yearEnd), "dd.MM.yyyy", { locale: de })})
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {potentialAccruals.length > 0 ? (
            <Badge className="bg-amber-100 text-amber-800">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {potentialAccruals.length} Buchungen mit jahresübergreifendem Leistungszeitraum
            </Badge>
          ) : (
            <Badge className="bg-green-100 text-green-800">
              <Check className="h-3 w-3 mr-1" /> Keine offenen Abgrenzungen erkannt
            </Badge>
          )}
          {wrongYearBookings.length > 0 && (
            <Badge className="bg-amber-100 text-amber-800">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {wrongYearBookings.length} Buchungen mit abweichendem Buchungsjahr
            </Badge>
          )}
          {accrualBookings.length > 0 && (
            <Badge variant="outline">
              {accrualBookings.length} Abgrenzungsbuchungen — {formatCurrency(totalAccruals)}
            </Badge>
          )}
        </div>

        {potentialAccruals.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Prüfbedarf: Jahresübergreifende Leistungszeiträume</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Konto</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Leistungszeitraum</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {potentialAccruals.map((b: any) => (
                  <TableRow key={b.id} className="bg-amber-50/50">
                    <TableCell className="text-sm">
                      {format(new Date(b.booking_date), "dd.MM.yyyy", { locale: de })}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{b.chart_of_accounts?.account_number}</span>{" "}
                      <span className="text-muted-foreground">{b.chart_of_accounts?.account_name}</span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{b.description || "–"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.performance_period_from && format(new Date(b.performance_period_from), "dd.MM.yy", { locale: de })}
                      {" – "}
                      {b.performance_period_to && format(new Date(b.performance_period_to), "dd.MM.yy", { locale: de })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(Math.abs(Number(b.amount)))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {accrualBookings.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Vorhandene Abgrenzungsbuchungen</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Konto</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accrualBookings.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm">
                      {format(new Date(b.booking_date), "dd.MM.yyyy", { locale: de })}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{b.chart_of_accounts?.account_number}</span>{" "}
                      <span className="text-muted-foreground">{b.chart_of_accounts?.account_name}</span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{b.description || "–"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(Math.abs(Number(b.amount)))}</TableCell>
                    <TableCell>
                      <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                        {b.status === "confirmed" ? "Bestätigt" : "Offen"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {potentialAccruals.length === 0 && accrualBookings.length === 0 && wrongYearBookings.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine abgrenzungsrelevanten Buchungen gefunden.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
