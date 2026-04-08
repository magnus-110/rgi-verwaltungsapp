import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, Calendar, CreditCard, Hash, ArrowRightLeft, CheckCircle2, Lightbulb, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AiMatch {
  id: string;
  score: number;
  reason: string;
}

interface SuggestedBooking {
  account_number?: string;
  account_name?: string;
  account_id?: string;
  amount: number;
  booking_type: "income" | "expense";
  description: string;
  related_template_id?: string;
  related_invoice_id?: string;
}

interface BookingHint {
  type: "split" | "partial" | "simple";
  explanation: string;
  suggested_bookings: SuggestedBooking[];
}

interface AssignmentDialogProps {
  transaction: any | null;
  onClose: () => void;
  invoicesList: any[];
  templatesList: any[];
  allTransactions?: any[];
  showMatchedInvoices: boolean;
  setShowMatchedInvoices: (v: boolean) => void;
  onAssign: (type: "invoice" | "template", id: string) => Promise<void>;
  onCreateBookings?: (hint: BookingHint, transaction: any) => void;
}

export function AssignmentDialog({
  transaction,
  onClose,
  invoicesList,
  templatesList,
  allTransactions,
  showMatchedInvoices,
  setShowMatchedInvoices,
  onAssign,
  onCreateBookings,
}: AssignmentDialogProps) {
  const [tab, setTab] = useState<"invoice" | "template">("invoice");
  const [selectedId, setSelectedId] = useState<string>("");
  const [aiMatches, setAiMatches] = useState<AiMatch[]>([]);
  const [bookingHint, setBookingHint] = useState<BookingHint | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Reset state when transaction changes
  useEffect(() => {
    if (transaction) {
      setSelectedId("");
      setTab("invoice");
      setAiMatches([]);
      setBookingHint(null);
      fetchAiSuggestions();
    }
  }, [transaction?.id]);

  const fetchAiSuggestions = useCallback(async () => {
    if (!transaction || (invoicesList.length === 0 && templatesList.length === 0)) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-match", {
        body: {
          transaction: {
            amount: transaction.amount,
            creditor_name: transaction.creditor_name,
            debtor_name: transaction.debtor_name,
            creditor_iban: transaction.creditor_iban,
            debtor_iban: transaction.debtor_iban,
            purpose: transaction.purpose,
            booking_date: transaction.booking_date,
          },
          invoices: invoicesList.slice(0, 50).map((inv: any) => ({
            id: inv.id,
            invoice_number: inv.invoice_number,
            vendor_name: inv.vendor_name,
            gross_amount: inv.gross_amount,
            vendor_iban: inv.vendor_iban,
            invoice_date: inv.invoice_date,
          })),
          templates: templatesList.slice(0, 30).map((t: any) => ({
            id: t.id,
            name: t.name,
            vendor_name: t.vendor_name,
            expected_amount: t.expected_amount,
            vendor_iban: t.vendor_iban,
            interval: t.interval,
            account_id: t.account_id,
            account_number: t.account_number,
            account_name: t.account_name,
          })),
          allTransactions: (allTransactions || [])
            .filter((t: any) => !t.booked_at && t.match_status === "unmatched")
            .slice(0, 30)
            .map((t: any) => ({
              id: t.id,
              amount: t.amount,
              creditor_name: t.creditor_name,
              debtor_name: t.debtor_name,
              purpose: t.purpose,
              booking_date: t.booking_date,
              match_status: t.match_status,
            })),
        },
      });
      if (data?.matches) {
        setAiMatches(data.matches);
      }
      if (data?.booking_hint) {
        setBookingHint(data.booking_hint);
      }
    } catch (err) {
      console.error("AI suggest error:", err);
    } finally {
      setAiLoading(false);
    }
  }, [transaction, invoicesList, templatesList, allTransactions]);

  const aiMatchMap = useMemo(() => {
    const map = new Map<string, AiMatch>();
    aiMatches.forEach((m) => map.set(m.id, m));
    return map;
  }, [aiMatches]);

  const sortedInvoices = useMemo(() => {
    return [...invoicesList].sort((a, b) => {
      const aScore = aiMatchMap.get(a.id)?.score ?? -1;
      const bScore = aiMatchMap.get(b.id)?.score ?? -1;
      return bScore - aScore;
    });
  }, [invoicesList, aiMatchMap]);

  const sortedTemplates = useMemo(() => {
    return [...templatesList].sort((a, b) => {
      const aScore = aiMatchMap.get(a.id)?.score ?? -1;
      const bScore = aiMatchMap.get(b.id)?.score ?? -1;
      return bScore - aScore;
    });
  }, [templatesList, aiMatchMap]);

  const handleAssign = async () => {
    if (!selectedId) return;
    setAssigning(true);
    await onAssign(tab, selectedId);
    setAssigning(false);
  };

  if (!transaction) return null;

  const txnName = transaction.amount < 0 ? transaction.creditor_name : transaction.debtor_name;
  const txnIban = transaction.amount < 0 ? transaction.creditor_iban : transaction.debtor_iban;
  const candidates = tab === "invoice" ? sortedInvoices : sortedTemplates;

  const hintTypeLabel: Record<string, string> = {
    split: "Sammelbuchung",
    partial: "Teilzahlung",
    simple: "Einfache Zuordnung",
  };

  const hintTypeColor: Record<string, string> = {
    split: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    partial: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    simple: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
  };

  return (
    <Dialog open={!!transaction} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-6xl w-full h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transaktion zuordnen
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* LEFT: Transaction details + KI hint */}
          <div className="w-[40%] border-r flex flex-col min-h-0">
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Betrag</p>
                  <p className={cn("text-3xl font-bold font-mono", transaction.amount < 0 ? "text-destructive" : "text-green-600 dark:text-green-400")}>
                    {transaction.amount < 0 ? "" : "+"}{Number(transaction.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Buchungsdatum
                    </p>
                    <p className="text-sm font-medium">{format(new Date(transaction.booking_date), "dd. MMMM yyyy", { locale: de })}</p>
                  </div>
                  {transaction.value_date && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Wertstellung</p>
                      <p className="text-sm font-medium">{format(new Date(transaction.value_date), "dd.MM.yyyy")}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    {transaction.amount < 0 ? "Empfänger" : "Auftraggeber"}
                  </p>
                  <p className="text-base font-semibold">{txnName || "–"}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> IBAN
                  </p>
                  <p className="text-sm font-mono">{txnIban || "–"}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1">
                    <Hash className="h-3 w-3" /> Verwendungszweck
                  </p>
                  <p className="text-sm leading-relaxed bg-background p-3 rounded-md border">
                    {transaction.purpose || "Kein Verwendungszweck"}
                  </p>
                </div>

                {transaction.end_to_end_ref && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Ende-zu-Ende-Referenz</p>
                    <p className="text-xs font-mono">{transaction.end_to_end_ref}</p>
                  </div>
                )}

                {/* KI Booking Hint Panel */}
                {aiLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 px-4 bg-muted/50 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <Sparkles className="h-4 w-4" />
                    KI analysiert Buchungskontext…
                  </div>
                )}

                {bookingHint && !aiLoading && (
                  <div className={cn("rounded-lg border p-4 space-y-3", hintTypeColor[bookingHint.type] || "bg-muted/30 border-border")}>
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-sm font-semibold">KI-Buchungshinweis</span>
                      <Badge variant="outline" className="text-[10px]">
                        {hintTypeLabel[bookingHint.type] || bookingHint.type}
                      </Badge>
                    </div>

                    <p className="text-sm leading-relaxed">{bookingHint.explanation}</p>

                    {bookingHint.suggested_bookings.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Vorgeschlagene Buchungen</p>
                        {bookingHint.suggested_bookings.map((sb, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-background rounded-md border p-3 text-sm">
                            <div className="min-w-0 flex-1">
                              {sb.account_number && (
                                <p className="font-mono text-xs text-muted-foreground">{sb.account_number} {sb.account_name}</p>
                              )}
                              <p className="truncate">{sb.description}</p>
                            </div>
                            <span className={cn(
                              "font-mono font-semibold ml-3 whitespace-nowrap",
                              sb.booking_type === "income" ? "text-green-600 dark:text-green-400" : "text-destructive"
                            )}>
                              {sb.booking_type === "income" ? "+" : "-"}{Number(sb.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {onCreateBookings && bookingHint.suggested_bookings.length > 0 && (
                      <Button
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => onCreateBookings(bookingHint, transaction)}
                      >
                        <BookOpen className="h-4 w-4" />
                        {bookingHint.suggested_bookings.length === 1
                          ? "Als manuelle Buchung anlegen"
                          : `${bookingHint.suggested_bookings.length} Buchungen anlegen`}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* RIGHT: Candidates */}
          <div className="w-[60%] flex flex-col min-h-0">
            <div className="px-4 pt-4 pb-3 border-b space-y-3">
              <Tabs value={tab} onValueChange={(v) => { setTab(v as "invoice" | "template"); setSelectedId(""); }}>
                <TabsList variant="segment" className="w-full">
                  <TabsTrigger variant="segment" value="invoice" className="flex-1">
                    Rechnungen ({invoicesList.length})
                  </TabsTrigger>
                  <TabsTrigger variant="segment" value="template" className="flex-1">
                    Vorlagen ({templatesList.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {tab === "invoice" && (
                <div className="flex items-center gap-2">
                  <Switch checked={showMatchedInvoices} onCheckedChange={setShowMatchedInvoices} id="show-matched-split" />
                  <Label htmlFor="show-matched-split" className="text-xs text-muted-foreground cursor-pointer">
                    Bereits zugeordnete anzeigen
                  </Label>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {aiLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 px-3 bg-muted/50 rounded-md mb-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <Sparkles className="h-4 w-4" />
                    KI analysiert Kandidaten…
                  </div>
                )}

                {candidates.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm">Keine {tab === "invoice" ? "Rechnungen" : "Vorlagen"} verfügbar</p>
                  </div>
                ) : (
                  candidates.map((item: any) => {
                    const match = aiMatchMap.get(item.id);
                    const isSelected = selectedId === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedId(isSelected ? "" : item.id)}
                        className={cn(
                          "w-full text-left p-4 rounded-lg border-2 transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : match
                              ? "border-primary/30 bg-primary/5 hover:border-primary/50"
                              : "border-border hover:border-muted-foreground/30 hover:bg-accent/30"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-1">
                            {tab === "invoice" ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">{item.invoice_number || "Ohne Nr."}</span>
                                  {match && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 gap-1">
                                      <Sparkles className="h-3 w-3" />KI-Vorschlag
                                    </Badge>
                                  )}
                                  {isSelected && (
                                    <CheckCircle2 className="h-4 w-4 text-primary ml-auto flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-sm text-foreground">{item.vendor_name || "–"}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="font-mono font-medium text-foreground">
                                    {item.gross_amount ? `${Number(item.gross_amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"}
                                  </span>
                                  <span>{item.vendor_iban || "Keine IBAN"}</span>
                                  {item.invoice_date && <span>{format(new Date(item.invoice_date), "dd.MM.yyyy")}</span>}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">{item.name}</span>
                                  {match && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 gap-1">
                                      <Sparkles className="h-3 w-3" />KI-Vorschlag
                                    </Badge>
                                  )}
                                  {isSelected && (
                                    <CheckCircle2 className="h-4 w-4 text-primary ml-auto flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-sm text-foreground">{item.vendor_name || "–"}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="font-mono font-medium text-foreground">
                                    {item.expected_amount ? `${Number(item.expected_amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"}
                                  </span>
                                  <span>{item.vendor_iban || "Keine IBAN"}</span>
                                  {item.interval && <span>Intervall: {item.interval}</span>}
                                </div>
                              </>
                            )}
                            {match && (
                              <p className="text-xs text-primary/80 italic mt-1">„{match.reason}"</p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleAssign} disabled={!selectedId || assigning}>
            {assigning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Zuordnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
