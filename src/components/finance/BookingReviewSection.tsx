import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Check, AlertTriangle, CircleDot, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";

interface BookingReviewSectionProps {
  buildingId: string;
  fiscalYear: number;
  periodFrom?: string;
  periodTo?: string;
}

export function BookingReviewSection({ buildingId, fiscalYear, periodFrom, periodTo }: BookingReviewSectionProps) {
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [aiChecking, setAiChecking] = useState(false);
  const [aiResults, setAiResults] = useState<any[] | null>(null);

  // All confirmed bookings for this building/year
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["booking-review", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, chart_of_accounts!bookings_account_id_fkey(id, account_number, account_name, category)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled")
        .order("booking_date");
      if (error) throw error;
      return data;
    },
  });

  // Booking templates for expected recurring costs
  const { data: templates = [] } = useQuery({
    queryKey: ["booking-templates-review", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_templates")
        .select("*")
        .eq("building_id", buildingId);
      if (error) throw error;
      return data;
    },
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  // Group bookings by account category
  const categoryMap = new Map<string, { accounts: Map<string, { account: any; bookings: any[]; total: number }> }>();

  bookings.forEach((b: any) => {
    const cat = b.chart_of_accounts?.category || "Ohne Kategorie";
    const accId = b.account_id || "unknown";
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { accounts: new Map() });
    }
    const catData = categoryMap.get(cat)!;
    if (!catData.accounts.has(accId)) {
      catData.accounts.set(accId, {
        account: b.chart_of_accounts,
        bookings: [],
        total: 0,
      });
    }
    const accData = catData.accounts.get(accId)!;
    accData.bookings.push(b);
    accData.total += Number(b.amount);
  });

  // Calculate expected count from templates
  const getExpectedCount = (accountId: string): { expected: number; label: string } | null => {
    const tmpl = templates.find((t: any) => t.account_id === accountId);
    if (!tmpl) return null;
    const interval = tmpl.interval || "monatlich";
    switch (interval) {
      case "monatlich": return { expected: 12, label: "mtl." };
      case "quartalsweise": return { expected: 4, label: "quartl." };
      case "halbjährlich": return { expected: 2, label: "halbj." };
      case "jährlich": return { expected: 1, label: "jährl." };
      default: return null;
    }
  };

  const toggleAccount = (accId: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      next.has(accId) ? next.delete(accId) : next.add(accId);
      return next;
    });
  };

  const totalBookings = bookings.length;
  const totalAmount = bookings.reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);
  const categories = [...categoryMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (isLoading) return <div className="text-muted-foreground p-4 text-sm">Buchungen werden geladen...</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 mb-2">
        <Badge variant="outline">{totalBookings} Buchungen</Badge>
        <Badge variant="outline">Gesamt: {formatCurrency(totalAmount)}</Badge>
      </div>

      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Keine Buchungen für diesen Zeitraum gefunden.
        </p>
      )}

      {categories.map(([cat, catData]) => {
        const accounts = [...catData.accounts.entries()];
        const catTotal = accounts.reduce((s, [, a]) => s + Math.abs(a.total), 0);

        return (
          <Card key={cat} className="overflow-hidden">
            <div className="p-3 bg-muted/30 flex items-center justify-between">
              <span className="font-medium text-sm">{cat}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{accounts.length} Konten</Badge>
                <span className="text-xs text-muted-foreground font-mono">{formatCurrency(catTotal)}</span>
              </div>
            </div>
            <CardContent className="p-0">
              {accounts.map(([accId, accData]) => {
                const isExpanded = expandedAccounts.has(accId);
                const expected = getExpectedCount(accId);
                const actual = accData.bookings.length;
                const isComplete = expected ? actual >= expected.expected : null;

                return (
                  <div key={accId} className="border-t">
                    <button
                      onClick={() => toggleAccount(accId)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 text-left text-sm transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                      <span className="font-mono text-xs text-muted-foreground w-12 flex-shrink-0">
                        {accData.account?.account_number || "–"}
                      </span>
                      <span className="flex-1 truncate">{accData.account?.account_name || "Unbekannt"}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {expected && (
                          <Badge
                            className={`text-xs ${isComplete ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}`}
                          >
                            {isComplete ? <Check className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                            {actual}/{expected.expected} {expected.label}
                          </Badge>
                        )}
                        {!expected && (
                          <Badge variant="outline" className="text-xs">
                            <CircleDot className="h-3 w-3 mr-1" />
                            {actual} Buchungen
                          </Badge>
                        )}
                        <span className="font-mono text-xs w-24 text-right">{formatCurrency(Math.abs(accData.total))}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Datum</TableHead>
                              <TableHead className="text-xs">Beschreibung</TableHead>
                              <TableHead className="text-xs">Beleg</TableHead>
                              <TableHead className="text-xs text-right">Betrag</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {accData.bookings.map((b: any) => (
                              <TableRow key={b.id}>
                                <TableCell className="text-xs py-1.5">
                                  {format(new Date(b.booking_date), "dd.MM.yy", { locale: de })}
                                </TableCell>
                                <TableCell className="text-xs py-1.5 max-w-[200px] truncate">
                                  {b.description || "–"}
                                </TableCell>
                                <TableCell className="text-xs py-1.5 font-mono">
                                  {b.receipt_number || "–"}
                                </TableCell>
                                <TableCell className="text-xs py-1.5 text-right font-mono">
                                  {formatCurrency(Math.abs(Number(b.amount)))}
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Badge
                                    variant={b.status === "confirmed" ? "default" : "secondary"}
                                    className="text-[10px]"
                                  >
                                    {b.status === "confirmed" ? "Bestätigt" : "Offen"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
