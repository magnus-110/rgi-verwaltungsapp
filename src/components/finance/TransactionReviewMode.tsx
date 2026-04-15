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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft, ArrowRight, CheckCircle, X,
  FileText, LayoutTemplate, Loader2, Sparkles,
  ChevronDown, ChevronRight, Plus, Trash2, User, PackagePlus, AlertTriangle,
  Link2, RefreshCw, RotateCcw
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
  accrualHint?: {
    needs_accrual: boolean;
    accrual_explanation: string;
    service_period_from?: string;
    service_period_to?: string;
  } | null;
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
  const [showAssignedInvoices, setShowAssignedInvoices] = useState(false);
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

  // All invoices for the building (for Zuordnung tab)
  const { data: allInvoices = [] } = useQuery({
    queryKey: ["all-invoices-building", buildingId, showAssignedInvoices],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("id, invoice_number, vendor_name, gross_amount, invoice_date, status, vendor_iban, file_path")
        .eq("building_id", buildingId)
        .order("invoice_date", { ascending: false })
        .limit(300);
      if (!showAssignedInvoices) {
        query = query.neq("status", "paid");
      }
      const { data } = await query;
      return data || [];
    },
    enabled: open && !!buildingId,
  });

  // All templates for the building (for Zuordnung tab)
  const { data: allTemplates = [] } = useQuery({
    queryKey: ["all-templates-building", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_templates")
        .select("id, name, vendor_name, expected_amount, interval, account_id, vat_rate, is_35a_relevant, vendor_iban, chart_of_accounts(account_number, account_name)")
        .eq("building_id", buildingId)
        .order("name");
      return data || [];
    },
    enabled: open && !!buildingId,
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

    // Fiscal year hint from AI
    if (aiSuggestion?.fiscal_year_hint) {
      const hint = aiSuggestion.fiscal_year_hint;
      if (hint.fiscal_year) row.fiscal_year = hint.fiscal_year;
      row.accrualHint = {
        needs_accrual: hint.needs_accrual || false,
        accrual_explanation: hint.accrual_explanation || "",
        service_period_from: hint.service_period_from,
        service_period_to: hint.service_period_to,
      };
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

  const updateRow = (rowId: string, field: string, value: string | boolean | number) => {
    setFormRows(rows => rows.map(r => r.id === rowId ? { ...r, [field]: field === "fiscal_year" ? (typeof value === "string" ? parseInt(value) || r.fiscal_year : value) : value } : r));
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
      <DialogContent className="max-w-[96vw] max-h-[94vh] w-full h-[94vh] p-0 flex flex-col overflow-hidden [&>button.absolute]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">Enter</kbd>
              <span className="text-[11px]">Nächstes Feld</span>
              <span className="mx-1 text-border">|</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">←</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">→</kbd>
              <span className="text-[11px]">Nav</span>
            </div>
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
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" /> Schließen
          </Button>
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

                {/* Date & Time */}
                <div className="text-sm text-muted-foreground">
                  <span>{format(new Date(currentTxn.booking_date), "dd.MM.yyyy", { locale: de })}</span>
                  {currentTxn.value_date && currentTxn.value_date !== currentTxn.booking_date && (
                    <span className="ml-2">· Wertstellung: {format(new Date(currentTxn.value_date), "dd.MM.yyyy", { locale: de })}</span>
                  )}
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

                {/* Verwendungszweck */}
                {currentTxn.purpose && (
                  <div className="text-sm bg-muted/40 rounded-md p-2 border">
                    <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Verwendungszweck</p>
                    <p className="text-foreground leading-relaxed">{currentTxn.purpose}</p>
                  </div>
                )}
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
                    buildingId={buildingId}
                    onAccountCreated={() => queryClient.invalidateQueries({ queryKey: ["chart-of-accounts-review", buildingId] })}
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

            {/* Right: Zuordnung (top) + Analyse (bottom, collapsible) */}
            <div className="w-1/2 flex flex-col overflow-y-auto">
              {/* ── Zuordnung Section (Top, prominent) ── */}
              <div className="shrink-0">
                <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Zuordnung</span>
                </div>
                <div className="p-4">
                  <AssignmentTabContent
                    currentTxn={currentTxn}
                    allInvoices={allInvoices}
                    allTemplates={allTemplates}
                    showAssignedInvoices={showAssignedInvoices}
                    onToggleShowAssigned={setShowAssignedInvoices}
                    accounts={accounts}
                    formRows={formRows}
                    expandedRowId={expandedRowId}
                    onAssignInvoice={async (inv: any) => {
                      const targetRowId = expandedRowId || formRows[0]?.id;
                      if (!targetRowId) return;
                      setFormRows(rows => rows.map(r => {
                        if (r.id !== targetRowId) return r;
                        const updated = { ...r, invoice_id: inv.id };
                        if (inv.invoice_number) updated.receipt_number = inv.invoice_number;
                        if (inv.vendor_name) updated.description = [inv.vendor_name, inv.invoice_number].filter(Boolean).join(" ");
                        return updated;
                      }));
                      await supabase.from("bank_transactions").update({
                        matched_invoice_id: inv.id,
                      }).eq("id", currentTxn.id);
                      queryClient.invalidateQueries({ queryKey: ["txn-review-invoice"] });
                      toast.success("Rechnung zugeordnet");
                    }}
                    onAssignTemplate={async (tpl: any) => {
                      const targetRowId = expandedRowId || formRows[0]?.id;
                      if (!targetRowId) return;
                      setFormRows(rows => rows.map(r => {
                        if (r.id !== targetRowId) return r;
                        const updated = { ...r, matched_template_id: tpl.id };
                        if (tpl.account_id) updated.counter_account_id = tpl.account_id;
                        if (tpl.vat_rate != null) updated.vat_rate = String(tpl.vat_rate);
                        if (tpl.is_35a_relevant) updated.is_35a_relevant = true;
                        if (tpl.name) updated.description = tpl.name;
                        return updated;
                      }));
                      await supabase.from("bank_transactions").update({
                        matched_template_id: tpl.id,
                      }).eq("id", currentTxn.id);
                      queryClient.invalidateQueries({ queryKey: ["txn-review-template"] });
                      toast.success("Vorlage zugeordnet");
                    }}
                    formatCurrency={formatCurrency}
                  />
                </div>
              </div>

              {/* ── Analyse Section (Bottom, collapsible) ── */}
              <Collapsible defaultOpen={true}>
                <div className="border-t">
                  <CollapsibleTrigger asChild>
                    <button className="w-full px-4 py-2 border-b bg-muted/20 flex items-center gap-2 hover:bg-muted/40 transition-colors">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Analyse</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {invoiceDetail ? (
                      <div>
                        <div className="px-4 py-2 border-b space-y-1">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">Rechnung</span>
                            {invoiceDetail.vendor_name && <Badge variant="outline" className="text-xs">{invoiceDetail.vendor_name}</Badge>}
                          </div>
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
                          <iframe src={pdfUrl} className="w-full border-0" style={{ height: "400px" }} title="Rechnung PDF" />
                        ) : (
                          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                            PDF wird geladen...
                          </div>
                        )}
                      </div>
                    ) : templateDetail ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <LayoutTemplate className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold text-sm">Zugeordnete Vorlage</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
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
                      <div className="p-4 space-y-3">
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
                      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                        <FileText className="h-10 w-10 opacity-20" />
                        <p className="text-sm">Kein Beleg zugeordnet</p>
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Collapsible Booking Row Card ──────────────────────────────────────────────

function BookingRowCard({
  row, index, isExpanded, onToggle, accounts, buildingId, onAccountCreated, onUpdateField, onBook, onRemove,
  isBooking, fieldRefs, handleEnterNavigation, formatCurrency,
}: {
  row: BookingRowData;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  accounts: any[];
  buildingId: string;
  onAccountCreated: () => void;
  onUpdateField: (field: string, value: string | boolean | number) => void;
  onBook: () => void;
  onRemove?: () => void;
  isBooking: boolean;
  fieldRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  handleEnterNavigation: (e: React.KeyboardEvent, field: string) => void;
  formatCurrency: (amount: number | null) => string;
}) {
  const counterAccount = accounts.find((a: any) => a.id === row.counter_account_id);
  const selectedCounterAccount = counterAccount;
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [createAccountTarget, setCreateAccountTarget] = useState<"account_id" | "counter_account_id">("counter_account_id");

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
              <div className="flex gap-1.5">
                <Select value={row.account_id} onValueChange={v => {
                  if (v === "__create__") { setCreateAccountTarget("account_id"); setCreateAccountOpen(true); }
                  else onUpdateField("account_id", v);
                }}>
                  <SelectTrigger className="h-9 text-sm flex-1" onKeyDown={e => handleEnterNavigation(e, "account_id")}>
                    <SelectValue placeholder="Konto wählen…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {accounts.filter((a: any) => a.category !== "Bankkonto").map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-mono mr-2">{a.account_number}</span>{a.account_name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__create__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Neues Konto anlegen</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              <Select value={row.counter_account_id} onValueChange={v => {
                if (v === "__create__") { setCreateAccountTarget("counter_account_id"); setCreateAccountOpen(true); }
                else onUpdateField("counter_account_id", v);
              }}>
                <SelectTrigger className="h-9 text-sm" onKeyDown={e => handleEnterNavigation(e, "counter_account_id")}>
                  <SelectValue placeholder="Gegenkonto wählen…" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono mr-2">{a.account_number}</span>{a.account_name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__create__" className="text-primary font-medium">
                    <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Neues Konto anlegen</span>
                  </SelectItem>
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

            {/* Wirtschaftsjahr */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Wirtschaftsjahr</label>
                <Input className="h-8 text-xs font-mono" type="number" value={row.fiscal_year}
                  onChange={e => onUpdateField("fiscal_year", e.target.value)} />
              </div>
            </div>

            {/* Accrual hint from AI */}
            {row.accrualHint && (
              <div className="p-2.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 space-y-1">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    {row.accrualHint.needs_accrual ? "Abgrenzungsbuchung empfohlen" : "Wirtschaftsjahr-Hinweis"}
                  </p>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">{row.accrualHint.accrual_explanation}</p>
                {row.accrualHint.service_period_from && row.accrualHint.service_period_to && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Leistungszeitraum: {row.accrualHint.service_period_from} – {row.accrualHint.service_period_to}
                  </p>
                )}
              </div>
            )}

            {/* §35a */}
            <div className="p-2 rounded-lg border bg-muted/30 space-y-2">
              <div className="flex items-center gap-3">
                <Checkbox id={`35a-${index}`} checked={row.is_35a_relevant} onCheckedChange={v => onUpdateField("is_35a_relevant", !!v)} />
                <label htmlFor={`35a-${index}`} className="text-xs font-medium">§35a-relevant</label>
              </div>
              {row.is_35a_relevant && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Lohnanteil (€)</label>
                  <Input className="h-8 w-32 text-xs" placeholder="0,00" value={row.amount_35a}
                    onChange={e => onUpdateField("amount_35a", e.target.value)} />
                </div>
              )}
            </div>

            {/* Book button */}
            <Button onClick={onBook} disabled={isBooking || !row.account_id} className="w-full h-9 text-sm">
              {isBooking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Buchen
            </Button>
          </div>
        </CollapsibleContent>
      </div>
      {/* Create account dialog */}
      <CreateAccountInlineDialog
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
        buildingId={buildingId}
        onCreated={(newAccountId) => {
          onUpdateField(createAccountTarget, newAccountId);
          onAccountCreated();
          setCreateAccountOpen(false);
        }}
      />
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
    amount_tolerance: suggestion.amount_tolerance?.toString() || "5",
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
        amount_tolerance: form.amount_tolerance ? parseFloat(form.amount_tolerance) : null,
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
    <div className="p-4 rounded-lg border bg-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Neue Vorlage vorgeschlagen</p>
        </div>
        {!created && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEditing(!editing)}>
            {editing ? "Fertig" : "Bearbeiten"}
          </Button>
        )}
      </div>

      {/* AI reasoning */}
      {suggestion.description && (
        <div className="p-3 rounded-md bg-muted/60 border">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Begründung</p>
              <p className="text-xs leading-relaxed">{suggestion.description}</p>
            </div>
          </div>
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground">Name</label>
              <Input className="h-8 text-xs" value={form.name} onChange={e => updateField("name", e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Lieferant</label>
              <Input className="h-8 text-xs" value={form.vendor_name} onChange={e => updateField("vendor_name", e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Betrag (€)</label>
              <Input className="h-8 text-xs" type="number" step="0.01" value={form.expected_amount} onChange={e => updateField("expected_amount", e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Toleranz (± €)</label>
              <Input className="h-8 text-xs" type="number" step="0.01" value={form.amount_tolerance} onChange={e => updateField("amount_tolerance", e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Intervall</label>
              <select className="h-8 w-full text-xs rounded-md border border-input bg-background px-2" value={form.interval} onChange={e => updateField("interval", e.target.value)}>
                <option value="">—</option>
                <option value="monatlich">monatlich</option>
                <option value="quartalsweise">quartalsweise</option>
                <option value="halbjährlich">halbjährlich</option>
                <option value="jährlich">jährlich</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Gegenkonto</label>
              <select className="h-8 w-full text-xs rounded-md border border-input bg-background px-2" value={form.account_number} onChange={e => updateField("account_number", e.target.value)}>
                <option value="">— Konto wählen —</option>
                {accounts.map((a: any) => (
                  <option key={a.id} value={a.account_number}>{a.account_number} – {a.account_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">IBAN</label>
            <Input className="h-8 text-xs font-mono" value={form.vendor_iban} onChange={e => updateField("vendor_iban", e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{form.name}</span></div>
          {form.vendor_name && <div><span className="text-muted-foreground">Lieferant:</span> <span className="font-medium">{form.vendor_name}</span></div>}
          {form.expected_amount && <div><span className="text-muted-foreground">Betrag:</span> <span className="font-medium">{formatCurrency(parseFloat(form.expected_amount))}</span></div>}
          {form.amount_tolerance && <div><span className="text-muted-foreground">Toleranz:</span> <span className="font-medium">± {form.amount_tolerance} €</span></div>}
          {form.interval && <div><span className="text-muted-foreground">Intervall:</span> <span className="font-medium">{form.interval}</span></div>}
          {form.account_number && <div><span className="text-muted-foreground">Konto:</span> <span className="font-medium">{form.account_number}</span></div>}
          {form.vendor_iban && <div className="col-span-2"><span className="text-muted-foreground">IBAN:</span> <span className="font-mono font-medium text-[11px]">{form.vendor_iban}</span></div>}
        </div>
      )}

      <Button
        size="sm"
        className="w-full h-9 text-xs"
        onClick={handleCreate}
        disabled={creating || created || !form.name}
      >
        {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : created ? <CheckCircle className="h-3 w-3 mr-1" /> : <PackagePlus className="h-3 w-3 mr-1" />}
        {created ? "Vorlage erstellt" : "Vorlage erstellen"}
      </Button>
    </div>
  );
}

// ─── Create Account Inline Dialog ──────────────────────────────────────────────

function CreateAccountInlineDialog({
  open, onOpenChange, buildingId, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  onCreated: (accountId: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    account_number: "",
    account_name: "",
    category: "Ausgabe",
    scope: "building" as "building" | "global",
    default_vat_rate: "19",
    is_billing_relevant: true,
    is_distributable: false,
    is_heating_relevant: false,
    is_wirtschaftsplan_relevant: false,
    is_35a_relevant: false,
    settlement_35a_type: "" as string,
    default_distribution_key: "",
    carry_forward_balance: false,
  });

  const updateField = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.account_number || !form.account_name) {
      toast.error("Kontonummer und -name sind Pflichtfelder");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("chart_of_accounts").insert({
        account_number: form.account_number,
        account_name: form.account_name,
        category: form.category,
        building_id: form.scope === "building" ? buildingId : null,
        default_vat_rate: parseFloat(form.default_vat_rate) || 0,
        is_billing_relevant: form.is_billing_relevant,
        is_distributable: form.is_distributable,
        is_heating_relevant: form.is_heating_relevant,
        is_wirtschaftsplan_relevant: form.is_wirtschaftsplan_relevant,
        is_35a_relevant: form.is_35a_relevant,
        settlement_35a_type: form.settlement_35a_type || null,
        default_distribution_key: form.default_distribution_key || null,
        carry_forward_balance: form.carry_forward_balance,
      }).select("id").single();

      if (error) throw error;
      toast.success("Konto erstellt ✓");
      onCreated(data.id);
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setSaving(false);
    }
  };

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({
        account_number: "", account_name: "", category: "Ausgabe", scope: "building",
        default_vat_rate: "19", is_billing_relevant: true, is_distributable: false,
        is_heating_relevant: false, is_wirtschaftsplan_relevant: false, is_35a_relevant: false,
        settlement_35a_type: "", default_distribution_key: "", carry_forward_balance: false,
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Neues Konto anlegen</h3>

          {/* Scope */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Geltungsbereich</label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={form.scope === "building" ? "default" : "outline"}
                className="flex-1 h-8 text-xs" onClick={() => updateField("scope", "building")}>
                Nur diese Liegenschaft
              </Button>
              <Button type="button" size="sm" variant={form.scope === "global" ? "default" : "outline"}
                className="flex-1 h-8 text-xs" onClick={() => updateField("scope", "global")}>
                Alle Liegenschaften
              </Button>
            </div>
          </div>

          {/* Number + Name */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Kontonummer</label>
              <Input className="h-9 text-sm font-mono" value={form.account_number}
                onChange={e => updateField("account_number", e.target.value)} placeholder="z.B. 4100" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Kontoname</label>
              <Input className="h-9 text-sm" value={form.account_name}
                onChange={e => updateField("account_name", e.target.value)} placeholder="z.B. Reparaturen" />
            </div>
          </div>

          {/* Category + VAT */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Kategorie</label>
              <Select value={form.category} onValueChange={v => updateField("category", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ausgabe">Ausgabe</SelectItem>
                  <SelectItem value="Einnahme">Einnahme</SelectItem>
                  <SelectItem value="Bankkonto">Bankkonto</SelectItem>
                  <SelectItem value="Rücklage">Rücklage</SelectItem>
                  <SelectItem value="Sonstiges">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">MwSt-Satz (%)</label>
              <Select value={form.default_vat_rate} onValueChange={v => updateField("default_vat_rate", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="7">7%</SelectItem>
                  <SelectItem value="19">19%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Distribution key */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Verteilerschlüssel</label>
            <Select value={form.default_distribution_key} onValueChange={v => updateField("default_distribution_key", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mea">MEA</SelectItem>
                <SelectItem value="flaeche">Fläche</SelectItem>
                <SelectItem value="einheiten">Einheiten</SelectItem>
                <SelectItem value="personen">Personen</SelectItem>
                <SelectItem value="direkt">Direkt</SelectItem>
                <SelectItem value="verbrauch">Verbrauch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Checkboxes */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_billing_relevant} onCheckedChange={v => updateField("is_billing_relevant", !!v)} />
              Abrechnungsrelevant
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_distributable} onCheckedChange={v => updateField("is_distributable", !!v)} />
              Umlagefähig
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_wirtschaftsplan_relevant} onCheckedChange={v => updateField("is_wirtschaftsplan_relevant", !!v)} />
              Wirtschaftsplan-relevant
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_heating_relevant} onCheckedChange={v => updateField("is_heating_relevant", !!v)} />
              Heizungsrelevant
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.carry_forward_balance} onCheckedChange={v => updateField("carry_forward_balance", !!v)} />
              Saldovortrag
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_35a_relevant} onCheckedChange={v => updateField("is_35a_relevant", !!v)} />
              §35a-relevant
            </label>
          </div>

          {/* §35a type */}
          {form.is_35a_relevant && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">§35a Typ</label>
              <Select value={form.settlement_35a_type} onValueChange={v => updateField("settlement_35a_type", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Typ wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="haushaltsnahe_dienstleistung">Haushaltsnahe Dienstleistung</SelectItem>
                  <SelectItem value="handwerkerleistung">Handwerkerleistung</SelectItem>
                  <SelectItem value="geringfuegige_beschaeftigung">Geringfügige Beschäftigung</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.account_number || !form.account_name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Konto erstellen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assignment Tab Content ────────────────────────────────────────────────────

function AssignmentTabContent({
  currentTxn, allInvoices, allTemplates, showAssignedInvoices, onToggleShowAssigned,
  accounts, formRows, expandedRowId, onAssignInvoice, onAssignTemplate, formatCurrency,
}: {
  currentTxn: any;
  allInvoices: any[];
  allTemplates: any[];
  showAssignedInvoices: boolean;
  onToggleShowAssigned: (v: boolean) => void;
  accounts: any[];
  formRows: BookingRowData[];
  expandedRowId: string | null;
  onAssignInvoice: (inv: any) => void;
  onAssignTemplate: (tpl: any) => void;
  formatCurrency: (amount: number | null) => string;
}) {
  const [assignTab, setAssignTab] = useState<string>("rechnungen");
  const aiMatches = currentTxn?.ai_suggestion?.matches || [];

  // Extract transaction metadata for smart matching
  const txnIban = currentTxn?.amount < 0 ? currentTxn?.creditor_iban : currentTxn?.debtor_iban;
  const txnName = (currentTxn?.amount < 0 ? currentTxn?.creditor_name : currentTxn?.debtor_name) || "";
  const txnPurpose = (currentTxn?.purpose || "").toLowerCase();
  const txnAmount = Math.abs(currentTxn?.amount || 0);

  // Cross-reference AI match IDs against actual invoice/template lists to determine type
  const invoiceIdSet = useMemo(() => new Set(allInvoices.map((i: any) => i.id)), [allInvoices]);
  const templateIdSet = useMemo(() => new Set(allTemplates.map((t: any) => t.id)), [allTemplates]);

  const invoiceMatches = useMemo(() => {
    const matchMap = new Map<string, any>();
    aiMatches.filter((m: any) => m.id && invoiceIdSet.has(m.id)).forEach((m: any) => matchMap.set(m.id, m));
    return matchMap;
  }, [aiMatches, invoiceIdSet]);

  const templateMatches = useMemo(() => {
    const matchMap = new Map<string, any>();
    aiMatches.filter((m: any) => m.id && templateIdSet.has(m.id)).forEach((m: any) => matchMap.set(m.id, m));
    return matchMap;
  }, [aiMatches, templateIdSet]);

  // Smart matching: check IBAN, vendor name, invoice number in purpose, amount
  const getInvoiceMatchReason = useCallback((inv: any): string | null => {
    if (invoiceMatches.has(inv.id)) return null; // AI already matched
    const reasons: string[] = [];
    // IBAN match
    if (txnIban && inv.vendor_iban && txnIban.replace(/\s/g, "").toUpperCase() === inv.vendor_iban.replace(/\s/g, "").toUpperCase()) {
      reasons.push("IBAN stimmt überein");
    }
    // Vendor name match
    if (txnName && inv.vendor_name) {
      const nameNorm = txnName.toLowerCase();
      const vendorNorm = inv.vendor_name.toLowerCase();
      if (nameNorm.includes(vendorNorm) || vendorNorm.includes(nameNorm)) {
        reasons.push("Kreditor stimmt überein");
      }
    }
    // Invoice number in purpose
    if (inv.invoice_number && txnPurpose.includes(inv.invoice_number.toLowerCase())) {
      reasons.push("Re-Nr. im Verwendungszweck");
    }
    // Amount match
    if (inv.gross_amount && Math.abs(txnAmount - Math.abs(inv.gross_amount)) < 0.01) {
      reasons.push("Betrag stimmt überein");
    }
    return reasons.length > 0 ? reasons.join(" · ") : null;
  }, [txnIban, txnName, txnPurpose, txnAmount, invoiceMatches]);

  const getTemplateMatchReason = useCallback((tpl: any): string | null => {
    if (templateMatches.has(tpl.id)) return null;
    const reasons: string[] = [];
    if (txnIban && tpl.vendor_iban && txnIban.replace(/\s/g, "").toUpperCase() === tpl.vendor_iban.replace(/\s/g, "").toUpperCase()) {
      reasons.push("IBAN stimmt überein");
    }
    if (txnName && tpl.vendor_name) {
      const nameNorm = txnName.toLowerCase();
      const vendorNorm = tpl.vendor_name.toLowerCase();
      if (nameNorm.includes(vendorNorm) || vendorNorm.includes(nameNorm)) {
        reasons.push("Kreditor stimmt überein");
      }
    }
    if (tpl.expected_amount != null) {
      const tol = tpl.amount_tolerance || 0;
      if (Math.abs(txnAmount - Math.abs(tpl.expected_amount)) <= tol) {
        reasons.push("Betrag stimmt überein");
      }
    }
    return reasons.length > 0 ? reasons.join(" · ") : null;
  }, [txnIban, txnName, txnAmount, templateMatches]);

  // Sort: AI matches first, then smart matches, then rest
  const sortedInvoices = useMemo(() => {
    return [...allInvoices].sort((a, b) => {
      const aiA = invoiceMatches.get(a.id)?.score || 0;
      const aiB = invoiceMatches.get(b.id)?.score || 0;
      const smartA = getInvoiceMatchReason(a) ? 0.5 : 0;
      const smartB = getInvoiceMatchReason(b) ? 0.5 : 0;
      return (aiB + smartB) - (aiA + smartA);
    });
  }, [allInvoices, invoiceMatches, getInvoiceMatchReason]);

  const sortedTemplates = useMemo(() => {
    return [...allTemplates].sort((a, b) => {
      const aiA = templateMatches.get(a.id)?.score || 0;
      const aiB = templateMatches.get(b.id)?.score || 0;
      const smartA = getTemplateMatchReason(a) ? 0.5 : 0;
      const smartB = getTemplateMatchReason(b) ? 0.5 : 0;
      return (aiB + smartB) - (aiA + smartA);
    });
  }, [allTemplates, templateMatches, getTemplateMatchReason]);

  const isCurrentlyAssigned = (type: "invoice" | "template", id: string) => {
    if (type === "invoice") return currentTxn?.matched_invoice_id === id;
    return currentTxn?.matched_template_id === id;
  };

  // Count recommendations
  const invoiceRecommendations = sortedInvoices.filter(inv => invoiceMatches.has(inv.id) || getInvoiceMatchReason(inv)).length;
  const templateRecommendations = sortedTemplates.filter(tpl => templateMatches.has(tpl.id) || getTemplateMatchReason(tpl)).length;
  const hasAnyRecommendation = invoiceRecommendations > 0 || templateRecommendations > 0;

  return (
    <div className="space-y-4">
      {/* No recommendations hint */}
      {!hasAnyRecommendation && (
        <div className="flex items-center gap-2 p-3 mb-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 text-sm text-orange-700 dark:text-orange-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Keine Übereinstimmungen gefunden — bitte manuell zuordnen.</span>
        </div>
      )}

      {/* Inner tabs: Rechnungen / Vorlagen */}
      <Tabs value={assignTab} onValueChange={setAssignTab}>
        <TabsList variant="pill" className="grid w-full grid-cols-2 shrink-0">
          <TabsTrigger variant="pill" value="rechnungen">
            <FileText className="h-3.5 w-3.5 mr-1" />
            Rechnungen
            <Badge variant="secondary" className="text-[10px] ml-1.5">{sortedInvoices.length}</Badge>
          </TabsTrigger>
          <TabsTrigger variant="pill" value="vorlagen">
            <LayoutTemplate className="h-3.5 w-3.5 mr-1" />
            Vorlagen
            <Badge variant="secondary" className="text-[10px] ml-1.5">{sortedTemplates.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Rechnungen ── */}
        <TabsContent value="rechnungen" className="flex-1 overflow-y-auto mt-2">
          <div className="flex items-center justify-end mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Bezahlte anzeigen</span>
              <Switch checked={showAssignedInvoices} onCheckedChange={onToggleShowAssigned} className="scale-75" />
            </div>
          </div>

          {sortedInvoices.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Keine Rechnungen verfügbar</p>
          ) : (
            <div className="space-y-1.5">
              {sortedInvoices.map((inv: any) => {
                const aiMatch = invoiceMatches.get(inv.id);
                const smartReason = getInvoiceMatchReason(inv);
                const isRecommended = !!aiMatch || !!smartReason;
                const isAssigned = isCurrentlyAssigned("invoice", inv.id);
                return (
                  <button
                    key={inv.id}
                    onClick={() => !isAssigned && onAssignInvoice(inv)}
                    disabled={isAssigned}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border transition-colors",
                      isAssigned
                        ? "border-primary/50 bg-primary/5 cursor-default"
                        : "hover:border-primary/40 hover:bg-muted/50 cursor-pointer",
                      isRecommended && !isAssigned && "border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/30"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{inv.vendor_name || "Unbekannt"}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAssigned && <Badge variant="default" className="text-[10px]">Zugeordnet</Badge>}
                        {aiMatch && !isAssigned && (
                          <Badge variant="outline" className="text-[10px] border-orange-400 bg-orange-100 text-orange-800 dark:border-orange-600 dark:bg-orange-950 dark:text-orange-300">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                            {Math.round(aiMatch.score * 100)}%
                          </Badge>
                        )}
                        <span className="text-sm font-semibold">{formatCurrency(inv.gross_amount)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {inv.invoice_number && <span>Re-Nr. {inv.invoice_number}</span>}
                      {inv.invoice_date && <span>· {format(new Date(inv.invoice_date), "dd.MM.yyyy", { locale: de })}</span>}
                      {inv.status && <Badge variant="outline" className="text-[9px] ml-auto">{inv.status}</Badge>}
                    </div>
                    {aiMatch?.reason && (
                      <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-1 italic">{aiMatch.reason}</p>
                    )}
                    {!aiMatch && smartReason && (
                      <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-1 italic">{smartReason}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Vorlagen ── */}
        <TabsContent value="vorlagen" className="flex-1 overflow-y-auto mt-2">
          {sortedTemplates.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Keine Vorlagen verfügbar</p>
          ) : (
            <div className="space-y-1.5">
              {sortedTemplates.map((tpl: any) => {
                const aiMatch = templateMatches.get(tpl.id);
                const smartReason = getTemplateMatchReason(tpl);
                const isRecommended = !!aiMatch || !!smartReason;
                const isAssigned = isCurrentlyAssigned("template", tpl.id);
                return (
                  <button
                    key={tpl.id}
                    onClick={() => !isAssigned && onAssignTemplate(tpl)}
                    disabled={isAssigned}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border transition-colors",
                      isAssigned
                        ? "border-primary/50 bg-primary/5 cursor-default"
                        : "hover:border-primary/40 hover:bg-muted/50 cursor-pointer",
                      isRecommended && !isAssigned && "border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/30"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{tpl.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAssigned && <Badge variant="default" className="text-[10px]">Zugeordnet</Badge>}
                        {aiMatch && !isAssigned && (
                          <Badge variant="outline" className="text-[10px] border-orange-400 bg-orange-100 text-orange-800 dark:border-orange-600 dark:bg-orange-950 dark:text-orange-300">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                            {Math.round(aiMatch.score * 100)}%
                          </Badge>
                        )}
                        {tpl.expected_amount != null && (
                          <span className="text-sm font-semibold">{formatCurrency(tpl.expected_amount)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {tpl.vendor_name && <span>{tpl.vendor_name}</span>}
                      {tpl.interval && <span>· {tpl.interval}</span>}
                      {(tpl as any).chart_of_accounts && (
                        <span className="ml-auto">{(tpl as any).chart_of_accounts.account_number}</span>
                      )}
                    </div>
                    {aiMatch?.reason && (
                      <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-1 italic">{aiMatch.reason}</p>
                    )}
                    {!aiMatch && smartReason && (
                      <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-1 italic">{smartReason}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
