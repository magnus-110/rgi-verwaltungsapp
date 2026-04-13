import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft, ArrowRight, CheckCircle, X,
  FileText, LayoutTemplate, Loader2, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionReviewModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: any[];
  buildingId: string;
  initialIndex?: number;
}

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

// Field order for Enter navigation
const FIELD_ORDER = [
  "account_id", "amount", "counter_account_id", "description",
  "booking_reference", "booking_date", "receipt_number", "vat_rate"
];

export function TransactionReviewMode({ open, onOpenChange, transactions, buildingId, initialIndex }: TransactionReviewModeProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bookedCount, setBookedCount] = useState(0);
  const [bookingSingle, setBookingSingle] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  // Booking form state
  const [formData, setFormData] = useState<{
    account_id: string;
    counter_account_id: string;
    amount: string;
    vat_rate: string;
    vat_amount: string;
    description: string;
    booking_reference: string;
    booking_date: string;
    receipt_number: string;
    booking_type: string;
    is_35a_relevant: boolean;
    amount_35a: string;
    fiscal_year: number;
    invoice_id: string | null;
    matched_template_id: string | null;
  }>({
    account_id: "", counter_account_id: "", amount: "", vat_rate: "19",
    vat_amount: "", description: "", booking_reference: "KI", booking_date: "",
    receipt_number: "", booking_type: "expense", is_35a_relevant: false,
    amount_35a: "", fiscal_year: new Date().getFullYear(),
    invoice_id: null, matched_template_id: null,
  });

  const currentTxn = transactions[currentIndex];

  // Load chart of accounts for the building
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts-review", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category, default_vat_rate, is_35a_relevant, settlement_35a_type")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
    enabled: open && !!buildingId,
  });

  // Load invoice details
  const { data: invoiceDetail } = useQuery({
    queryKey: ["txn-review-invoice", currentTxn?.matched_invoice_id],
    queryFn: async () => {
      if (!currentTxn?.matched_invoice_id) return null;
      const { data } = await supabase
        .from("invoices")
        .select("id, file_path, file_name, vendor_name, gross_amount, net_amount, vat_amount, invoice_number, invoice_date, description, suggested_account_id, line_items")
        .eq("id", currentTxn.matched_invoice_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!currentTxn?.matched_invoice_id,
  });

  // Load template details
  const { data: templateDetail } = useQuery({
    queryKey: ["txn-review-template", currentTxn?.matched_template_id],
    queryFn: async () => {
      if (!currentTxn?.matched_template_id) return null;
      const { data } = await supabase
        .from("booking_templates")
        .select("id, name, vendor_name, expected_amount, amount_tolerance, vat_rate, interval, category, description, account_id, is_35a_relevant, chart_of_accounts(account_number, account_name)")
        .eq("id", currentTxn.matched_template_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!currentTxn?.matched_template_id,
  });

  // Load PDF for invoice
  useEffect(() => {
    setPdfUrl(null);
    if (!invoiceDetail?.file_path) return;
    const loadPdf = async () => {
      const cleanPath = invoiceDetail.file_path.replace(/^\/+/, "").replace(/^invoices\//, "");
      const { data } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    };
    loadPdf();
  }, [invoiceDetail?.file_path]);

  // Auto-fill form when transaction changes
  useEffect(() => {
    if (!currentTxn) return;
    
    const txnDate = currentTxn.booking_date;
    const fiscalYear = txnDate ? new Date(txnDate).getFullYear() : new Date().getFullYear();
    const absAmount = Math.abs(currentTxn.amount);
    const isIncome = currentTxn.amount > 0;

    // Find bank account (1800 Bankkonto as default MAIN account - "von diesem Konto")
    const bankAccount = accounts.find(a => a.account_number === "1800") || accounts.find(a => a.account_number === "1200") || accounts.find(a => a.category === "Bankkonto");
    const defaultBankAccountId = bankAccount?.id || "";

    // Start with defaults: Konto = 1800 (Bank), Gegenkonto = leer (wird befüllt)
    let newForm = {
      account_id: defaultBankAccountId,
      counter_account_id: "",
      amount: absAmount.toFixed(2),
      vat_rate: "19",
      vat_amount: "",
      description: "",
      booking_reference: "KI",
      booking_date: txnDate || "",
      receipt_number: "",
      booking_type: isIncome ? "income" : "expense",
      is_35a_relevant: false,
      amount_35a: "",
      fiscal_year: fiscalYear,
      invoice_id: currentTxn.matched_invoice_id || null,
      matched_template_id: currentTxn.matched_template_id || null,
    };

    // Auto-fill from TEMPLATE (deterministic, no AI)
    if (templateDetail) {
      if (templateDetail.account_id) newForm.counter_account_id = templateDetail.account_id;
      if (templateDetail.vat_rate != null) newForm.vat_rate = String(templateDetail.vat_rate);
      if (templateDetail.is_35a_relevant) newForm.is_35a_relevant = true;
      newForm.description = templateDetail.name || "";
      newForm.matched_template_id = templateDetail.id;

      // Calculate VAT
      const vatRate = templateDetail.vat_rate || 0;
      if (vatRate > 0) {
        const vatAmount = absAmount - (absAmount / (1 + vatRate / 100));
        newForm.vat_amount = vatAmount.toFixed(2);
      }
    }

    // Auto-fill from INVOICE (deterministic, no AI)
    if (invoiceDetail) {
      if (invoiceDetail.suggested_account_id) newForm.counter_account_id = invoiceDetail.suggested_account_id;
      if (invoiceDetail.vat_amount != null) newForm.vat_amount = String(Math.abs(invoiceDetail.vat_amount));
      if (invoiceDetail.invoice_number) newForm.receipt_number = invoiceDetail.invoice_number;
      newForm.description = [invoiceDetail.vendor_name, invoiceDetail.invoice_number].filter(Boolean).join(" ");
      newForm.invoice_id = invoiceDetail.id;

      // Calculate VAT rate from invoice amounts
      if (invoiceDetail.gross_amount && invoiceDetail.net_amount) {
        const vatPct = ((invoiceDetail.gross_amount / invoiceDetail.net_amount) - 1) * 100;
        newForm.vat_rate = String(Math.round(vatPct));
      }
    }

    // Auto-fill from AI SUGGESTION (for unmatched transactions)
    if (!templateDetail && !invoiceDetail && currentTxn.ai_suggestion) {
      const suggestion = currentTxn.ai_suggestion;
      if (suggestion.booking_hint?.suggested_bookings?.[0]) {
        const sb = suggestion.booking_hint.suggested_bookings[0];
        if (sb.account_id) newForm.counter_account_id = sb.account_id;
        if (sb.account_number) {
          const acc = accounts.find(a => a.account_number === sb.account_number);
          if (acc) newForm.counter_account_id = acc.id;
        }
        if (sb.description) newForm.description = sb.description;
        if (sb.booking_type) newForm.booking_type = sb.booking_type;
      }
    }

    // Set VAT rate-based defaults from counter account
    if (newForm.counter_account_id) {
      const selectedCounterAcc = accounts.find(a => a.id === newForm.counter_account_id);
      if (selectedCounterAcc?.default_vat_rate != null && !invoiceDetail && !templateDetail) {
        newForm.vat_rate = String(selectedCounterAcc.default_vat_rate);
      }
      if (selectedCounterAcc?.is_35a_relevant) {
        newForm.is_35a_relevant = true;
      }
    }

    setFormData(newForm);
  }, [currentTxn?.id, templateDetail, invoiceDetail, accounts, currentTxn?.ai_suggestion]);

  // Recalculate VAT amount when rate or amount changes
  useEffect(() => {
    const amount = parseFloat(formData.amount) || 0;
    const vatRate = parseFloat(formData.vat_rate) || 0;
    if (vatRate > 0 && amount > 0 && !invoiceDetail?.vat_amount) {
      const vatAmount = amount - (amount / (1 + vatRate / 100));
      setFormData(f => ({ ...f, vat_amount: vatAmount.toFixed(2) }));
    }
  }, [formData.amount, formData.vat_rate]);

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData(f => ({ ...f, [field]: value }));
  };

  const handleEnterNavigation = (e: React.KeyboardEvent, currentField: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const idx = FIELD_ORDER.indexOf(currentField);
      if (idx >= 0 && idx < FIELD_ORDER.length - 1) {
        const nextField = FIELD_ORDER[idx + 1];
        const el = fieldRefs.current[nextField];
        if (el) {
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
            el.focus();
          } else {
            // For Select components, find the trigger button
            const trigger = el.querySelector('button');
            trigger?.focus();
          }
        }
      } else if (idx === FIELD_ORDER.length - 1) {
        // Last field - trigger booking
        handleBook();
      }
    }
  };

  const handleBook = useCallback(async () => {
    if (!currentTxn || bookingSingle || !user) return;
    
    if (!formData.account_id) {
      toast.error("Bitte ein Konto auswählen");
      return;
    }

    setBookingSingle(true);
    try {
      const amount = parseFloat(formData.amount) || 0;
      const vatRate = parseFloat(formData.vat_rate) || 0;
      const vatAmount = parseFloat(formData.vat_amount) || 0;
      const amount35a = formData.is_35a_relevant && formData.amount_35a ? parseFloat(formData.amount_35a) : null;

      // Create booking directly in Supabase
      const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
        building_id: buildingId,
        account_id: formData.account_id,
        counter_account_id: formData.counter_account_id || null,
        amount,
        vat_rate: vatRate,
        vat_amount: vatAmount > 0 ? vatAmount : null,
        description: formData.description || null,
        booking_reference: formData.booking_reference || "KI",
        booking_date: formData.booking_date,
        receipt_number: formData.receipt_number || null,
        booking_type: formData.booking_type,
        fiscal_year: formData.fiscal_year,
        invoice_id: formData.invoice_id,
        matched_template_id: formData.matched_template_id,
        is_35a_relevant: formData.is_35a_relevant,
        amount_35a: amount35a,
        source: "bank_import",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        created_by: user.id,
      } as any).select("id").single();

      if (bookingError) throw bookingError;

      // Mark transaction as booked
      await supabase.from("bank_transactions").update({
        booked_at: new Date().toISOString(),
        booking_id: booking.id,
      }).eq("id", currentTxn.id);

      setBookedCount(c => c + 1);
      toast.success("Gebucht ✓", { duration: 1500 });
      
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ queryKey: ["bookings-pending"] });
      queryClient.invalidateQueries({ queryKey: ["bookings-confirmed"] });

      // Move to next
      if (currentIndex < transactions.length - 1) {
        setCurrentIndex(i => i + 1);
      }
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setBookingSingle(false);
    }
  }, [currentTxn, bookingSingle, user, formData, buildingId, currentIndex, transactions.length, queryClient]);

  const handleNext = useCallback(() => {
    if (currentIndex < transactions.length - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, transactions.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  // Keyboard shortcuts (only when no input is focused)
  useEffect(() => {
    if (!open) return;
    const keyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.getAttribute("role") === "combobox";
      
      if (isInput) return; // Let form fields handle their own events
      
      if (e.key === "ArrowRight") { e.preventDefault(); handleNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); handlePrev(); }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [open, handleNext, handlePrev]);

  const amountMatch = useMemo(() => {
    if (!currentTxn) return false;
    if (invoiceDetail?.gross_amount != null) {
      return Math.abs(Math.abs(currentTxn.amount) - Math.abs(invoiceDetail.gross_amount)) < 0.01;
    }
    if (templateDetail?.expected_amount != null) {
      const tol = (templateDetail as any).amount_tolerance || 0;
      return Math.abs(Math.abs(currentTxn.amount) - Math.abs(templateDetail.expected_amount)) <= tol;
    }
    return false;
  }, [currentTxn, invoiceDetail, templateDetail]);

  const progressPercent = transactions.length > 0
    ? ((bookedCount) / (bookedCount + transactions.length)) * 100
    : 100;

  useEffect(() => { setCurrentIndex(initialIndex ?? 0); setBookedCount(0); }, [open, initialIndex]);

  // Determine source type for current transaction
  const sourceType = useMemo(() => {
    if (!currentTxn) return "none";
    if (currentTxn.matched_invoice_id) return "invoice";
    if (currentTxn.matched_template_id) return "template";
    if (currentTxn.ai_suggestion) return "ai";
    return "manual";
  }, [currentTxn]);

  // Selected account display
  const selectedAccount = accounts.find(a => a.id === formData.account_id);
  const selectedCounterAccount = accounts.find(a => a.id === formData.counter_account_id);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] max-h-[94vh] w-full h-[94vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1" /> Schließen
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <span className="text-sm font-medium">
              {transactions.length > 0 ? currentIndex + 1 : 0} / {transactions.length}
            </span>
            {bookedCount > 0 && (
              <Badge variant="default" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                {bookedCount} gebucht
              </Badge>
            )}
            <Separator orientation="vertical" className="h-6" />
            <Progress value={progressPercent} className="w-32 h-2" />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">Enter</kbd>
            <span className="text-[11px]">Nächstes Feld</span>
            <span className="mx-1 text-border">|</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">←</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">→</kbd>
            <span className="text-[11px]">Nav</span>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <CheckCircle className="h-16 w-16 opacity-30" />
            <p className="text-lg font-medium">Alle Transaktionen verarbeitet!</p>
            <p className="text-sm">{bookedCount} Buchungen erstellt.</p>
            <Button onClick={() => onOpenChange(false)}>Schließen</Button>
          </div>
        ) : currentTxn ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Transaction details + Booking mask */}
            <div className="w-1/2 border-r overflow-y-auto">
              {/* Transaction summary (compact) */}
              <div className="p-4 bg-muted/20 border-b space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(currentTxn.booking_date), "dd.MM.yyyy", { locale: de })}
                    </span>
                    {amountMatch && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">✓ Betrag</Badge>}
                    {sourceType !== "manual" && (
                      <Badge variant="outline" className={cn("text-xs", sourceType === "invoice" ? "bg-green-50 text-green-700" : sourceType === "template" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700")}>
                        {sourceType === "invoice" && <><FileText className="h-3 w-3 mr-1" />Rechnung</>}
                        {sourceType === "template" && <><LayoutTemplate className="h-3 w-3 mr-1" />Vorlage</>}
                        {sourceType === "ai" && <><Sparkles className="h-3 w-3 mr-1" />KI-Vorschlag</>}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={currentIndex === 0} onClick={handlePrev}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={currentIndex >= transactions.length - 1} onClick={handleNext}>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className={cn("text-2xl font-bold", currentTxn.amount < 0 ? "text-destructive" : "text-green-600")}>
                  {currentTxn.amount < 0 ? "" : "+"}{formatCurrency(currentTxn.amount)}
                </div>
                <p className="text-sm">{currentTxn.purpose || "–"}</p>
              </div>

              {/* Booking mask */}
              <div className="p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Buchung</h4>

                {/* Account (prominent) */}
                <div ref={el => fieldRefs.current["account_id"] = el}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Konto</label>
                  <Select value={formData.account_id} onValueChange={v => handleFieldChange("account_id", v)}>
                    <SelectTrigger className="h-11 text-base font-medium" onKeyDown={e => handleEnterNavigation(e, "account_id")}>
                      <SelectValue placeholder="Konto wählen…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {accounts.filter(a => a.category !== "Bankkonto").map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono mr-2">{a.account_number}</span>
                          {a.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Booking type buttons + Amount */}
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-muted-foreground">Typ</label>
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.booking_type === "expense" ? "default" : "outline"}
                    className={cn("h-8 px-3 font-bold", formData.booking_type === "expense" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                    onClick={() => handleFieldChange("booking_type", "expense")}
                  >
                    − Ausgabe
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.booking_type === "income" ? "default" : "outline"}
                    className={cn("h-8 px-3 font-bold", formData.booking_type === "income" && "bg-green-600 hover:bg-green-700 text-white")}
                    onClick={() => handleFieldChange("booking_type", "income")}
                  >
                    + Einnahme
                  </Button>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Betrag (€)</label>
                  <Input
                    ref={el => fieldRefs.current["amount"] = el}
                    className={cn("h-11 text-lg font-bold", formData.booking_type === "income" ? "text-green-600" : "text-destructive")}
                    value={formData.amount}
                    onChange={e => handleFieldChange("amount", e.target.value)}
                    onKeyDown={e => handleEnterNavigation(e, "amount")}
                  />
                  {parseFloat(formData.vat_amount) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      davon MwSt: {formatCurrency(parseFloat(formData.vat_amount))} ({formData.vat_rate}%)
                    </p>
                  )}
                </div>

                {/* Counter account (prominent) */}
                <div ref={el => fieldRefs.current["counter_account_id"] = el}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Gegenkonto</label>
                  <Select value={formData.counter_account_id} onValueChange={v => handleFieldChange("counter_account_id", v)}>
                    <SelectTrigger className="h-11 text-base font-medium" onKeyDown={e => handleEnterNavigation(e, "counter_account_id")}>
                      <SelectValue placeholder="Gegenkonto wählen…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono mr-2">{a.account_number}</span>
                          {a.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Buchungstext</label>
                  <Input
                    ref={el => fieldRefs.current["description"] = el}
                    className="h-10"
                    value={formData.description}
                    onChange={e => handleFieldChange("description", e.target.value)}
                    onKeyDown={e => handleEnterNavigation(e, "description")}
                  />
                </div>

                {/* Compact row: Kürzel, Beleg-Datum, Beleg-Nr, MwSt */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Kürzel</label>
                    <Input
                      ref={el => fieldRefs.current["booking_reference"] = el}
                      className="h-9 text-sm font-mono"
                      value={formData.booking_reference}
                      onChange={e => handleFieldChange("booking_reference", e.target.value)}
                      onKeyDown={e => handleEnterNavigation(e, "booking_reference")}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Beleg-Datum</label>
                    <Input
                      ref={el => fieldRefs.current["booking_date"] = el}
                      type="date"
                      className="h-9 text-sm"
                      value={formData.booking_date}
                      onChange={e => handleFieldChange("booking_date", e.target.value)}
                      onKeyDown={e => handleEnterNavigation(e, "booking_date")}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Beleg-Nr.</label>
                    <Input
                      ref={el => fieldRefs.current["receipt_number"] = el}
                      className="h-9 text-sm"
                      value={formData.receipt_number}
                      onChange={e => handleFieldChange("receipt_number", e.target.value)}
                      onKeyDown={e => handleEnterNavigation(e, "receipt_number")}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">MwSt %</label>
                    <Select value={formData.vat_rate} onValueChange={v => handleFieldChange("vat_rate", v)}>
                      <SelectTrigger 
                        className="h-9 text-sm"
                        ref={el => fieldRefs.current["vat_rate"] = el}
                        onKeyDown={e => handleEnterNavigation(e, "vat_rate")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="7">7%</SelectItem>
                        <SelectItem value="19">19%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* §35a - only shown when relevant */}
                {(formData.is_35a_relevant || (selectedAccount?.is_35a_relevant)) && (
                  <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={formData.is_35a_relevant}
                        onCheckedChange={v => handleFieldChange("is_35a_relevant", !!v)}
                      />
                      <label className="text-sm font-medium">§35a-relevant</label>
                    </div>
                    {formData.is_35a_relevant && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Lohnanteil (€)</label>
                        <Input
                          className="h-9 w-40 text-sm"
                          placeholder="0,00"
                          value={formData.amount_35a}
                          onChange={e => handleFieldChange("amount_35a", e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={handleBook} disabled={bookingSingle || !formData.account_id} className="flex-1 h-11">
                    {bookingSingle ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Buchen & Weiter
                  </Button>
                  <Button variant="outline" onClick={handleNext} disabled={currentIndex >= transactions.length - 1}>
                    Überspringen <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Right: PDF or Template details */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              {invoiceDetail ? (
                <>
                  <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-2 shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Rechnung</span>
                    {invoiceDetail.vendor_name && <Badge variant="outline" className="text-xs">{invoiceDetail.vendor_name}</Badge>}
                  </div>
                  <div className="px-4 py-2 border-b space-y-1 shrink-0">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">Brutto</span>
                        <p className={cn("font-medium", amountMatch && "text-green-600")}>{formatCurrency(invoiceDetail.gross_amount)}</p>
                      </div>
                      {invoiceDetail.invoice_number && (
                        <div>
                          <span className="text-xs text-muted-foreground">Re-Nr.</span>
                          <p className="font-medium">{invoiceDetail.invoice_number}</p>
                        </div>
                      )}
                      {invoiceDetail.invoice_date && (
                        <div>
                          <span className="text-xs text-muted-foreground">Re-Datum</span>
                          <p className="font-medium">{format(new Date(invoiceDetail.invoice_date), "dd.MM.yyyy", { locale: de })}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {pdfUrl ? (
                    <iframe src={pdfUrl} className="flex-1 w-full border-0" title="Rechnung PDF" />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                      PDF wird geladen...
                    </div>
                  )}
                </>
              ) : templateDetail ? (
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <LayoutTemplate className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Zugeordnete Vorlage</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <DetailField label="Name" value={templateDetail.name} />
                    {(templateDetail as any).vendor_name && <DetailField label="Lieferant" value={(templateDetail as any).vendor_name} />}
                    {templateDetail.expected_amount != null && (
                      <DetailField label="Erwarteter Betrag" value={
                        <span className={cn(amountMatch && "text-green-600")}>
                          {formatCurrency(templateDetail.expected_amount)}
                          {(templateDetail as any).amount_tolerance > 0 && ` ±${formatCurrency((templateDetail as any).amount_tolerance)}`}
                        </span>
                      } />
                    )}
                    {(templateDetail as any).chart_of_accounts && (
                      <DetailField label="Konto" value={`${(templateDetail as any).chart_of_accounts.account_number} – ${(templateDetail as any).chart_of_accounts.account_name}`} />
                    )}
                    {templateDetail.vat_rate != null && <DetailField label="MwSt" value={`${templateDetail.vat_rate}%`} />}
                    {templateDetail.interval && <DetailField label="Intervall" value={templateDetail.interval} />}
                    {templateDetail.description && <DetailField label="Beschreibung" value={templateDetail.description} />}
                  </div>
                </div>
              ) : currentTxn.ai_suggestion ? (
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold">KI-Analyse</h3>
                  </div>
                  {currentTxn.ai_suggestion.matches?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Mögliche Zuordnungen:</p>
                      {currentTxn.ai_suggestion.matches.map((m: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm">
                          <span>{m.reason}</span>
                          <Badge variant="outline" className="text-xs">{Math.round(m.score * 100)}%</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {currentTxn.ai_suggestion.booking_hint?.explanation && (
                    <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 text-sm">
                      {currentTxn.ai_suggestion.booking_hint.explanation}
                    </div>
                  )}
                  {currentTxn.ai_suggestion.missing_invoice_hint && (
                    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 text-sm">
                      <p className="font-medium text-orange-800 dark:text-orange-200">Rechnung fehlt</p>
                      <p className="text-orange-700 dark:text-orange-300 mt-1">{currentTxn.ai_suggestion.missing_invoice_hint.explanation}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <FileText className="h-12 w-12 opacity-20" />
                  <p className="text-sm">Kein Beleg zugeordnet</p>
                  <p className="text-xs">Bitte Konto manuell auswählen</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
