import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[] | null>(null);
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const yearStart = periodFrom || `${fiscalYear}-01-01`;
  const yearEnd = periodTo || `${fiscalYear}-12-31`;

  // Abgrenzungskonten 4900 (ARA) / 4910 (PRA) für Auto-Buchung
  const { data: accrualAccounts = [] } = useQuery({
    queryKey: ["accrual-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name")
        .in("account_number", ["4900", "4910"])
        .or(`building_id.is.null,building_id.eq.${buildingId}`);
      if (error) throw error;
      return data || [];
    },
  });

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
        return Number.isFinite(x) && x >= 4000 && x < 5000;
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

  /**
   * Akzeptiert einen KI-Vorschlag und legt automatisch die Abgrenzungsbuchung
   * gegen Konto 4900 (ARA, aktiv) bzw. 4910 (PRA, passiv) an.
   *
   * Erwartete Felder im Vorschlag (defensive Verarbeitung):
   *   - bookingId / id: Quellbuchung
   *   - amount: abzugrenzender Betrag (positiv)
   *   - type: 'ara' | 'pra' (Default: 'ara' = aktiv = Aufwand reduzieren / ins Folgejahr)
   *   - expenseAccountId: Aufwandskonto (optional, sonst account_id der Quellbuchung)
   *   - description: Buchungstext
   */
  const acceptSuggestion = async (s: any, idx: number) => {
    setAcceptingIdx(idx);
    try {
      const sourceId = s.bookingId || s.id || s.source_id;
      const source = sourceId ? bookings.find((b: any) => b.id === sourceId) : null;
      const amount = Math.abs(Number(s.amount ?? source?.amount ?? 0));
      if (!amount || !source) {
        toast.error("Vorschlag unvollständig — bitte manuell buchen");
        return;
      }
      const type: "ara" | "pra" = (s.type === "pra" ? "pra" : "ara");
      const accrualAccountNumber = type === "ara" ? "4900" : "4910";
      const accrualAccount = accrualAccounts.find((a: any) => a.account_number === accrualAccountNumber);
      if (!accrualAccount) {
        toast.error(`Konto ${accrualAccountNumber} nicht gefunden`);
        return;
      }
      const expenseAccountId = s.expenseAccountId || source.account_id;
      if (!expenseAccountId) {
        toast.error("Aufwandskonto unbekannt");
        return;
      }

      // ARA: 4900 an Aufwandskonto (Aufwand reduzieren, Aktivposten aufbauen)
      // PRA: Aufwandskonto an 4910 (Aufwand erhöhen, Passivposten aufbauen)
      const accountId = type === "ara" ? accrualAccount.id : expenseAccountId;
      const counterAccountId = type === "ara" ? expenseAccountId : accrualAccount.id;

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("bookings").insert({
        building_id: buildingId,
        fiscal_year: fiscalYear,
        booking_date: yearEnd,
        amount,
        account_id: accountId,
        counter_account_id: counterAccountId,
        booking_category: "accrual",
        booking_type: "abgrenzung",
        description: s.description || `Abgrenzung ${type.toUpperCase()} aus Buchung vom ${source.booking_date}`,
        status: "confirmed",
        source: "manual",
        created_by: user?.id,
      });
      if (error) throw error;

      toast.success(`Abgrenzungsbuchung (${type.toUpperCase()}) angelegt`);
      // Vorschlag entfernen
      setAiSuggestions((prev) => (prev || []).filter((_, i) => i !== idx));
      queryClient.invalidateQueries({ queryKey: ["accrual-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["account-based-accruals"] });
      queryClient.invalidateQueries({ queryKey: ["accrual-check-bookings"] });
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setAcceptingIdx(null);
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
                <div key={i} className="text-sm p-2 rounded bg-background border flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{s.title || s.description}</div>
                    {s.suggestion && <div className="text-muted-foreground mt-1">{s.suggestion}</div>}
                    {s.amount && <div className="font-mono text-xs mt-1">Betrag: {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(s.amount)}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => acceptSuggestion(s, i)}
                    disabled={acceptingIdx === i}
                    className="flex-shrink-0"
                  >
                    {acceptingIdx === i ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                    Buchen
                  </Button>
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
