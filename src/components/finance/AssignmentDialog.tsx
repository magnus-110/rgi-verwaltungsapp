import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Loader2, Sparkles, Calendar, CreditCard, Hash, ArrowRightLeft, CheckCircle2, Lightbulb, BookOpen, Plus, ChevronDown, LayoutTemplate, Save, Eye, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InvoiceDetailSheet } from "./InvoiceDetailSheet";

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

interface TemplateSuggestion {
  name: string;
  vendor_name: string;
  vendor_iban?: string;
  expected_amount: number;
  interval?: string;
  account_number?: string;
  account_name?: string;
  description: string;
}

interface MissingInvoiceHint {
  vendor_name: string;
  expected_invoice_description?: string;
  last_invoice_date?: string;
  explanation: string;
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
  onOpenBookingDialog?: (prefill: any, hintIndex?: number) => void;
  onCreateTemplate?: (template: any, transaction: any) => Promise<void>;
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
  onOpenBookingDialog,
  onCreateTemplate,
}: AssignmentDialogProps) {
  const [tab, setTab] = useState<"invoice" | "template">("invoice");
  const [selectedId, setSelectedId] = useState<string>("");
  const [aiMatches, setAiMatches] = useState<AiMatch[]>([]);
  const [bookingHint, setBookingHint] = useState<BookingHint | null>(null);
  const [templateSuggestion, setTemplateSuggestion] = useState<TemplateSuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Editable template state
  const [editableTemplate, setEditableTemplate] = useState<TemplateSuggestion | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [dismissedHintIndices, setDismissedHintIndices] = useState<Set<number>>(new Set());
  const [missingInvoiceHint, setMissingInvoiceHint] = useState<MissingInvoiceHint | null>(null);

  // Fetch accounts for template combobox - filtered by building
  const txnBuildingId = transaction?.building_id;
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts-assign", txnBuildingId],
    queryFn: async () => {
      let query = supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category");
      if (txnBuildingId) {
        query = query.or(`building_id.is.null,building_id.eq.${txnBuildingId}`);
      }
      const { data, error } = await query.order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Reset state when transaction changes
  useEffect(() => {
    if (transaction) {
      setSelectedId("");
      setTab("invoice");
      setAiMatches([]);
      setBookingHint(null);
      setTemplateSuggestion(null);
      setMissingInvoiceHint(null);
      setEditableTemplate(null);
      setShowTemplateForm(false);
      setDismissedHintIndices(new Set());
      fetchAiSuggestions();
    }
  }, [transaction?.id]);

  // Handle dismissed hint from parent (via _dismissHintIndex flag)
  useEffect(() => {
    if (transaction?._dismissHintIndex !== undefined && transaction._dismissHintIndex !== null) {
      setDismissedHintIndices(prev => new Set(prev).add(transaction._dismissHintIndex));
    }
  }, [transaction?._dismissHintIndex]);

  // Sync editable template from suggestion
  useEffect(() => {
    if (templateSuggestion) {
      setEditableTemplate({ ...templateSuggestion });
      setShowTemplateForm(true);
    }
  }, [templateSuggestion]);

  const fetchAiSuggestions = useCallback(async () => {
    if (!transaction || (invoicesList.length === 0 && templatesList.length === 0)) return;
    setAiLoading(true);
    try {
      const { loadSuggestMatchContext, loadHistoricalBookings, buildSuggestMatchPayload } = await import("@/hooks/useSuggestMatchContext");
      const buildingId = transaction.building_id;

      // Load full context if we have a building
      let payload: any;
      if (buildingId) {
        const ctx = await loadSuggestMatchContext(buildingId);
        const historicalBookings = await loadHistoricalBookings(buildingId, transaction);
        payload = buildSuggestMatchPayload(transaction, ctx, allTransactions || [], historicalBookings);
      } else {
        // Fallback: minimal context without building
        payload = {
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
            id: inv.id, invoice_number: inv.invoice_number, vendor_name: inv.vendor_name,
            gross_amount: inv.gross_amount, vendor_iban: inv.vendor_iban, invoice_date: inv.invoice_date,
          })),
          templates: templatesList.slice(0, 30).map((t: any) => ({
            id: t.id, name: t.name, vendor_name: t.vendor_name,
            expected_amount: t.expected_amount, vendor_iban: t.vendor_iban,
            interval: t.interval, account_id: t.account_id,
            account_number: t.account_number, account_name: t.account_name,
          })),
          allTransactions: (allTransactions || [])
            .filter((t: any) => !t.booked_at && t.match_status === "unmatched")
            .slice(0, 30),
        };
      }

      const { data, error } = await supabase.functions.invoke("suggest-match", {
        body: payload,
      });
      if (data?.matches) setAiMatches(data.matches);
      if (data?.booking_hint) setBookingHint(data.booking_hint);
      if (data?.template_suggestion) setTemplateSuggestion(data.template_suggestion);
      if (data?.missing_invoice_hint) setMissingInvoiceHint(data.missing_invoice_hint);
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

  const handleOpenBooking = (sb: SuggestedBooking, hintIndex: number) => {
    if (!onOpenBookingDialog || !transaction) return;
    const acc = sb.account_number ? accounts.find(a => a.account_number === sb.account_number) : null;
    onOpenBookingDialog({
      account_id: sb.account_id || acc?.id || "",
      amount: sb.amount,
      booking_type: sb.booking_type,
      description: sb.description,
      booking_date: transaction.booking_date,
      related_template_id: sb.related_template_id,
    }, hintIndex);
  };

  const handleInitTemplateForm = () => {
    if (!transaction) return;
    const txnName = transaction.amount < 0 ? transaction.creditor_name : transaction.debtor_name;
    const txnIban = transaction.amount < 0 ? transaction.creditor_iban : transaction.debtor_iban;
    setEditableTemplate({
      name: txnName || "",
      vendor_name: txnName || "",
      vendor_iban: txnIban || "",
      expected_amount: Math.abs(transaction.amount),
      interval: "monatlich",
      description: transaction.purpose || "",
    });
    setShowTemplateForm(true);
  };

  const handleCreateTemplate = async () => {
    if (!onCreateTemplate || !editableTemplate || !transaction) return;
    setCreatingTemplate(true);
    await onCreateTemplate(editableTemplate, transaction);
    setCreatingTemplate(false);
    setEditableTemplate(null);
    setShowTemplateForm(false);
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
    <>
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

                {/* KI Loading */}
                {aiLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 px-4 bg-muted/50 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <Sparkles className="h-4 w-4" />
                    KI analysiert Buchungskontext…
                  </div>
                )}

                {/* KI Booking Hint Panel */}
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
                        {bookingHint.suggested_bookings.map((sb, idx) => {
                          if (dismissedHintIndices.has(idx)) return null;
                          return (
                          <div key={idx} className="bg-background rounded-md border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant={sb.booking_type === "income" ? "default" : "destructive"} className="text-[10px]">
                                  {sb.booking_type === "income" ? "Einnahme" : "Ausgabe"}
                                </Badge>
                                {sb.account_number && (
                                  <span className="font-mono text-xs text-muted-foreground">{sb.account_number} {sb.account_name}</span>
                                )}
                              </div>
                              <span className={cn(
                                "font-mono font-semibold text-sm",
                                sb.booking_type === "income" ? "text-green-600 dark:text-green-400" : "text-destructive"
                              )}>
                                {sb.booking_type === "income" ? "+" : "-"}{Number(sb.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                              </span>
                            </div>
                            <p className="text-sm">{sb.description}</p>
                            {onOpenBookingDialog && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full gap-1 text-xs h-7"
                                onClick={() => handleOpenBooking(sb, idx)}
                              >
                                <BookOpen className="h-3 w-3" />
                                Als Buchung anlegen
                              </Button>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Missing Invoice Hint Banner */}
                {missingInvoiceHint && !aiLoading && (
                  <div className="rounded-lg border p-4 space-y-2 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-2">
                      <FileWarning className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-sm font-semibold">Rechnung fehlt</span>
                    </div>
                    <p className="text-sm leading-relaxed">{missingInvoiceHint.explanation}</p>
                    {missingInvoiceHint.expected_invoice_description && (
                      <p className="text-xs text-muted-foreground">
                        Erwartet: <span className="font-medium">{missingInvoiceHint.expected_invoice_description}</span>
                      </p>
                    )}
                    {missingInvoiceHint.last_invoice_date && (
                      <p className="text-xs text-muted-foreground">
                        Letzte Rechnung: {missingInvoiceHint.last_invoice_date}
                      </p>
                    )}
                  </div>
                )}

                {/* Template Form */}
                {showTemplateForm && editableTemplate && !aiLoading && (
                  <div className="rounded-lg border p-4 space-y-3 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800">
                    <div className="flex items-center gap-2">
                      <LayoutTemplate className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      <span className="text-sm font-semibold">Vorlage erstellen</span>
                      {templateSuggestion && <Badge variant="outline" className="text-[10px]">KI-Vorschlag</Badge>}
                    </div>

                    {editableTemplate.description && (
                      <p className="text-xs text-muted-foreground">{editableTemplate.description}</p>
                    )}

                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={editableTemplate.name}
                          onChange={(e) => setEditableTemplate(prev => prev ? { ...prev, name: e.target.value } : null)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Lieferant</Label>
                          <Input
                            value={editableTemplate.vendor_name}
                            onChange={(e) => setEditableTemplate(prev => prev ? { ...prev, vendor_name: e.target.value } : null)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">IBAN</Label>
                          <Input
                            value={editableTemplate.vendor_iban || ""}
                            onChange={(e) => setEditableTemplate(prev => prev ? { ...prev, vendor_iban: e.target.value } : null)}
                            className="h-8 text-sm font-mono"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Betrag (€)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editableTemplate.expected_amount}
                            onChange={(e) => setEditableTemplate(prev => prev ? { ...prev, expected_amount: parseFloat(e.target.value) || 0 } : null)}
                            className="h-8 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Intervall</Label>
                          <Input
                            value={editableTemplate.interval || ""}
                            onChange={(e) => setEditableTemplate(prev => prev ? { ...prev, interval: e.target.value } : null)}
                            className="h-8 text-sm"
                            placeholder="monatlich"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Konto</Label>
                        <AccountCombobox
                          accounts={accounts}
                          value={editableTemplate.account_number}
                          onChange={(accNum, accName) => setEditableTemplate(prev => prev ? { ...prev, account_number: accNum, account_name: accName } : null)}
                        />
                      </div>
                    </div>

                    {onCreateTemplate && (
                      <Button
                        size="sm"
                        className="w-full gap-2"
                        variant="default"
                        disabled={creatingTemplate || !editableTemplate.name}
                        onClick={handleCreateTemplate}
                      >
                        {creatingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Vorlage erstellen & zuordnen
                      </Button>
                    )}
                  </div>
                )}

                {/* Always-visible "Create Template" button when no AI suggestion */}
                {!showTemplateForm && !aiLoading && onCreateTemplate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={handleInitTemplateForm}
                  >
                    <Plus className="h-4 w-4" />
                    Neue Vorlage aus Transaktion erstellen
                  </Button>
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
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 ml-auto shrink-0"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!item.file_path) {
                                        toast.error("Originaldatei nicht verfügbar");
                                        return;
                                      }
                                      const { data, error } = await supabase.storage.from("building-documents").createSignedUrl(item.file_path, 600);
                                      if (error || !data?.signedUrl) {
                                        toast.error("Datei konnte nicht geöffnet werden");
                                        return;
                                      }
                                      const win = window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                                      if (!win) toast.error("Bitte Pop-ups erlauben");
                                    }}
                                    title="Rechnung in neuem Tab öffnen"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
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

    <InvoiceDetailSheet
      invoiceId={previewInvoiceId}
      onClose={() => setPreviewInvoiceId(null)}
      buildings={[]}
    />
  </>
  );
}

// ---- Sub-component for template account selection ----

function AccountCombobox({ accounts, value, onChange }: {
  accounts: any[];
  value?: string;
  onChange: (accountNumber: string, accountName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.account_number === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-normal">
          {selected ? `${selected.account_number} ${selected.account_name}` : "Konto wählen…"}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Konto suchen…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>Kein Konto gefunden</CommandEmpty>
            <CommandGroup>
              {accounts.map(acc => (
                <CommandItem
                  key={acc.id}
                  value={`${acc.account_number} ${acc.account_name}`}
                  onSelect={() => { onChange(acc.account_number, acc.account_name); setOpen(false); }}
                  className="text-xs"
                >
                  <span className="font-mono mr-2">{acc.account_number}</span>
                  {acc.account_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
