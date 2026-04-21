import { useState, useMemo } from "react";
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
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[] | null>(null);
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
        .select(`
          *,
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name)
        `)
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .eq("booking_category", "accrual")
        .neq("status", "cancelled")
        .order("booking_date");
      if (error) throw error;
      return data;
    },
  });

  // Zusätzlich: Buchungen, die Abgrenzungskonten (1900-1999) als Haupt- oder Gegenkonto nutzen
  const { data: accountBasedAccruals = [] } = useQuery({
    queryKey: ["account-based-accruals", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name)
        `)
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled")
        .order("booking_date");
      if (error) throw error;
      const isAccrualAccount = (n?: string | null) => {
        if (!n) return false;
        const x = Number(n);
        return Number.isFinite(x) && x >= 1900 && x < 2000;
      };
      return (data || []).filter((b: any) =>
        isAccrualAccount(b.chart_of_accounts?.account_number) ||
        isAccrualAccount(b.counter_account?.account_number)
      );
    },
  });

  // Vereinigung beider Listen (dedupliziert per id)
  const allAccrualBookings = useMemo(() => {
    const map = new Map<string, any>();
    [...accrualBookings, ...accountBasedAccruals].forEach((b: any) => map.set(b.id, b));
    return Array.from(map.values()).sort((a, b) =>
      (a.booking_date ?? "").localeCompare(b.booking_date ?? "")
    );
  }, [accrualBookings, accountBasedAccruals]);

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

  const totalAccruals = allAccrualBookings.reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);

  const suggestAccruals = async () => {
    setAiSuggesting(true);
    try {
      const accrualData = potentialAccruals.map((b: any) => ({
        id: b.id,
        date: b.booking_date,
        account: b.chart_of_accounts?.account_number + " " + b.chart_of_accounts?.account_name,
        amount: Number(b.amount),
        ppFrom: b.performance_period_from,
        ppTo: b.performance_period_to,
      }));
      const { data, error } = await supabase.functions.invoke("analyze-billing", {
        body: { buildingId, fiscalYear, periodId: "accrual", mode: "accrual_suggestion", accrualData, yearStart, yearEnd },
      });
      if (error) throw error;
      setAiSuggestions(data?.suggestions || data?.recommendations || []);
      toast.success("KI-Vorschläge erstellt");
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setAiSuggesting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-base">Abgrenzungsbuchungen</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Prüfung von Buchungen mit jahresübergreifendem Leistungszeitraum ({format(new Date(yearStart), "dd.MM.yyyy", { locale: de })} – {format(new Date(yearEnd), "dd.MM.yyyy", { locale: de })})
          </p>
        </div>
        {potentialAccruals.length > 0 && (
          <Button size="sm" variant="outline" onClick={suggestAccruals} disabled={aiSuggesting}>
            {aiSuggesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            KI Abgrenzung vorschlagen
          </Button>
        )}
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
          {allAccrualBookings.length > 0 && (
            <Badge variant="outline">
              {allAccrualBookings.length} Abgrenzungsbuchungen — {formatCurrency(totalAccruals)}
            </Badge>
          )}
        </div>

        {/* AI Suggestions */}
        {aiSuggestions && aiSuggestions.length > 0 && (
          <Card className="border-dashed border-primary/30 bg-primary/5">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> KI-Vorschläge für Abgrenzungsbuchungen
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {aiSuggestions.map((s: any, i: number) => (
                <div key={i} className="text-sm p-2 rounded bg-background border">
                  <div className="font-medium">{s.title || s.description}</div>
                  {s.suggestion && <div className="text-muted-foreground mt-1">{s.suggestion}</div>}
                  {s.amount && <div className="font-mono text-xs mt-1">Betrag: {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(s.amount)}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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

        {allAccrualBookings.length > 0 && (
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
                {allAccrualBookings.map((b: any) => (
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

        {potentialAccruals.length === 0 && allAccrualBookings.length === 0 && wrongYearBookings.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine abgrenzungsrelevanten Buchungen gefunden.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
