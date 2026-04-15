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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft, ArrowRight, CheckCircle, X,
  FileText, LayoutTemplate, Loader2, Sparkles,
  ChevronDown, ChevronRight, Plus, Trash2, User, PackagePlus
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionReviewModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: any[];
  buildingId: string;
  initialIndex?: number;
}

interface BookingRowData {
  id: string;
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
  booked: boolean;
}

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

const FIELD_ORDER = [
  "account_id", "amount", "counter_account_id", "description",
  "booking_reference", "booking_date", "receipt_number", "vat_rate"
];

let rowIdCounter = 0;
const nextRowId = () => `row-${++rowIdCounter}`;

export function TransactionReviewMode({ open, onOpenChange, transactions, buildingId, initialIndex }: TransactionReviewModeProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bookedCount, setBookedCount] = useState(0);
  const [bookingSingle, setBookingSingle] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  // Multi-row booking state
  const [formRows, setFormRows] = useState<BookingRowData[]>([]);

  const currentTxn = transactions[currentIndex];

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

  // IBAN lookup: match debtor/creditor IBAN against contact_bank_accounts
  const ibanToMatch = currentTxn?.amount > 0 ? currentTxn?.debtor_iban : currentTxn?.creditor_iban;
  const counterpartyName = currentTxn?.amount > 0 ? currentTxn?.debtor_name : currentTxn?.creditor_name;
  const counterpartyLabel = currentTxn?.amount > 0 ? "Absender" : "Empfänger";

  const { data: ibanMatch } = useQuery({
    queryKey: ["iban-match", ibanToMatch, buildingId],
    queryFn: async () => {
      if (!ibanToMatch) return null;
      const normalizedIban = ibanToMatch.replace(/\s/g, "").toUpperCase();
      const { data: bankAccounts } = await supabase
        .from("contact_bank_accounts")
        .select("id, iban, account_holder, contact_id")
        .ilike("iban", normalizedIban);
      if (!bankAccounts || bankAccounts.length === 0) return null;

      const contactId = bankAccounts[0].contact_id;

      // Get contact name
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_name, contact_type")
        .eq("id", contactId)
        .maybeSingle();

      // Get building assignment for unit info
      const { data: assignment } = await supabase
        .from("contact_building_assignments")
        .select("unit_number, role_in_building, floor_location")
        .eq("contact_id", contactId)
        .eq("building_id", buildingId)
        .maybeSingle();

      const displayName = contact?.company_name
        ? contact.company_name
        : [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || bankAccounts[0].account_holder || "Unbekannt";

      return {
        contactName: displayName,
        unitNumber: assignment?.unit_number || null,
        role: assignment?.role_in_building || null,
        iban: normalizedIban,
      };
    },
    enabled: open && !!ibanToMatch,
  });

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

  // Create a default booking row
  const createDefaultRow = useCallback((overrides?: Partial<BookingRowData>): BookingRowData => {
    const txnDate = currentTxn?.booking_date || "";
    const fiscalYear = txnDate ? new Date(txnDate).getFullYear() : new Date().getFullYear();
    const absAmount = Math.abs(currentTxn?.amount || 0);
    const isIncome = (currentTxn?.amount || 0) > 0;
    const bankAccount = accounts.find(a => a.account_number === "1800") || accounts.find(a => a.account_number === "1200") || accounts.find(a => a.category === "Bankkonto");

    return {
      id: nextRowId(),
      account_id: bankAccount?.id || "",
      counter_account_id: "",
      amount: absAmount.toFixed(2),
      vat_rate: "19",
      vat_amount: "",
      description: "",
      booking_reference: "KI",
      booking_date: txnDate,
      receipt_number: "",
      booking_type: isIncome ? "income" : "expense",
      is_35a_relevant: false,
      amount_35a: "",
      fiscal_year: fiscalYear,
      invoice_id: currentTxn?.matched_invoice_id || null,
      matched_template_id: currentTxn?.matched_template_id || null,
      booked: false,
      ...overrides,
    };
  }, [currentTxn, accounts]);

  // Auto-fill form rows when transaction changes
  useEffect(() => {
    if (!currentTxn || accounts.length === 0) return;

    const txnDate = currentTxn.booking_date;
    const fiscalYear = txnDate ? new Date(txnDate).getFullYear() : new Date().getFullYear();
    const absAmount = Math.abs(currentTxn.amount);
    const isIncome = currentTxn.amount > 0;
    const bankAccount = accounts.find(a => a.account_number === "1800") || accounts.find(a => a.account_number === "1200") || accounts.find(a => a.category === "Bankkonto");
    const defaultBankAccountId = bankAccount?.id || "";

    // Check for AI split suggestion
    const aiSuggestion = currentTxn.ai_suggestion;
    const suggestedBookings = aiSuggestion?.booking_hint?.suggested_bookings;
    const isSplit = aiSuggestion?.booking_hint?.type === "split" && suggestedBookings?.length > 1;

    if (isSplit) {
      // Multiple booking rows from AI
      const rows: BookingRowData[] = suggestedBookings.map((sb: any, idx: number) => {
        let counterAccountId = "";
        if (sb.account_id) counterAccountId = sb.account_id;
        if (sb.account_number) {
          const acc = accounts.find(a => a.account_number === sb.account_number);
          if (acc) counterAccountId = acc.id;
        }

        const rowAmount = sb.amount != null ? Math.abs(sb.amount) : absAmount / suggestedBookings.length;

        return {
          id: nextRowId(),
          account_id: defaultBankAccountId,
          counter_account_id: counterAccountId,
          amount: rowAmount.toFixed(2),
          vat_rate: sb.vat_rate != null ? String(sb.vat_rate) : "19",
          vat_amount: "",
          description: sb.description || "",
          booking_reference: "KI",
          booking_date: txnDate || "",
          receipt_number: sb.receipt_number || "",
          booking_type: sb.booking_type || (isIncome ? "income" : "expense"),
          is_35a_relevant: sb.is_35a_relevant || false,
          amount_35a: "",
          fiscal_year: fiscalYear,
          invoice_id: null,
          matched_template_id: sb.template_id || null,
          booked: false,
        };
      });
      setFormRows(rows);
      setExpandedRowId(rows[0]?.id || null);
      return;
    }

    // Single booking row
    const row = createDefaultRow();

    // Auto-fill from template
    if (templateDetail) {
      if (templateDetail.account_id) row.counter_account_id = templateDetail.account_id;
      if (templateDetail.vat_rate != null) row.vat_rate = String(templateDetail.vat_rate);
      if (templateDetail.is_35a_relevant) row.is_35a_relevant = true;
      row.description = templateDetail.name || "";
      row.matched_template_id = templateDetail.id;
      const vatRate = templateDetail.vat_rate || 0;
      if (vatRate > 0) {
        const vatAmount = absAmount - (absAmount / (1 + vatRate / 100));
        row.vat_amount = vatAmount.toFixed(2);
      }
    }

    // Auto-fill from invoice
    if (invoiceDetail) {
      if (invoiceDetail.suggested_account_id) row.counter_account_id = invoiceDetail.suggested_account_id;
      if (invoiceDetail.vat_amount != null) row.vat_amount = String(Math.abs(invoiceDetail.vat_amount));
      if (invoiceDetail.invoice_number) row.receipt_number = invoiceDetail.invoice_number;
      row.description = [invoiceDetail.vendor_name, invoiceDetail.invoice_number].filter(Boolean).join(" ");
      row.invoice_id = invoiceDetail.id;
      if (invoiceDetail.gross_amount && invoiceDetail.net_amount) {
        const vatPct = ((invoiceDetail.gross_amount / invoiceDetail.net_amount) - 1) * 100;
        row.vat_rate = String(Math.round(vatPct));
      }
    }

    // Auto-fill from single AI suggestion
    if (!templateDetail && !invoiceDetail && aiSuggestion) {
      if (suggestedBookings?.[0]) {
        const sb = suggestedBookings[0];
        if (sb.account_id) row.counter_account_id = sb.account_id;
        if (sb.account_number) {
          const acc = accounts.find(a => a.account_number === sb.account_number);
          if (acc) row.counter_account_id = acc.id;
        }
        if (sb.description) row.description = sb.description;
        if (sb.booking_type) row.booking_type = sb.booking_type;
      }
      // Auto-fill from template_suggestion if no other source
      if (!suggestedBookings?.[0] && aiSuggestion.template_suggestion) {
        const ts = aiSuggestion.template_suggestion;
        if (ts.account_number) {
          const acc = accounts.find(a => a.account_number === ts.account_number);
          if (acc) row.counter_account_id = acc.id;
        }
        if (ts.name) row.description = ts.name;
      }
    }

    // VAT defaults from counter account
    if (row.counter_account_id) {
      const selectedCounterAcc = accounts.find(a => a.id === row.counter_account_id);
      if (selectedCounterAcc?.default_vat_rate != null && !invoiceDetail && !templateDetail) {
        row.vat_rate = String(selectedCounterAcc.default_vat_rate);
      }
      if (selectedCounterAcc?.is_35a_relevant) {
        row.is_35a_relevant = true;
      }
    }

    setFormRows([row]);
    setExpandedRowId(row.id);
  }, [currentTxn?.id, templateDetail, invoiceDetail, accounts, currentTxn?.ai_suggestion]);

  const updateRow = (rowId: string, field: string, value: string | boolean) => {
    setFormRows(rows => rows.map(r => r.id === rowId ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    const newRow = createDefaultRow({ amount: "0.00" });
    setFormRows(rows => [...rows, newRow]);
    setExpandedRowId(newRow.id);
  };

  const removeRow = (rowId: string) => {
    setFormRows(rows => rows.filter(r => r.id !== rowId));
    if (expandedRowId === rowId) setExpandedRowId(null);
  };

  const handleEnterNavigation = (e: React.KeyboardEvent, currentField: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const idx = FIELD_ORDER.indexOf(currentField);
      if (idx >= 0 && idx < FIELD_ORDER.length - 1) {
        const nextField = FIELD_ORDER[idx + 1];
        const el = fieldRefs.current[nextField];
        if (el) {
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.focus();
          else el.querySelector('button')?.focus();
        }
      } else if (idx === FIELD_ORDER.length - 1) {
        // Last field → book this row
        if (expandedRowId) handleBookRow(expandedRowId);
      }
    }
  };

  const handleBookRow = useCallback(async (rowId: string) => {
    if (!currentTxn || bookingSingle || !user) return;

    const row = formRows.find(r => r.id === rowId);
    if (!row || row.booked) return;

    if (!row.account_id) {
      toast.error("Bitte ein Konto auswählen");
      return;
    }

    setBookingSingle(rowId);
    try {
      const amount = parseFloat(row.amount) || 0;
      const vatRate = parseFloat(row.vat_rate) || 0;
      const vatAmount = parseFloat(row.vat_amount) || 0;
      const amount35a = row.is_35a_relevant && row.amount_35a ? parseFloat(row.amount_35a) : null;
      const totalParts = formRows.length;
      const partIndex = formRows.findIndex(r => r.id === rowId) + 1;

      const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
        building_id: buildingId,
        account_id: row.account_id,
        counter_account_id: row.counter_account_id || null,
        amount,
        vat_rate: vatRate,
        vat_amount: vatAmount > 0 ? vatAmount : null,
        description: row.description || null,
        booking_reference: row.booking_reference || "KI",
        booking_date: row.booking_date,
        receipt_number: row.receipt_number || null,
        booking_type: row.booking_type,
        fiscal_year: row.fiscal_year,
        invoice_id: row.invoice_id,
        matched_template_id: row.matched_template_id,
        is_35a_relevant: row.is_35a_relevant,
        amount_35a: amount35a,
        source: "bank_import",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        created_by: user.id,
        bank_transaction_id: currentTxn.id,
        split_part: totalParts > 1 ? partIndex : null,
        split_parts_total: totalParts > 1 ? totalParts : null,
      } as any).select("id").single();

      if (bookingError) throw bookingError;

      // Mark this row as booked
      setFormRows(rows => rows.map(r => r.id === rowId ? { ...r, booked: true } : r));

      // Check if ALL rows are now booked
      const updatedRows = formRows.map(r => r.id === rowId ? { ...r, booked: true } : r);
      const allBooked = updatedRows.every(r => r.booked);

      if (allBooked) {
        // Mark transaction as booked
        await supabase.from("bank_transactions").update({
          booked_at: new Date().toISOString(),
          booking_id: booking.id,
        }).eq("id", currentTxn.id);

        setBookedCount(c => c + 1);
        toast.success(`${totalParts > 1 ? `${totalParts} Buchungen` : "Buchung"} erstellt ✓`, { duration: 1500 });

        queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
        queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
        queryClient.invalidateQueries({ queryKey: ["bookings-pending"] });
        queryClient.invalidateQueries({ queryKey: ["bookings-confirmed"] });

        // Move to next
        if (currentIndex < transactions.length - 1) {
          setCurrentIndex(i => i + 1);
        }
      } else {
        toast.success("Teilbuchung erstellt ✓", { duration: 1500 });
        // Expand next unbooked row
        const nextUnbooked = updatedRows.find(r => !r.booked);
        if (nextUnbooked) setExpandedRowId(nextUnbooked.id);
      }
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setBookingSingle(null);
    }
  }, [currentTxn, bookingSingle, user, formRows, buildingId, currentIndex, transactions.length, queryClient]);

  const handleNext = useCallback(() => {
    if (currentIndex < transactions.length - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, transactions.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  useEffect(() => {
    if (!open) return;
    const keyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.getAttribute("role") === "combobox";
      if (isInput) return;
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

  // Sum validation for split bookings
  const currentTotal = useMemo(() => {
    return formRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
  }, [formRows]);

  const isAmountMatching = currentTxn ? Math.abs(currentTotal - Math.abs(currentTxn.amount)) < 0.01 : false;

  const progressPercent = transactions.length > 0
    ? ((bookedCount) / (bookedCount + transactions.length)) * 100
    : 100;

  useEffect(() => { setCurrentIndex(initialIndex ?? 0); setBookedCount(0); }, [open, initialIndex]);

  const sourceType = useMemo(() => {
    if (!currentTxn) return "none";
    if (currentTxn.matched_invoice_id) return "invoice";
    if (currentTxn.matched_template_id) return "template";
    if (currentTxn.ai_suggestion) return "ai";
    return "manual";
  }, [currentTxn]);

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
            {/* Left: Transaction details + Booking rows */}
            <div className="w-1/2 border-r overflow-y-auto">
              {/* Transaction summary */}
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

                {/* Sender/Recipient with IBAN mapping */}
                {(counterpartyName || ibanToMatch) && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{counterpartyLabel}:</span>
                    {ibanMatch ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 text-xs">
                          {ibanMatch.contactName}
                          {ibanMatch.unitNumber && ` · Whg. ${ibanMatch.unitNumber}`}
                        </Badge>
                        {ibanMatch.role && (
                          <span className="text-xs text-muted-foreground">
                            ({ibanMatch.role === "eigentuemer" ? "Eigentümer" : ibanMatch.role === "mieter" ? "Mieter" : ibanMatch.role})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-foreground">
                        {counterpartyName || "–"}
                        {ibanToMatch && <span className="text-muted-foreground ml-1 font-mono text-xs">({ibanToMatch})</span>}
                      </span>
                    )}
                  </div>
                )}

                <p className="text-sm">{currentTxn.purpose || "–"}</p>
              </div>

              {/* Sum validation for multi-row */}
              {formRows.length > 1 && (
                <div className={cn(
                  "mx-4 mt-3 p-2 rounded-lg border text-sm flex items-center justify-between",
                  isAmountMatching
                    ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200"
                    : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200"
                )}>
                  <span>Summe Buchungen: {formatCurrency(currentTotal)}</span>
                  <span>Transaktion: {formatCurrency(Math.abs(currentTxn.amount))}</span>
                  {isAmountMatching ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <span className="font-medium">Δ {formatCurrency(Math.abs(currentTotal - Math.abs(currentTxn.amount)))}</span>
                  )}
                </div>
              )}

              {/* Booking rows */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    {formRows.length > 1 ? `Buchungen (${formRows.filter(r => r.booked).length}/${formRows.length})` : "Buchung"}
                  </h4>
                  <Button variant="outline" size="sm" onClick={addRow} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Buchung
                  </Button>
                </div>

                {formRows.map((row, idx) => (
                  <BookingRowCard
                    key={row.id}
                    row={row}
                    index={idx}
                    isExpanded={expandedRowId === row.id}
                    onToggle={() => setExpandedRowId(expandedRowId === row.id ? null : row.id)}
                    accounts={accounts}
                    onUpdateField={(field, value) => updateRow(row.id, field, value)}
                    onBook={() => handleBookRow(row.id)}
                    onRemove={formRows.length > 1 ? () => removeRow(row.id) : undefined}
                    isBooking={bookingSingle === row.id}
                    fieldRefs={fieldRefs}
                    handleEnterNavigation={handleEnterNavigation}
                    formatCurrency={formatCurrency}
                  />
                ))}

                {/* Skip button */}
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={handleNext} disabled={currentIndex >= transactions.length - 1} className="w-full">
                    Überspringen <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Right: PDF or Template/AI details */}
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
                <div className="p-6 space-y-4 overflow-y-auto">
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
                  {/* Template suggestion from AI */}
                  {currentTxn.ai_suggestion.template_suggestion && (
                    <TemplateSuggestionCard
                      suggestion={currentTxn.ai_suggestion.template_suggestion}
                      buildingId={buildingId}
                      transactionId={currentTxn.id}
                      accounts={accounts}
                      onCreated={() => {
                        queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
                        queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
                        queryClient.invalidateQueries({ queryKey: ["booking-templates"] });
                      }}
                    />
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

// ─── Collapsible Booking Row Card ──────────────────────────────────────────────

function BookingRowCard({
  row, index, isExpanded, onToggle, accounts, onUpdateField, onBook, onRemove,
  isBooking, fieldRefs, handleEnterNavigation, formatCurrency,
}: {
  row: BookingRowData;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  accounts: any[];
  onUpdateField: (field: string, value: string | boolean) => void;
  onBook: () => void;
  onRemove?: () => void;
  isBooking: boolean;
  fieldRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  handleEnterNavigation: (e: React.KeyboardEvent, field: string) => void;
  formatCurrency: (amount: number | null) => string;
}) {
  const counterAccount = accounts.find((a: any) => a.id === row.counter_account_id);
  const selectedCounterAccount = counterAccount;

  // Auto-calculate VAT when amount/rate changes
  useEffect(() => {
    const amount = parseFloat(row.amount) || 0;
    const vatRate = parseFloat(row.vat_rate) || 0;
    if (vatRate > 0 && amount > 0) {
      const vatAmount = amount - (amount / (1 + vatRate / 100));
      onUpdateField("vat_amount", vatAmount.toFixed(2));
    }
  }, [row.amount, row.vat_rate]);

  return (
    <Collapsible open={isExpanded && !row.booked} onOpenChange={() => !row.booked && onToggle()}>
      <div className={cn(
        "rounded-lg border transition-colors",
        row.booked
          ? "bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-700"
          : isExpanded
            ? "border-primary bg-background"
            : "border-border bg-muted/30 hover:bg-muted/50"
      )}>
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
            disabled={row.booked}
          >
            <div className="flex items-center gap-2 min-w-0">
              {row.booked ? (
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              ) : isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-medium truncate">
                {index + 1}. {row.description || "Buchung"}
              </span>
              {counterAccount && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {counterAccount.account_number}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn("text-sm font-bold", row.booking_type === "income" ? "text-green-600" : "text-destructive")}>
                {row.booking_type === "income" ? "+" : "−"}{formatCurrency(parseFloat(row.amount) || 0)}
              </span>
              {onRemove && !row.booked && (
                <button
                  onClick={e => { e.stopPropagation(); onRemove(); }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3 border-t pt-3">
            {/* Account */}
            <div ref={el => fieldRefs.current["account_id"] = el}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Konto</label>
              <Select value={row.account_id} onValueChange={v => onUpdateField("account_id", v)}>
                <SelectTrigger className="h-9 text-sm" onKeyDown={e => handleEnterNavigation(e, "account_id")}>
                  <SelectValue placeholder="Konto wählen…" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {accounts.filter((a: any) => a.category !== "Bankkonto").map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono mr-2">{a.account_number}</span>{a.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type + Amount */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Typ</label>
              <Button type="button" size="sm" variant={row.booking_type === "expense" ? "default" : "outline"}
                className={cn("h-7 px-2 text-xs font-bold", row.booking_type === "expense" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                onClick={() => onUpdateField("booking_type", "expense")}>− Ausgabe</Button>
              <Button type="button" size="sm" variant={row.booking_type === "income" ? "default" : "outline"}
                className={cn("h-7 px-2 text-xs font-bold", row.booking_type === "income" && "bg-green-600 hover:bg-green-700 text-white")}
                onClick={() => onUpdateField("booking_type", "income")}>+ Einnahme</Button>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Betrag (€)</label>
              <Input ref={el => fieldRefs.current["amount"] = el}
                className={cn("h-9 text-sm font-bold", row.booking_type === "income" ? "text-green-600" : "text-destructive")}
                value={row.amount} onChange={e => onUpdateField("amount", e.target.value)}
                onKeyDown={e => handleEnterNavigation(e, "amount")} />
              {parseFloat(row.vat_amount) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">davon MwSt: {formatCurrency(parseFloat(row.vat_amount))} ({row.vat_rate}%)</p>
              )}
            </div>

            {/* Counter account */}
            <div ref={el => fieldRefs.current["counter_account_id"] = el}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Gegenkonto</label>
              <Select value={row.counter_account_id} onValueChange={v => onUpdateField("counter_account_id", v)}>
                <SelectTrigger className="h-9 text-sm" onKeyDown={e => handleEnterNavigation(e, "counter_account_id")}>
                  <SelectValue placeholder="Gegenkonto wählen…" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono mr-2">{a.account_number}</span>{a.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Buchungstext</label>
              <Input ref={el => fieldRefs.current["description"] = el} className="h-9 text-sm"
                value={row.description} onChange={e => onUpdateField("description", e.target.value)}
                onKeyDown={e => handleEnterNavigation(e, "description")} />
            </div>

            {/* Compact row */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Kürzel</label>
                <Input ref={el => fieldRefs.current["booking_reference"] = el}
                  className="h-8 text-xs font-mono" value={row.booking_reference}
                  onChange={e => onUpdateField("booking_reference", e.target.value)}
                  onKeyDown={e => handleEnterNavigation(e, "booking_reference")} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Beleg-Datum</label>
                <Input ref={el => fieldRefs.current["booking_date"] = el}
                  type="date" className="h-8 text-xs" value={row.booking_date}
                  onChange={e => onUpdateField("booking_date", e.target.value)}
                  onKeyDown={e => handleEnterNavigation(e, "booking_date")} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Beleg-Nr.</label>
                <Input ref={el => fieldRefs.current["receipt_number"] = el}
                  className="h-8 text-xs" value={row.receipt_number}
                  onChange={e => onUpdateField("receipt_number", e.target.value)}
                  onKeyDown={e => handleEnterNavigation(e, "receipt_number")} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">MwSt %</label>
                <Select value={row.vat_rate} onValueChange={v => onUpdateField("vat_rate", v)}>
                  <SelectTrigger className="h-8 text-xs" ref={el => fieldRefs.current["vat_rate"] = el}
                    onKeyDown={e => handleEnterNavigation(e, "vat_rate")}>
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

            {/* §35a */}
            {(row.is_35a_relevant || selectedCounterAccount?.is_35a_relevant) && (
              <div className="p-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                <div className="flex items-center gap-3">
                  <Checkbox checked={row.is_35a_relevant} onCheckedChange={v => onUpdateField("is_35a_relevant", !!v)} />
                  <label className="text-xs font-medium">§35a-relevant</label>
                </div>
                {row.is_35a_relevant && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Lohnanteil (€)</label>
                    <Input className="h-8 w-32 text-xs" placeholder="0,00" value={row.amount_35a}
                      onChange={e => onUpdateField("amount_35a", e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {/* Book button */}
            <Button onClick={onBook} disabled={isBooking || !row.account_id} className="w-full h-9 text-sm">
              {isBooking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Buchen
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
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

// ─── Template Suggestion Card ──────────────────────────────────────────────────

function TemplateSuggestionCard({
  suggestion, buildingId, transactionId, accounts, onCreated,
}: {
  suggestion: any;
  buildingId: string;
  transactionId: string;
  accounts: any[];
  onCreated: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: suggestion.name || "",
    vendor_name: suggestion.vendor_name || "",
    vendor_iban: suggestion.vendor_iban || "",
    expected_amount: suggestion.expected_amount?.toString() || "",
    interval: suggestion.interval || "",
    account_number: suggestion.account_number || "",
  });

  const handleCreate = async () => {
    setCreating(true);
    try {
      let accountId: string | null = null;
      if (form.account_number) {
        const acc = accounts.find((a: any) => a.account_number === form.account_number);
        if (acc) accountId = acc.id;
      }

      const { data: template, error } = await supabase.from("booking_templates").insert({
        building_id: buildingId,
        name: form.name,
        vendor_name: form.vendor_name || null,
        vendor_iban: form.vendor_iban || null,
        expected_amount: form.expected_amount ? parseFloat(form.expected_amount) : null,
        interval: form.interval || null,
        account_id: accountId,
        description: suggestion.description || null,
      } as any).select("id").single();

      if (error) throw error;

      await supabase.from("bank_transactions").update({
        matched_template_id: template.id,
      }).eq("id", transactionId);

      setCreated(true);
      setEditing(false);
      toast.success("Vorlage erstellt ✓");
      onCreated();
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setCreating(false);
    }
  };

  const updateField = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-blue-600" />
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Neue Vorlage vorgeschlagen</p>
        </div>
        {!created && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEditing(!editing)}>
            {editing ? "Fertig" : "Bearbeiten"}
          </Button>
        )}
      </div>

      {/* AI reasoning */}
      {suggestion.description && (
        <div className="p-2.5 rounded-md bg-blue-100/60 dark:bg-blue-900/30 border border-blue-200/50 dark:border-blue-700/50">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-medium text-blue-700 dark:text-blue-300 mb-0.5">KI-Begründung</p>
              <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">{suggestion.description}</p>
            </div>
          </div>
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Name</label>
              <Input className="h-7 text-xs" value={form.name} onChange={e => updateField("name", e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Lieferant</label>
              <Input className="h-7 text-xs" value={form.vendor_name} onChange={e => updateField("vendor_name", e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Betrag (€)</label>
              <Input className="h-7 text-xs" type="number" step="0.01" value={form.expected_amount} onChange={e => updateField("expected_amount", e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Intervall</label>
              <select className="h-7 w-full text-xs rounded-md border border-input bg-background px-2" value={form.interval} onChange={e => updateField("interval", e.target.value)}>
                <option value="">—</option>
                <option value="monatlich">monatlich</option>
                <option value="quartalsweise">quartalsweise</option>
                <option value="halbjährlich">halbjährlich</option>
                <option value="jährlich">jährlich</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">IBAN</label>
            <Input className="h-7 text-xs font-mono" value={form.vendor_iban} onChange={e => updateField("vendor_iban", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Gegenkonto</label>
            <select className="h-7 w-full text-xs rounded-md border border-input bg-background px-2" value={form.account_number} onChange={e => updateField("account_number", e.target.value)}>
              <option value="">— Konto wählen —</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.account_number}>{a.account_number} – {a.account_name}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{form.name}</span></div>
          {form.vendor_name && <div><span className="text-muted-foreground">Lieferant:</span> <span className="font-medium">{form.vendor_name}</span></div>}
          {form.expected_amount && <div><span className="text-muted-foreground">Betrag:</span> <span className="font-medium">{formatCurrency(parseFloat(form.expected_amount))}</span></div>}
          {form.interval && <div><span className="text-muted-foreground">Intervall:</span> <span className="font-medium">{form.interval}</span></div>}
          {form.account_number && <div><span className="text-muted-foreground">Konto:</span> <span className="font-medium">{form.account_number}</span></div>}
          {form.vendor_iban && <div className="col-span-2"><span className="text-muted-foreground">IBAN:</span> <span className="font-mono font-medium text-[11px]">{form.vendor_iban}</span></div>}
        </div>
      )}

      <Button
        size="sm"
        className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
        onClick={handleCreate}
        disabled={creating || created || !form.name}
      >
        {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : created ? <CheckCircle className="h-3 w-3 mr-1" /> : <PackagePlus className="h-3 w-3 mr-1" />}
        {created ? "Vorlage erstellt" : "Vorlage erstellen"}
      </Button>
    </div>
  );
}
