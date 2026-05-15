import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Check, AlertTriangle, CircleDot, BookOpen, Pencil, Settings2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BuildingDistributionKeysTab } from "./BuildingDistributionKeysTab";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAccountAggregation, CATEGORY_LABELS } from "./lib/useAccountAggregation";
import { EditBookingDialog } from "./EditBookingDialog";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef } from "react";
import { StickyNote } from "lucide-react";


interface BookingReviewSectionProps {
  buildingId: string;
  fiscalYear: number;
  periodFrom?: string;
  periodTo?: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export function BookingReviewSection({ buildingId, fiscalYear }: BookingReviewSectionProps) {
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [coaOpen, setCoaOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<any | null>(null);
  const reviewedKey = `booking-review-checked:${buildingId}:${fiscalYear}`;
  const [reviewedAccounts, setReviewedAccounts] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(reviewedKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const toggleReviewed = (accId: string) => {
    setReviewedAccounts(prev => {
      const next = new Set(prev);
      next.has(accId) ? next.delete(accId) : next.add(accId);
      try { localStorage.setItem(reviewedKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const queryClient = useQueryClient();

  // Notes per account (persisted in DB)
  const { data: notesRows = [] } = useQuery({
    queryKey: ["account-review-notes", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_review_notes")
        .select("account_id, note")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (error) throw error;
      return data || [];
    },
  });
  const notesByAccount: Record<string, string> = {};
  for (const r of notesRows as any[]) notesByAccount[r.account_id] = r.note || "";
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const saveTimers = useRef<Record<string, any>>({});
  const getNoteValue = (accId: string) =>
    noteDrafts[accId] !== undefined ? noteDrafts[accId] : (notesByAccount[accId] || "");

  const saveNote = async (accId: string, value: string) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("account_review_notes")
      .upsert(
        {
          building_id: buildingId,
          fiscal_year: fiscalYear,
          account_id: accId,
          note: value,
          updated_by: u?.user?.id || null,
        },
        { onConflict: "building_id,fiscal_year,account_id" }
      );
    if (error) {
      toast.error("Notiz nicht gespeichert: " + error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["account-review-notes", buildingId, fiscalYear] });
  };

  const onNoteChange = (accId: string, value: string) => {
    setNoteDrafts((p) => ({ ...p, [accId]: value }));
    if (saveTimers.current[accId]) clearTimeout(saveTimers.current[accId]);
    saveTimers.current[accId] = setTimeout(() => saveNote(accId, value), 700);
  };

  const { data: building } = useQuery({
    queryKey: ["building-name-review", buildingId],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("name").eq("id", buildingId).maybeSingle();
      return data;
    },
  });

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["booking-review", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          chart_of_accounts!bookings_account_id_fkey(id, account_number, account_name, category),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(id, account_number, account_name, category)
        `)
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled")
        .order("booking_date");
      if (error) throw error;
      return data;
    },
  });

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

  // Identische Logik wie Buchen → Kontenplan-Ansicht
  const { grouped, bookingsByAccount, balanceByAccount } = useAccountAggregation({
    bookings,
    fiscalYear,
    buildingId,
    showAllAccounts: false,
  });

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


  if (isLoading) return <div className="text-muted-foreground p-4 text-sm">Buchungen werden geladen...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 mb-2 items-center">
        <Badge variant="outline">{totalBookings} Buchungen</Badge>
        <Badge variant="outline">Gesamt: {formatCurrency(totalAmount)}</Badge>
        <Button size="sm" variant="outline" onClick={() => setCoaOpen(true)} className="ml-auto">
          <Settings2 className="h-4 w-4 mr-1" />
          Kontenrahmen bearbeiten
        </Button>
      </div>

      <Dialog open={coaOpen} onOpenChange={setCoaOpen}>
        <DialogContent className="max-w-[100vw] w-screen h-screen sm:max-w-[100vw] p-0 gap-0 rounded-none flex flex-col">
          <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
            <h2 className="text-base font-semibold">Kontenrahmen bearbeiten</h2>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {buildingId && <BuildingDistributionKeysTab buildingId={buildingId} />}
          </div>
        </DialogContent>
      </Dialog>

      {grouped.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Keine Buchungen für diesen Zeitraum gefunden.</p>
        </div>
      )}

      {grouped.map(({ category, accounts: catAccounts }) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
            {CATEGORY_LABELS[category] || category}
          </h3>
          <Card className="overflow-hidden divide-y">
            {catAccounts.map((acc) => {
              const accBookings = bookingsByAccount[acc.id] || [];
              const movement = accBookings.reduce((s, b) => {
                const sign = b.booking_type === "income" ? 1 : -1;
                return s + sign * Number(b.amount || 0);
              }, 0);
              const opening = balanceByAccount[acc.id] || 0;
              const closing = opening + movement;
              const isExpanded = expandedAccounts.has(acc.id);
              const expected = getExpectedCount(acc.id);
              const actual = accBookings.length;
              const isComplete = expected ? actual >= expected.expected : null;

              return (
                <Collapsible key={acc.id} open={isExpanded} onOpenChange={() => toggleAccount(acc.id)}>
                  <CollapsibleTrigger asChild>
                    <button className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left",
                      reviewedAccounts.has(acc.id) && "bg-green-50 hover:bg-green-100/60 dark:bg-green-950/20"
                    )}>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-mono tabular-nums text-sm font-semibold w-16">{acc.account_number}</span>
                      <span className="text-sm flex-1 truncate">{acc.account_name}</span>
                      {expected ? (
                        <Badge className={cn(
                          "text-xs",
                          isComplete ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                        )}>
                          {isComplete ? <Check className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                          {actual}/{expected.expected} {expected.label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <CircleDot className="h-3 w-3 mr-1" />
                          {actual} Buch.
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums w-28 text-right">
                        EB: {formatCurrency(opening)}
                      </span>
                      <span className={cn(
                        "text-sm font-mono tabular-nums font-semibold w-32 text-right",
                        movement > 0 ? "text-green-600" : movement < 0 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {movement > 0 ? "+" : ""}{formatCurrency(movement)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums w-28 text-right border-l pl-3">
                        Saldo: {formatCurrency(closing)}
                      </span>
                      {(notesByAccount[acc.id] || "").trim() && (
                        <StickyNote className="h-4 w-4 text-amber-600 ml-1" aria-label="Notiz vorhanden" />
                      )}
                      <span
                        role="checkbox"
                        aria-checked={reviewedAccounts.has(acc.id)}
                        title="Als geprüft markieren"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleReviewed(acc.id); }}
                        className="ml-2 inline-flex items-center"
                      >
                        <Checkbox checked={reviewedAccounts.has(acc.id)} />
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-muted/20 border-t">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs hover:bg-transparent">
                            <TableHead className="py-1.5 px-3 h-8">Datum</TableHead>
                            <TableHead className="py-1.5 px-3 h-8">Beleg</TableHead>
                            <TableHead className="py-1.5 px-3 h-8">Buchungstext</TableHead>
                            <TableHead className="py-1.5 px-3 h-8">Gegenkonto</TableHead>
                            <TableHead className="py-1.5 px-3 h-8 text-right">Betrag</TableHead>
                            <TableHead className="py-1.5 px-3 h-8 w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {accBookings.map((b: any) => {
                            const isIncome = b.booking_type === "income";
                            return (
                              <TableRow key={`${b.id}-${b._side}`} className="text-[13px]">
                                <TableCell className="py-1.5 px-3 whitespace-nowrap tabular-nums">
                                  {format(new Date(b.booking_date), "dd.MM.yyyy", { locale: de })}
                                </TableCell>
                                <TableCell className="py-1.5 px-3 font-mono text-xs">
                                  {b.booking_reference || b.receipt_number || "–"}
                                </TableCell>
                                <TableCell className="py-1.5 px-3 max-w-[400px] truncate">{b.description || "–"}</TableCell>
                                <TableCell className="py-1.5 px-3 font-mono text-xs">
                                  {b.counter_account?.account_number || "–"}
                                  {b.counter_account?.account_name && (
                                    <span className="text-muted-foreground ml-1.5">{b.counter_account.account_name}</span>
                                  )}
                                </TableCell>
                                <TableCell className={cn(
                                  "py-1.5 px-3 font-mono tabular-nums font-semibold whitespace-nowrap text-right",
                                  isIncome ? "text-green-600" : "text-destructive"
                                )}>
                                  {isIncome ? "+" : ""}{formatCurrency(Number(b.amount))}
                                </TableCell>
                                <TableCell className="py-1.5 px-2 text-right">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    title="Buchung bearbeiten"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const original = bookings.find((x: any) => x.id === b.id) || b;
                                      setEditBooking({ ...original, _side: b._side });
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <div className="px-3 py-2 border-t bg-background/40">
                        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
                          <StickyNote className="h-3 w-3" /> Prüfnotiz (z. B. Auffälligkeiten, Klärungsbedarf)
                        </label>
                        <Textarea
                          value={getNoteValue(acc.id)}
                          onChange={(e) => onNoteChange(acc.id, e.target.value)}
                          onBlur={(e) => {
                            if (saveTimers.current[acc.id]) clearTimeout(saveTimers.current[acc.id]);
                            saveNote(acc.id, e.target.value);
                          }}
                          placeholder="Notiz zu diesem Konto…"
                          className="min-h-[60px] text-sm"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </Card>
        </div>
      ))}

      <EditBookingDialog
        open={!!editBooking}
        onOpenChange={(o) => { if (!o) setEditBooking(null); }}
        booking={editBooking}
        buildingName={building?.name || ""}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["booking-review", buildingId, fiscalYear] });
        }}
      />
    </div>
  );
}
