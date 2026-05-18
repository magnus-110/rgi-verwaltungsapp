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
  Link2, RefreshCw, RotateCcw, Flag, Flame
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VendorHistorySection } from "./VendorHistorySection";
import { AccountSearchSelect } from "./AccountSearchSelect";
import { Section35aEditor } from "./Section35aEditor";
import { build35aDetailFromSuggestion } from "./build35aDetail";
import { buildBookingText, rebuildBookingTextIfAuto } from "./lib/bookingTextBuilder";
import { BookingTextTemplateCombobox } from "./BookingTextTemplateCombobox";
import { useMobileSplitView, MobileViewSwitcher, MobileBackToListButton } from "@/components/shared/MobileSplitView";
import { parseAmount } from "./lib/parseAmount";
import { getLineItemGross } from "./lib/lineItemAmount";
import { InvoiceLineItemsView } from "./InvoiceLineItemsView";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { resolveVendorDisplayName, useVendorAliases } from "./lib/vendorAlias";
import { VendorAliasDialog } from "./VendorAliasDialog";
import { Pencil } from "lucide-react";
import { CreateAccountInlineDialog } from "./CreateAccountInlineDialog";
import { useBuildingBankAccounts } from "@/hooks/useBuildingBankAccounts";

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
  needs_review: boolean;
  review_note: string;
  is_fuel_purchase: boolean;
  fuel_type: string;
  fuel_quantity: string;
  fuel_total_price: string;
  fuel_date: string;
  fuel_co2_emissions_kg: string;
  fuel_co2_tax_amount: string;
  fuel_energy_content_kwh: string;
  fuel_heating_unit_id: string;
  fuel_consumption_from: string;
  fuel_consumption_to: string;
  line_items_detail: any[] | null;
  accrualHint?: {
    needs_accrual: boolean;
    accrual_explanation: string;
    service_period_from?: string;
    service_period_to?: string;
  } | null;
  /** UI-only: zuletzt automatisch generierter Buchungstext (zur Erkennung von User-Edits). */
  __autoTextSignature?: string;
}

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

const formatMonthYearRef = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${yy}`;
  } catch {
    return "";
  }
};

const FIELD_ORDER = [
  "account_id", "amount", "counter_account_id", "description_shortcut", "description",
  "booking_reference", "booking_date", "fiscal_year", "vat_rate", "__book__"
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
  
  const [rerunningAi, setRerunningAi] = useState(false);
  const [bulkResetting, setBulkResetting] = useState(false);
  const [zuordnungOpen, setZuordnungOpen] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const split = useMobileSplitView();

  // Multi-row booking state
  const [formRows, setFormRows] = useState<BookingRowData[]>([]);

  // Vendor display-name aliases (Kurzbezeichnungen)
  const { data: vendorAliases } = useVendorAliases();
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const resolveVendor = (raw: string | null | undefined) =>
    resolveVendorDisplayName(raw, buildingId, vendorAliases);

  // Right-panel tab: original PDF vs. structured OCR view
  const [invoiceViewTab, setInvoiceViewTab] = useState<"pdf" | "items">("pdf");
  // Per-row line-item selection (rowId -> indices of selected line_items)
  const [rowLineSelections, setRowLineSelections] = useState<Record<string, number[]>>({});
  // Fallback VAT rate (in %) used when a line item has no own vat_rate.
  // Set by InvoiceLineItemsView and used here so booking sums match the
  // gross amounts shown on the right.
  const [fallbackVatRate, setFallbackVatRate] = useState<number>(19);

  // Cache of unsaved edits per transaction id, so navigating away and back keeps changes
  const editsCacheRef = useRef<Record<string, BookingRowData[]>>({});
  const previousTxnIdRef = useRef<string | null>(null);
  // Track booking ids created for the current txn, used for undo
  const pendingBookingIdsRef = useRef<Record<string, string[]>>({});
  // Map row.id → bookingId per txn, for individual undo
  const rowBookingMapRef = useRef<Record<string, Record<string, string>>>({});
  const [undoingRowId, setUndoingRowId] = useState<string | null>(null);

  // Undo stack: last up to 10 confirmed bookings
  type UndoEntry = {
    txnId: string;
    txnIndex: number;
    bookingIds: string[];
    priorRows: BookingRowData[];
  };
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [undoing, setUndoing] = useState(false);

  // Local override for manual re-assignments (matched_template_id / matched_invoice_id)
  // currentTxn comes from a parent snapshot and is not refetched, so we track overrides here.
  const [assignmentOverrides, setAssignmentOverrides] = useState<Record<string, { templateId?: string | null; invoiceId?: string | null }>>({});

  const rawTxn = transactions[currentIndex];
  const currentTxn = useMemo(() => {
    if (!rawTxn) return rawTxn;
    const ovr = assignmentOverrides[rawTxn.id];
    if (!ovr) return rawTxn;
    return {
      ...rawTxn,
      matched_template_id: ovr.templateId !== undefined ? ovr.templateId : rawTxn.matched_template_id,
      matched_invoice_id: ovr.invoiceId !== undefined ? ovr.invoiceId : rawTxn.matched_invoice_id,
    };
  }, [rawTxn, assignmentOverrides]);

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
        .select("id, file_path, file_name, vendor_name, gross_amount, net_amount, vat_amount, invoice_number, invoice_date, description, suggested_account_id, line_items, ocr_extracted_data")
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
        .select("id, name, vendor_name, expected_amount, amount_tolerance, vat_rate, interval, category, description, account_id, is_35a_relevant, linked_invoice_id, chart_of_accounts(account_number, account_name)")
        .eq("id", currentTxn.matched_template_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!currentTxn?.matched_template_id,
  });

  // Fetch linked invoice for template
  const linkedInvoiceId = (templateDetail as any)?.linked_invoice_id;
  const { data: linkedInvoice } = useQuery({
    queryKey: ["txn-review-linked-invoice", linkedInvoiceId],
    queryFn: async () => {
      if (!linkedInvoiceId) return null;
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, vendor_name, gross_amount, invoice_date, file_path")
        .eq("id", linkedInvoiceId)
        .maybeSingle();
      return data;
    },
    enabled: !!linkedInvoiceId,
  });

  const [linkedInvoicePdfUrl, setLinkedInvoicePdfUrl] = useState<string | null>(null);
  const [showLinkedInvoicePdf, setShowLinkedInvoicePdf] = useState(false);

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
    queryKey: ["all-invoices-building", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, vendor_name, gross_amount, invoice_date, status, vendor_iban, file_path")
        .eq("building_id", buildingId)
        .order("invoice_date", { ascending: false })
        .limit(300);
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
        .select("id, name, vendor_name, expected_amount, amount_tolerance, interval, account_id, vat_rate, is_35a_relevant, vendor_iban, valid_from, valid_to, chart_of_accounts(account_number, account_name)")
        .eq("building_id", buildingId)
        .order("name");
      return data || [];
    },
    enabled: open && !!buildingId,
  });

  // Billing periods for fiscal year detection
  const { data: billingPeriods = [] } = useQuery({
    queryKey: ["billing-periods-fiscal", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_periods")
        .select("id, fiscal_year, period_from, period_to")
        .eq("building_id", buildingId)
        .order("fiscal_year", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: open && !!buildingId,
  });

  // Heating units for fuel purchase assignment
  const { data: heatingUnits = [] } = useQuery({
    queryKey: ["heating-units-review", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("heating_units")
        .select("id, name")
        .eq("building_id", buildingId)
        .order("created_at");
      return data || [];
    },
    enabled: open && !!buildingId,
  });
  const getFiscalYearForDate = useCallback((dateStr: string): number => {
    if (!dateStr) return new Date().getFullYear();
    const date = new Date(dateStr);
    for (const bp of billingPeriods) {
      const from = new Date(bp.period_from);
      const to = new Date(bp.period_to);
      if (date >= from && date <= to) {
        return bp.fiscal_year;
      }
    }
    return date.getFullYear();
  }, [billingPeriods]);

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
    const fiscalYear = getFiscalYearForDate(txnDate);
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
      booking_reference: formatMonthYearRef(txnDate),
      booking_date: txnDate,
      receipt_number: "",
      booking_type: isIncome ? "income" : "expense",
      is_35a_relevant: false,
      amount_35a: "",
      fiscal_year: fiscalYear,
      invoice_id: currentTxn?.matched_invoice_id || null,
      matched_template_id: currentTxn?.matched_template_id || null,
      booked: false,
      needs_review: false,
      review_note: "",
      is_fuel_purchase: false,
      fuel_type: "",
      fuel_quantity: "",
      fuel_total_price: "",
      fuel_date: txnDate,
      fuel_co2_emissions_kg: "",
      fuel_co2_tax_amount: "",
      fuel_energy_content_kwh: "",
      fuel_heating_unit_id: "",
      fuel_consumption_from: "",
      fuel_consumption_to: "",
      line_items_detail: null,
      ...overrides,
    };
  }, [currentTxn, accounts, getFiscalYearForDate]);

  // Auto-fill form rows when transaction changes
  useEffect(() => {
    if (!currentTxn || accounts.length === 0) return;

    // Defensive: clean up orphaned partial split bookings that may still be in
    // the DB from earlier aborted attempts (txn not booked, but bookings exist).
    // The server-side function only deletes when booked_at IS NULL, so already
    // fully booked transactions are never touched here.
    if (!currentTxn.booked_at) {
      (async () => {
        try {
          const { data } = await supabase.rpc("cleanup_orphan_split_bookings", { p_bank_transaction_id: currentTxn.id });
          if ((data as any)?.deleted > 0) {
            toast.info(`${(data as any).deleted} unvollständige Teilbuchung(en) bereinigt`, { duration: 2000 });
            queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
          }
        } catch { /* non-blocking */ }
      })();
    }

    // Save the previous transaction's edits into the cache
    const prevId = previousTxnIdRef.current;
    if (prevId && prevId !== currentTxn.id) {
      // Capture current formRows snapshot for the previous txn
      setFormRows((prevRows) => {
        if (prevRows.length > 0 && !prevRows.every(r => r.booked)) {
          editsCacheRef.current[prevId] = prevRows;
        }
        return prevRows;
      });
    }
    previousTxnIdRef.current = currentTxn.id;

    // If we have cached edits for this transaction, restore them instead of rebuilding
    const cached = editsCacheRef.current[currentTxn.id];
    if (cached && cached.length > 0) {
      setFormRows(cached);
      setExpandedRowId(cached.find(r => !r.booked)?.id || cached[0].id);
      setShowLinkedInvoicePdf(false);
      setLinkedInvoicePdfUrl(null);
      return;
    }

    const txnDate = currentTxn.booking_date;
    const fiscalYear = getFiscalYearForDate(txnDate);
    const absAmount = Math.abs(currentTxn.amount);
    const isIncome = currentTxn.amount > 0;
    const bankAccount = accounts.find(a => a.account_number === "1800") || accounts.find(a => a.account_number === "1200") || accounts.find(a => a.category === "Bankkonto");
    const defaultBankAccountId = bankAccount?.id || "";

    // Check for AI split suggestion
    const aiSuggestion = currentTxn.ai_suggestion;
    const suggestedBookings = aiSuggestion?.booking_hint?.suggested_bookings;
    const isSplit = aiSuggestion?.booking_hint?.type === "split" && suggestedBookings?.length > 1;

    if (isSplit) {
      // Multiple booking rows from AI.
      // Splitbuchungen IMMER nach RGI-Schema:
      //   "MM/JJ <Gegenkonto> <Lieferant>, Re. Nr. <invoice_number>"
      const invoiceNumber = (invoiceDetail as any)?.invoice_number || null;
      const vendorName = resolveVendor((invoiceDetail as any)?.vendor_name || null);
      const rows: BookingRowData[] = suggestedBookings.map((sb: any, idx: number) => {
        let counterAccountId = "";
        if (sb.account_id) counterAccountId = sb.account_id;
        if (sb.account_number) {
          const acc = accounts.find(a => a.account_number === sb.account_number);
          if (acc) counterAccountId = acc.id;
        }

        const rowAmount = sb.amount != null ? Math.abs(sb.amount) : absAmount / suggestedBookings.length;
        const counterAcc = accounts.find(a => a.id === counterAccountId);
        const accountLabel = counterAcc?.account_name || "";
        const receiptNo = sb.receipt_number || invoiceNumber || "";
        const splitDescription = buildBookingText({
          period: null,
          invoiceNumber: receiptNo,
          vendorName,
          counterAccountName: accountLabel,
        }) || sb.description || "";

        return {
          id: nextRowId(),
          account_id: defaultBankAccountId,
          counter_account_id: counterAccountId,
          amount: rowAmount.toFixed(2),
          vat_rate: sb.vat_rate != null ? String(sb.vat_rate) : "19",
          vat_amount: "",
          description: splitDescription,
          __autoTextSignature: splitDescription,
          booking_reference: formatMonthYearRef(txnDate),
          booking_date: txnDate || "",
          receipt_number: receiptNo,
          booking_type: sb.booking_type || (isIncome ? "income" : "expense"),
          is_35a_relevant: sb.is_35a_relevant || false,
          amount_35a: sb.is_35a_relevant && sb.amount_35a != null ? String(sb.amount_35a) : "",
          line_items_detail: sb.is_35a_relevant && sb.amount_35a != null
            ? build35aDetailFromSuggestion(
                (invoiceDetail as any)?.line_items,
                Number(sb.amount_35a) || 0,
                (accounts.find((a: any) => a.id === counterAccountId)?.settlement_35a_type === "handwerker" ? "handwerker" : "dienste"),
                sb.vat_rate != null ? Number(sb.vat_rate) : 19,
              )
            : null as any,
          fiscal_year: fiscalYear,
          invoice_id: (invoiceDetail as any)?.id || currentTxn?.matched_invoice_id || null,
          matched_template_id: sb.template_id || null,
          booked: false,
          needs_review: false,
          review_note: "",
          is_fuel_purchase: false,
          fuel_type: "",
          fuel_quantity: "",
          fuel_total_price: "",
          fuel_date: txnDate || "",
          fuel_co2_emissions_kg: "",
          fuel_co2_tax_amount: "",
          fuel_energy_content_kwh: "",
          fuel_heating_unit_id: "",
          fuel_consumption_from: "",
          fuel_consumption_to: "",
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
      const _tplCounter = accounts.find(a => a.id === templateDetail.account_id);
      row.description = buildBookingText({
        period: null,
        invoiceNumber: null,
        vendorName: null,
        counterAccountName: _tplCounter?.account_name || templateDetail.chart_of_accounts?.account_name || null,
      });
      row.__autoTextSignature = row.description;
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
      {
        const _invCounterId = invoiceDetail.suggested_account_id || row.counter_account_id;
        const _invCounter = accounts.find(a => a.id === _invCounterId);
        row.description = buildBookingText({
          period: null,
          invoiceNumber: invoiceDetail.invoice_number,
          vendorName: resolveVendor(invoiceDetail.vendor_name),
          counterAccountName: _invCounter?.account_name || null,
        });
        row.__autoTextSignature = row.description;
      }
      row.invoice_id = invoiceDetail.id;
      if (invoiceDetail.gross_amount && invoiceDetail.net_amount) {
        const vatPct = ((invoiceDetail.gross_amount / invoiceDetail.net_amount) - 1) * 100;
        row.vat_rate = String(Math.round(vatPct));
      }

      // Use AI suggestion as fallback/supplement for fields the invoice doesn't provide
      if (aiSuggestion && suggestedBookings?.[0]) {
        const sb = suggestedBookings[0];
        // Counter account: invoice OCR first, then AI
        if (!row.counter_account_id) {
          if (sb.account_id) row.counter_account_id = sb.account_id;
          else if (sb.account_number) {
            const acc = accounts.find(a => a.account_number === sb.account_number);
            if (acc) row.counter_account_id = acc.id;
          } else if (sb.counter_account_number) {
            const acc = accounts.find(a => a.account_number === sb.counter_account_number);
            if (acc) row.counter_account_id = acc.id;
          }
        }
        // §35a from AI (invoice OCR rarely provides this)
        if (sb.is_35a_relevant) {
          row.is_35a_relevant = true;
          if (sb.amount_35a != null) {
            row.amount_35a = String(sb.amount_35a);
            const acc = accounts.find((a: any) => a.id === row.counter_account_id);
            const t35a: "handwerker" | "dienste" = acc?.settlement_35a_type === "handwerker" ? "handwerker" : "dienste";
            row.line_items_detail = build35aDetailFromSuggestion(
              (invoiceDetail as any)?.line_items,
              Number(sb.amount_35a) || 0,
              t35a,
              sb.vat_rate != null ? Number(sb.vat_rate) : (parseAmount(row.vat_rate) || 19),
            );
          }
        }
        // Booking type from AI if not already set
        if (sb.booking_type) row.booking_type = sb.booking_type;
      }
      // Fallback to template_suggestion from AI
      if (!row.counter_account_id && aiSuggestion?.template_suggestion) {
        const ts = aiSuggestion.template_suggestion;
        if (ts.account_number) {
          const acc = accounts.find(a => a.account_number === ts.account_number);
          if (acc) row.counter_account_id = acc.id;
        }
      }
    }

    // Auto-fill fuel purchase from OCR data
    if (invoiceDetail) {
      const ocrData = (invoiceDetail as any).ocr_extracted_data;
      if (ocrData?.is_fuel_purchase) {
        row.is_fuel_purchase = true;
        const ft = ocrData.fuel_type;
        row.fuel_type = ft === "pellets" ? "pellets" : ft === "gas" ? "gas" : ft === "district_heating" ? "district_heating" : "oil";
        row.fuel_quantity = ocrData.fuel_quantity ? String(ocrData.fuel_quantity) : "";
        row.fuel_total_price = invoiceDetail.gross_amount ? String(invoiceDetail.gross_amount) : "";
        row.fuel_date = invoiceDetail.invoice_date || currentTxn.booking_date || "";
        if (ocrData.co2_emissions_kg != null) row.fuel_co2_emissions_kg = String(ocrData.co2_emissions_kg);
        if (ocrData.co2_tax_amount_eur != null) row.fuel_co2_tax_amount = String(ocrData.co2_tax_amount_eur);
        if (ocrData.energy_content_kwh != null) row.fuel_energy_content_kwh = String(ocrData.energy_content_kwh);

        // Verbrauchszeitraum: bei Jahresabrechnungen für Gas/Fernwärme aus billing_period_*, sonst Lieferdatum
        const isAnnualGasFW =
          ocrData.invoice_type === "annual_settlement" &&
          (row.fuel_type === "gas" || row.fuel_type === "district_heating");
        if (isAnnualGasFW && ocrData.billing_period_from && ocrData.billing_period_to) {
          row.fuel_consumption_from = String(ocrData.billing_period_from);
          row.fuel_consumption_to = String(ocrData.billing_period_to);
        } else {
          row.fuel_consumption_from = row.fuel_date;
          row.fuel_consumption_to = row.fuel_date;
        }
      }
    }

    // Auto-fill from single AI suggestion (no invoice, no template)
    if (!templateDetail && !invoiceDetail && aiSuggestion) {
      if (suggestedBookings?.[0]) {
        const sb = suggestedBookings[0];
        if (sb.account_id) row.counter_account_id = sb.account_id;
        if (sb.account_number) {
          const acc = accounts.find(a => a.account_number === sb.account_number);
          if (acc) row.counter_account_id = acc.id;
        }
        if (sb.counter_account_number && !row.counter_account_id) {
          const acc = accounts.find(a => a.account_number === sb.counter_account_number);
          if (acc) row.counter_account_id = acc.id;
        }
        if (sb.booking_type) row.booking_type = sb.booking_type;
        if (sb.is_35a_relevant) {
          row.is_35a_relevant = true;
          if (sb.amount_35a != null) {
            row.amount_35a = String(sb.amount_35a);
            const acc = accounts.find((a: any) => a.id === row.counter_account_id);
            const t35a: "handwerker" | "dienste" = acc?.settlement_35a_type === "handwerker" ? "handwerker" : "dienste";
            row.line_items_detail = build35aDetailFromSuggestion(
              (invoiceDetail as any)?.line_items,
              Number(sb.amount_35a) || 0,
              t35a,
              sb.vat_rate != null ? Number(sb.vat_rate) : (parseAmount(row.vat_rate) || 19),
            );
          }
        }
      }
      // Auto-fill from template_suggestion if no other source
      if (!row.counter_account_id && aiSuggestion.template_suggestion) {
        const ts = aiSuggestion.template_suggestion;
        if (ts.account_number) {
          const acc = accounts.find(a => a.account_number === ts.account_number);
          if (acc) row.counter_account_id = acc.id;
        }
      }
      // Buchungstext IMMER nach RGI-Schema bauen (auch bei reinem AI-Vorschlag ohne Rechnung)
      const _aiCounter = accounts.find((a: any) => a.id === row.counter_account_id);
      const _vendorFromTxn = currentTxn.amount < 0 ? currentTxn.creditor_name : currentTxn.debtor_name;
      const _aiText = buildBookingText({
        period: null,
        invoiceNumber: row.receipt_number || null,
        vendorName: resolveVendor(_vendorFromTxn || null),
        counterAccountName: _aiCounter?.account_name || null,
      });
      if (_aiText) {
        row.description = _aiText;
        row.__autoTextSignature = _aiText;
      }
    }

    // Fiscal year hint from AI - only show when fiscal year differs or accrual needed
    if (aiSuggestion?.fiscal_year_hint) {
      const hint = aiSuggestion.fiscal_year_hint;
      const defaultFiscalYear = getFiscalYearForDate(currentTxn.booking_date);
      const hintFiscalYear = hint.fiscal_year || defaultFiscalYear;
      
      if (hint.fiscal_year) row.fiscal_year = hint.fiscal_year;
      
      // Only show accrual hint if fiscal year differs or accrual is actually needed
      const fiscalYearDiffers = hintFiscalYear !== defaultFiscalYear;
      if (fiscalYearDiffers || hint.needs_accrual) {
        row.accrualHint = {
          needs_accrual: hint.needs_accrual || false,
          accrual_explanation: hint.accrual_explanation || "",
          service_period_from: hint.service_period_from,
          service_period_to: hint.service_period_to,
        };
      }
    }

    // VAT defaults from counter account
    if (row.counter_account_id) {
      const selectedCounterAcc = accounts.find(a => a.id === row.counter_account_id);
      const isAccrualAccount = selectedCounterAcc?.account_number?.startsWith("4");
      if (isAccrualAccount && !invoiceDetail && !templateDetail && !(aiSuggestion?.booking_hint?.suggested_bookings?.[0]?.vat_rate != null)) {
        // 4000er accounts: VAT must be explicitly chosen, not pre-filled
        row.vat_rate = "";
      } else if (selectedCounterAcc?.default_vat_rate != null && !invoiceDetail && !templateDetail) {
        row.vat_rate = String(selectedCounterAcc.default_vat_rate);
      }
      if (selectedCounterAcc?.is_35a_relevant) {
        row.is_35a_relevant = true;
      }
    }

    setFormRows([row]);
    setExpandedRowId(row.id);
    setShowLinkedInvoicePdf(false);
    setLinkedInvoicePdfUrl(null);
  }, [currentTxn?.id, templateDetail, invoiceDetail, accounts, currentTxn?.ai_suggestion, getFiscalYearForDate]);

  /** Helper: build the auto RGI text for a row given its current state. */
  const buildAutoTextForRow = useCallback((r: BookingRowData, override?: Partial<BookingRowData>): string => {
    const eff: BookingRowData = { ...r, ...(override || {}) } as BookingRowData;
    const ca = accounts.find((a: any) => a.id === eff.counter_account_id);
    const vendorFromTxn = currentTxn ? (currentTxn.amount < 0 ? currentTxn.creditor_name : currentTxn.debtor_name) : null;
    return buildBookingText({
      period: null,
      invoiceNumber: eff.receipt_number || (invoiceDetail as any)?.invoice_number || null,
      vendorName: resolveVendor((invoiceDetail as any)?.vendor_name || vendorFromTxn || null),
      counterAccountName: ca?.account_name || null,
    });
  }, [accounts, invoiceDetail, vendorAliases, buildingId, currentTxn]);

  const updateRow = (rowId: string, field: string, value: string | boolean | number) => {
    setFormRows(rows => rows.map(r => {
      if (r.id !== rowId) return r;
      let next: BookingRowData;
      if (field === "fiscal_year") {
        const parsed = typeof value === "string" ? parseInt(value) : (typeof value === "number" ? value : r.fiscal_year);
        next = { ...r, fiscal_year: parsed || r.fiscal_year } as BookingRowData;
      } else if (field === "line_items_detail") {
        try {
          const parsed = typeof value === "string" ? JSON.parse(value) : null;
          next = { ...r, line_items_detail: parsed } as BookingRowData;
        } catch { return r; }
      } else {
        next = { ...r, [field]: value } as BookingRowData;
      }

      // Auto-rebuild Buchungstext bei relevanten Feldern – nur wenn User noch nicht manuell geändert hat
      if (field === "counter_account_id" || field === "receipt_number" || field === "invoice_id" || field === "booking_date") {
        const newAuto = buildAutoTextForRow(next);
        const vendorFromTxn = currentTxn ? (currentTxn.amount < 0 ? currentTxn.creditor_name : currentTxn.debtor_name) : null;
        const rebuilt = rebuildBookingTextIfAuto(next.description, next.__autoTextSignature, {
          period: null,
          invoiceNumber: next.receipt_number || (invoiceDetail as any)?.invoice_number || null,
          vendorName: resolveVendor((invoiceDetail as any)?.vendor_name || vendorFromTxn || null),
          counterAccountName: accounts.find((a: any) => a.id === next.counter_account_id)?.account_name || null,
        });
        next = { ...next, description: rebuilt.text, __autoTextSignature: rebuilt.signature || newAuto };
      } else if (field === "description") {
        // User editiert manuell – Signatur bleibt, damit isAuto false zurückgibt
        // (nichts zu tun)
      }
      return next;
    }));
  };

  const addRow = () => {
    const newRow = createDefaultRow({ amount: "0.00" });
    setFormRows(rows => [...rows, newRow]);
    setExpandedRowId(newRow.id);
  };

  const removeRow = (rowId: string) => {
    setFormRows(rows => rows.filter(r => r.id !== rowId));
    setRowLineSelections(prev => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    if (expandedRowId === rowId) setExpandedRowId(null);
  };

  /**
   * Apply a set of selected invoice line-item indices to a booking row:
   * sets amount = sum of selected items. Buchungstext folgt strikt RGI-Schema
   * (Periode + Re.Nr. + Lieferant + Gegenkonto), wird aber nur überschrieben,
   * wenn der User den Text nicht manuell editiert hat.
   */
  const applySelectionToRow = useCallback((rowId: string, indices: number[], items: any[]) => {
    setFormRows(rows => rows.map(r => {
      if (r.id !== rowId) return r;
      const sum = indices.reduce((s, idx) => {
        const it = items[idx];
        return s + getLineItemGross(it, fallbackVatRate);
      }, 0);
      const ca = accounts.find((a: any) => a.id === r.counter_account_id);
      const rebuilt = rebuildBookingTextIfAuto(r.description, r.__autoTextSignature, {
        period: null,
        invoiceNumber: r.receipt_number || (invoiceDetail as any)?.invoice_number || null,
        vendorName: resolveVendor((invoiceDetail as any)?.vendor_name || null),
        counterAccountName: ca?.account_name || null,
      });
      return {
        ...r,
        amount: sum > 0 ? sum.toFixed(2) : r.amount,
        description: rebuilt.text,
        __autoTextSignature: rebuilt.signature,
      } as BookingRowData;
    }));
  }, [invoiceDetail, fallbackVatRate, accounts, vendorAliases, buildingId]);

  const toggleLineItemForActiveRow = useCallback((index: number, items: any[]) => {
    if (!expandedRowId) {
      toast.info("Bitte zuerst eine Buchung links aufklappen");
      return;
    }
    const rowId = expandedRowId;
    setRowLineSelections(prev => {
      const current = prev[rowId] || [];
      const next = current.includes(index)
        ? current.filter(i => i !== index)
        : [...current, index];
      const updated = { ...prev, [rowId]: next };
      // Apply to booking row in next tick (state already prepared)
      queueMicrotask(() => applySelectionToRow(rowId, next, items));
      return updated;
    });
  }, [expandedRowId, applySelectionToRow]);

  const createNewBookingFromSelection = useCallback((items: any[]) => {
    if (!expandedRowId) return;
    const sourceSelection = rowLineSelections[expandedRowId] || [];
    if (sourceSelection.length === 0) return;
    // Take indices NOT yet selected for the next row
    const usedAnywhere = new Set<number>();
    Object.values(rowLineSelections).forEach(arr => arr.forEach(i => usedAnywhere.add(i)));
    const remaining = items.map((_, i) => i).filter(i => !usedAnywhere.has(i));

    // Vorbefüllung aus invoiceDetail, damit jeder Split automatisch
    // Re.Nr. + Lieferant + Periode im Buchungstext hat (RGI-Schema).
    const inv: any = invoiceDetail || null;
    const receiptNo = inv?.invoice_number || "";
    const autoText = buildBookingText({
      period: null,
      invoiceNumber: receiptNo,
      vendorName: resolveVendor(inv?.vendor_name || null),
      counterAccountName: null,
    });
    const newRow = createDefaultRow({
      amount: "0.00",
      invoice_id: inv?.id || null,
      receipt_number: receiptNo,
      description: autoText,
      __autoTextSignature: autoText,
    });
    setFormRows(rows => [...rows, newRow]);
    setExpandedRowId(newRow.id);
    if (remaining.length > 0) {
      setRowLineSelections(prev => ({ ...prev, [newRow.id]: [] }));
      // user picks from remaining — no auto-selection
    }
  }, [expandedRowId, rowLineSelections, invoiceDetail, currentTxn, createDefaultRow, vendorAliases, buildingId]);



  const focusFieldByName = useCallback((nextField: string) => {
    const el = fieldRefs.current[nextField];
    if (!el) return;
    if (nextField === "__book__") {
      const btn = el as HTMLButtonElement;
      btn.focus();
      if (!btn.disabled) setTimeout(() => btn.click(), 0);
      return;
    }
    if (el instanceof HTMLButtonElement && el.getAttribute("role") === "combobox") {
      el.focus();
      return;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "number")) {
        el.select?.();
      }
      return;
    }
    const trigger = el.querySelector('button[role="combobox"], button, input') as HTMLElement | null;
    trigger?.focus();
  }, []);

  const focusNextOf = useCallback((currentField: string) => {
    const idx = FIELD_ORDER.indexOf(currentField);
    if (idx < 0) return;
    const nextField = FIELD_ORDER[idx + 1];
    if (!nextField) return;
    focusFieldByName(nextField);
  }, [focusFieldByName]);

  const handleEnterNavigation = (e: React.KeyboardEvent, currentField: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusNextOf(currentField);
    }
  };

  const handleBookRow = useCallback(async (rowId: string) => {
    if (!currentTxn || bookingSingle || !user) return;

    const row = formRows.find(r => r.id === rowId);
    if (!row) return;

    if (!row.account_id) {
      toast.error("Bitte ein Konto auswählen");
      return;
    }

    // For 4000-series accrual accounts, VAT rate is mandatory
    const counterAcc = accounts.find(a => a.id === row.counter_account_id);
    if (counterAcc?.account_number?.startsWith("4") && !row.vat_rate) {
      toast.error("Bei Abgrenzungskonten (4000er) muss der MwSt-Satz angegeben werden");
      return;
    }

    setBookingSingle(rowId);
    try {
      const totalParts = formRows.length;
      const isSplitTxn = totalParts > 1;

      // For SPLIT transactions: buffer rows locally and only flush ALL of them
      // atomically when the user confirms the LAST unbooked row. This guarantees
      // "all or nothing" — no half-booked split can ever stay in the DB.
      if (isSplitTxn) {
        const updatedRows = formRows.map(r => r.id === rowId ? { ...r, booked: true } : r);
        const allBooked = updatedRows.every(r => r.booked);

        if (!allBooked) {
          // Just mark this row as confirmed in local state, no DB write yet.
          setFormRows(updatedRows);
          toast.success("Teilbuchung vorgemerkt ✓", { duration: 1200 });
          const nextUnbooked = updatedRows.find(r => !r.booked);
          if (nextUnbooked) setExpandedRowId(nextUnbooked.id);
          return;
        }

        // Last row: validate every row first
        for (const r of updatedRows) {
          if (!r.account_id) {
            toast.error("Eine Teilzeile hat kein Konto");
            setBookingSingle(null);
            return;
          }
        }

        // Build payloads for the RPC
        const payloads = updatedRows.map((r) => {
          const amt = parseAmount(r.amount) || 0;
          const vatR = parseAmount(r.vat_rate) || 0;
          const vatA = parseAmount(r.vat_amount) || 0;
          const a35a = r.is_35a_relevant && r.amount_35a ? parseAmount(r.amount_35a) : null;
          return {
            building_id: buildingId,
            account_id: r.account_id,
            counter_account_id: r.counter_account_id || null,
            amount: amt,
            vat_rate: vatR,
            vat_amount: vatA > 0 ? vatA : null,
            description: r.description || null,
            booking_reference: r.booking_reference || currentTxn?.end_to_end_ref || null,
            booking_date: r.booking_date,
            receipt_number: r.receipt_number || null,
            booking_type: r.booking_type,
            fiscal_year: r.fiscal_year,
            invoice_id: r.invoice_id || null,
            matched_template_id: r.matched_template_id || null,
            is_35a_relevant: r.is_35a_relevant,
            amount_35a: a35a,
            needs_review: r.needs_review,
            review_note: r.review_note || null,
            line_items_detail: r.line_items_detail || null,
          };
        });

        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "book_split_transaction",
          { p_bank_transaction_id: currentTxn.id, p_bookings: payloads as any },
        );
        if (rpcError) throw rpcError;
        const bookingIds: string[] = ((rpcData as any)?.booking_ids ?? []) as string[];

        // Mark all rows as booked in UI
        setFormRows(updatedRows);

        // Cleanup local refs / undo
        const priorRowsSnapshot = (editsCacheRef.current[currentTxn.id] || formRows).map(r => ({ ...r, booked: false }));
        delete pendingBookingIdsRef.current[currentTxn.id];
        delete editsCacheRef.current[currentTxn.id];
        delete rowBookingMapRef.current[currentTxn.id];
        setUndoStack(stack => {
          const next: UndoEntry[] = [
            ...stack,
            { txnId: currentTxn.id, txnIndex: currentIndex, bookingIds, priorRows: priorRowsSnapshot },
          ];
          return next.slice(-10);
        });

        setBookedCount(c => c + 1);
        toast.success(`${totalParts} Buchungen erstellt ✓`, { duration: 1500 });

        queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
        queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
        queryClient.invalidateQueries({ queryKey: ["bookings-all"] });

        if (currentIndex < transactions.length - 1) {
          setCurrentIndex(i => i + 1);
        }
        return;
      }

      // ─────────────── SINGLE-ROW (non-split) BOOKING — original logic ───────────────
      const amount = parseAmount(row.amount) || 0;
      const vatRate = parseAmount(row.vat_rate) || 0;
      const vatAmount = parseAmount(row.vat_amount) || 0;
      const amount35a = row.is_35a_relevant && row.amount_35a ? parseAmount(row.amount_35a) : null;
      const partIndex = 1;

      const existingBookingId = rowBookingMapRef.current[currentTxn.id]?.[rowId];
      const isUpdate = row.booked && !!existingBookingId;

      // Safety net: if marked as booked but DB record gone, fall back to insert
      if (isUpdate) {
        const { data: check } = await supabase.from("bookings").select("id").eq("id", existingBookingId).maybeSingle();
        if (!check) {
          if (rowBookingMapRef.current[currentTxn.id]) delete rowBookingMapRef.current[currentTxn.id][rowId];
          setFormRows(rows => rows.map(r => r.id === rowId ? { ...r, booked: false } : r));
          toast.error("Buchung nicht mehr vorhanden – bitte erneut buchen");
          setBookingSingle(null);
          return;
        }
      }

      const payload: any = {
        building_id: buildingId,
        account_id: row.account_id,
        counter_account_id: row.counter_account_id || null,
        amount,
        vat_rate: vatRate,
        vat_amount: vatAmount > 0 ? vatAmount : null,
        description: row.description || null,
        booking_reference: row.booking_reference || currentTxn?.end_to_end_ref || null,
        booking_date: row.booking_date,
        receipt_number: row.receipt_number || null,
        booking_type: row.booking_type,
        fiscal_year: row.fiscal_year,
        invoice_id: row.invoice_id,
        matched_template_id: row.matched_template_id,
        is_35a_relevant: row.is_35a_relevant,
        amount_35a: amount35a,
        needs_review: row.needs_review,
        review_note: row.review_note || null,
        line_items_detail: row.line_items_detail || null,
      };

      let booking: { id: string };
      if (isUpdate) {
        const { data, error } = await supabase.from("bookings").update(payload).eq("id", existingBookingId).select("id").single();
        if (error) throw error;
        booking = data;
      } else {
        const { data, error } = await supabase.from("bookings").insert({
          ...payload,
          source: "bank_import",
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.id,
          created_by: user.id,
          bank_transaction_id: currentTxn.id,
          split_part: null,
          split_parts_total: null,
        } as any).select("id").single();
        if (error) throw error;
        booking = data;

        // Phase 6: Feedback-Loop — capture how the user used (or corrected) the AI suggestion.
        try {
          const aiSug = currentTxn.ai_suggestion;
          const aiSb = aiSug?.booking_hint?.suggested_bookings?.[partIndex - 1]
            || aiSug?.booking_hint?.suggested_bookings?.[0];
          if (aiSug && aiSb) {
            const aiCounterAccId = (() => {
              if (aiSb.counter_account_id) return aiSb.counter_account_id;
              const num = aiSb.counter_account_number || aiSb.account_number;
              if (num) return accounts.find(a => a.account_number === num)?.id ?? null;
              return null;
            })();
            const aiAccountId = aiSb.account_id ?? null;
            const aiBookingType = aiSb.booking_type ?? null;
            const accepted =
              (aiAccountId == null || aiAccountId === row.account_id) &&
              (aiCounterAccId == null || aiCounterAccId === row.counter_account_id) &&
              (aiBookingType == null || aiBookingType === row.booking_type);

            const ragRefs: string[] = [
              ...(Array.isArray(aiSb.rag_references) ? aiSb.rag_references : []),
              ...((aiSug.matches || []).map((m: any) => m.id).filter(Boolean)),
            ];

            await supabase.from("ai_booking_feedback").insert({
              bank_transaction_id: currentTxn.id,
              building_id: buildingId,
              management_mode: (currentTxn as any)?.management_mode ?? null,
              ai_suggested_account_id: aiAccountId,
              ai_suggested_counter_account_id: aiCounterAccId,
              ai_suggested_booking_type: aiBookingType,
              ai_confidence_score: typeof aiSb.confidence === "number" ? aiSb.confidence : null,
              user_accepted: accepted,
              user_corrected_account_id: accepted ? null : row.account_id,
              user_corrected_counter_account_id: accepted ? null : (row.counter_account_id || null),
              user_corrected_booking_type: accepted ? null : row.booking_type,
              rag_example_ids: ragRefs.length ? ragRefs : null,
              created_by: user.id,
            } as any);
          }
        } catch (fbErr) {
          console.warn("[ai_booking_feedback] insert failed (non-blocking)", fbErr);
        }
      }

      // Save fuel purchase to fuel_inventory (runs on both insert AND update)
      if (row.is_fuel_purchase && row.fuel_type && row.fuel_quantity) {
        const fuelUnit = row.fuel_type === "oil" ? "l"
          : row.fuel_type === "pellets" ? "kg"
          : "kWh";
        const quantity = parseAmount(row.fuel_quantity) || 0;
        const totalPrice = parseAmount(row.fuel_total_price) || 0;
        const unitPrice = quantity > 0 ? totalPrice / quantity : 0;

        const matchingPeriod = billingPeriods.find(bp => {
          const from = new Date(bp.period_from);
          const to = new Date(bp.period_to);
          const entryDate = new Date(row.fuel_date || row.booking_date);
          return entryDate >= from && entryDate <= to;
        });

        const fuelLabel = row.fuel_type === "oil" ? "Heizöl"
          : row.fuel_type === "pellets" ? "Pellets"
          : row.fuel_type === "gas" ? "Gas"
          : "Fernwärme";

        const co2Emissions = parseAmount(row.fuel_co2_emissions_kg);
        const co2Tax = parseAmount(row.fuel_co2_tax_amount);
        const energyKwh = parseAmount(row.fuel_energy_content_kwh);

        // Avoid duplicates on update: remove prior entries for this invoice
        if (row.invoice_id) {
          await supabase.from("fuel_inventory")
            .delete()
            .eq("building_id", buildingId)
            .eq("invoice_id", row.invoice_id)
            .eq("entry_type", "purchase");
        }

        await supabase.from("fuel_inventory").insert({
          building_id: buildingId,
          fuel_type: row.fuel_type,
          entry_type: "purchase",
          entry_date: row.fuel_date || row.booking_date,
          quantity,
          unit: fuelUnit,
          total_price: totalPrice,
          unit_price: unitPrice > 0 ? unitPrice : null,
          invoice_id: row.invoice_id || null,
          billing_period_id: matchingPeriod?.id || null,
          heating_unit_id: row.fuel_heating_unit_id || null,
          co2_emissions_kg: !isNaN(co2Emissions) && co2Emissions > 0 ? co2Emissions : null,
          co2_tax_amount: !isNaN(co2Tax) && co2Tax > 0 ? co2Tax : null,
          energy_content_kwh: !isNaN(energyKwh) && energyKwh > 0 ? energyKwh : null,
          consumption_period_from: row.fuel_consumption_from || row.fuel_date || row.booking_date,
          consumption_period_to: row.fuel_consumption_to || row.fuel_date || row.booking_date,
          notes: `Brennstoffkauf ${fuelLabel}: ${quantity} ${fuelUnit}`,
        } as any);

        queryClient.invalidateQueries({ queryKey: ["fuel-inventory"] });
        queryClient.invalidateQueries({ queryKey: ["fuel-bookings"] });
      }

      // Update path: row already booked → only update DB record, keep state green, don't advance
      if (isUpdate) {
        toast.success("Buchung aktualisiert ✓", { duration: 1500 });
        queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
        queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
        queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
        setBookingSingle(null);
        return;
      }


      // Track created booking ids for this txn (for undo)
      pendingBookingIdsRef.current[currentTxn.id] = [
        ...(pendingBookingIdsRef.current[currentTxn.id] || []),
        booking.id,
      ];
      // Map row → booking for individual undo
      if (!rowBookingMapRef.current[currentTxn.id]) rowBookingMapRef.current[currentTxn.id] = {};
      rowBookingMapRef.current[currentTxn.id][rowId] = booking.id;

      // Mark this row as booked
      setFormRows(rows => rows.map(r => r.id === rowId ? { ...r, booked: true } : r));

      // Single-row txn: mark transaction as booked
      await supabase.from("bank_transactions").update({
        booked_at: new Date().toISOString(),
        booking_id: booking.id,
      }).eq("id", currentTxn.id);

      // Push to undo stack (keep priorRows so we can restore on undo)
      const priorRowsSnapshot = (editsCacheRef.current[currentTxn.id] || formRows).map(r => ({ ...r, booked: false }));
      const createdIds = pendingBookingIdsRef.current[currentTxn.id] || [];
      delete pendingBookingIdsRef.current[currentTxn.id];
      delete editsCacheRef.current[currentTxn.id];
      delete rowBookingMapRef.current[currentTxn.id];
      setUndoStack(stack => {
        const next: UndoEntry[] = [
          ...stack,
          { txnId: currentTxn.id, txnIndex: currentIndex, bookingIds: createdIds, priorRows: priorRowsSnapshot },
        ];
        return next.slice(-10);
      });

      setBookedCount(c => c + 1);
      toast.success("Buchung erstellt ✓", { duration: 1500 });

      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ queryKey: ["bookings-all"] });

      if (currentIndex < transactions.length - 1) {
        setCurrentIndex(i => i + 1);
      }
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setBookingSingle(null);
    }
  }, [currentTxn, bookingSingle, user, formRows, buildingId, currentIndex, transactions.length, queryClient]);

  // Confirm all unbooked rows of the current transaction, then advance
  const confirmAndNext = useCallback(async () => {
    if (!currentTxn || bookingSingle) return;
    const unbookedRows = formRows.filter(r => !r.booked);
    if (unbookedRows.length === 0) {
      handleNext();
      return;
    }
    for (const row of unbookedRows) {
      // eslint-disable-next-line no-await-in-loop
      await handleBookRow(row.id);
    }
  }, [currentTxn, bookingSingle, formRows, handleBookRow]);

  // Undo last confirmed booking(s)
  const undoSingleRow = useCallback(async (rowId: string) => {
    if (!currentTxn || undoingRowId) return;
    const bookingId = rowBookingMapRef.current[currentTxn.id]?.[rowId];
    if (!bookingId) {
      toast.error("Buchung nicht gefunden");
      return;
    }
    setUndoingRowId(rowId);
    try {
      const { error: delErr } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (delErr) throw delErr;

      // If the txn was already marked fully booked (last split), reset it
      await supabase.from("bank_transactions").update({
        booked_at: null,
        booking_id: null,
      }).eq("id", currentTxn.id);

      // Remove from undoStack if this booking was part of the last entry
      setUndoStack(stack => stack
        .map(e => e.txnId === currentTxn.id ? { ...e, bookingIds: e.bookingIds.filter(id => id !== bookingId) } : e)
        .filter(e => e.bookingIds.length > 0));

      // Remove from pendingBookingIdsRef and rowBookingMap
      if (pendingBookingIdsRef.current[currentTxn.id]) {
        pendingBookingIdsRef.current[currentTxn.id] = pendingBookingIdsRef.current[currentTxn.id].filter(id => id !== bookingId);
      }
      if (rowBookingMapRef.current[currentTxn.id]) {
        delete rowBookingMapRef.current[currentTxn.id][rowId];
      }

      // Reset row state
      setFormRows(rows => {
        const next = rows.map(r => r.id === rowId ? { ...r, booked: false } : r);
        editsCacheRef.current[currentTxn.id] = next;
        return next;
      });
      setExpandedRowId(rowId);

      toast.success("Teilbuchung rückgängig gemacht", { duration: 1500 });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
    } catch (err: any) {
      toast.error("Rückgängig fehlgeschlagen: " + (err.message || "Unbekannt"));
    } finally {
      setUndoingRowId(null);
    }
  }, [currentTxn, undoingRowId, queryClient]);

  const undoLast = useCallback(async () => {
    if (undoing || undoStack.length === 0) return;
    setUndoing(true);
    try {
      const last = undoStack[undoStack.length - 1];
      // Delete the booking rows
      if (last.bookingIds.length > 0) {
        await supabase.from("bookings").delete().in("id", last.bookingIds);
      }
      // Reset the bank transaction
      await supabase.from("bank_transactions").update({
        booked_at: null,
        booking_id: null,
      }).eq("id", last.txnId);

      // Restore form-state cache so when user navigates back, edits return
      editsCacheRef.current[last.txnId] = last.priorRows;

      setUndoStack(stack => stack.slice(0, -1));
      setBookedCount(c => Math.max(0, c - 1));

      // Jump back to the undone transaction if possible
      if (last.txnIndex >= 0 && last.txnIndex < transactions.length) {
        setCurrentIndex(last.txnIndex);
      }

      toast.success("Buchung rückgängig gemacht", { duration: 1500 });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
      
    } catch (err: any) {
      toast.error("Rückgängig fehlgeschlagen: " + (err.message || "Unbekannt"));
    } finally {
      setUndoing(false);
    }
  }, [undoing, undoStack, transactions.length, queryClient]);

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

      // Cmd/Ctrl+Z = undo last booking (works even inside inputs)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (undoStack.length > 0) {
          e.preventDefault();
          undoLast();
        }
        return;
      }

      if (isInput) return;
      if (e.key === "ArrowRight") { e.preventDefault(); handleNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); handlePrev(); }
      if (e.key === "Enter") {
        e.preventDefault();
        // Only book the currently expanded, unbooked row; otherwise advance
        const expanded = expandedRowId ? formRows.find(r => r.id === expandedRowId) : null;
        if (expanded && !expanded.booked) {
          handleBookRow(expanded.id);
        } else {
          handleNext();
        }
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [open, handleNext, handlePrev, handleBookRow, expandedRowId, formRows, undoLast, undoStack.length]);

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


  const rerunAiAnalysis = useCallback(async () => {
    if (!currentTxn || rerunningAi) return;
    setRerunningAi(true);
    try {
      // Clear stale suggestion
      await supabase.from("bank_transactions")
        .update({ ai_suggestion: null } as any)
        .eq("id", currentTxn.id);

      // Load full context including accounts and booking instructions
      const { loadSuggestMatchContext, loadHistoricalBookings, buildSuggestMatchPayload } = await import("@/hooks/useSuggestMatchContext");
      const ctx = await loadSuggestMatchContext(buildingId);
      const historicalBookings = await loadHistoricalBookings(buildingId, currentTxn);
      const payload = buildSuggestMatchPayload(currentTxn, ctx, transactions, historicalBookings);

      const { data, error } = await supabase.functions.invoke("suggest-match", {
        body: payload,
      });

      if (!error && data && !data.error) {
        await supabase.from("bank_transactions")
          .update({ ai_suggestion: data } as any)
          .eq("id", currentTxn.id);
        toast.success("KI-Analyse aktualisiert");
      } else {
        toast.error("KI-Analyse fehlgeschlagen");
      }

      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setRerunningAi(false);
    }
  }, [currentTxn, rerunningAi, buildingId, transactions, queryClient]);

  const bulkResetAiSuggestions = useCallback(async () => {
    if (bulkResetting) return;
    setBulkResetting(true);
    try {
      const { error } = await supabase.from("bank_transactions")
        .update({ ai_suggestion: null } as any)
        .is("booked_at", null)
        .eq("building_id", buildingId);
      if (error) throw error;
      toast.success("Alle KI-Analysen zurückgesetzt – werden neu berechnet");
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setBulkResetting(false);
    }
  }, [bulkResetting, buildingId, queryClient]);

  // Sum validation for split bookings
  const currentTotal = useMemo(() => {
    return formRows.reduce((sum, row) => sum + (parseAmount(row.amount) || 0), 0);
  }, [formRows]);

  const isAmountMatching = currentTxn ? Math.abs(currentTotal - Math.abs(currentTxn.amount)) < 0.01 : false;

  const progressPercent = transactions.length > 0
    ? ((bookedCount) / (bookedCount + transactions.length)) * 100
    : 100;

  useEffect(() => { setCurrentIndex(initialIndex ?? 0); setBookedCount(0); }, [open, initialIndex]);
  useEffect(() => { setZuordnungOpen(false); }, [currentTxn?.id]);
  useEffect(() => { setRowLineSelections({}); setInvoiceViewTab("pdf"); }, [currentTxn?.id]);

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
              <span className="text-[11px]">Buchen & weiter</span>
              <span className="mx-1 text-border">|</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">←</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">→</kbd>
              <span className="text-[11px]">Nav</span>
              <span className="mx-1 text-border">|</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">⌘Z</kbd>
              <span className="text-[11px]">Rückgängig</span>
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={undoLast}
              disabled={undoStack.length === 0 || undoing}
              title="Letzte Buchung rückgängig (⌘Z)"
            >
              {undoing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              Rückgängig {undoStack.length > 0 && `(${undoStack.length})`}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1" /> Schließen
            </Button>
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
          <>
            <MobileViewSwitcher
              mobileView={split.mobileView}
              onChange={split.setMobileView}
              listLabel="Buchung"
              detailLabel="Beleg/KI"
            />
            <div
              className="flex-1 flex overflow-hidden"
              onTouchStart={split.touchHandlers.onTouchStart}
              onTouchEnd={split.touchHandlers.onTouchEnd}
            >
            {/* Left: Transaction details + Booking rows */}
            {split.showList && (
            <div className={cn("border-r overflow-y-auto", split.isMobile ? "w-full" : "w-1/2")}>
              {split.isMobile && (
                <div className="px-3 pt-2">
                  <MobileBackToListButton onClick={split.openDetail} label="Beleg & KI öffnen" />
                </div>
              )}
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
                <div className={cn("text-xl font-bold", currentTxn.amount < 0 ? "text-destructive" : "text-green-600")}>
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
                    focusFieldByName={focusFieldByName}
                    onUndoRow={row.booked ? () => undoSingleRow(row.id) : undefined}
                    isUndoing={undoingRowId === row.id}
                    formatCurrency={formatCurrency}
                    invoiceDetail={invoiceDetail}
                    heatingUnits={heatingUnits}
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
            )}

            {/* Right: Zuordnung (top) + Analyse (bottom, collapsible) */}
            {split.showDetail && (
            <div className={cn("flex flex-col overflow-y-auto", split.isMobile ? "w-full" : "w-1/2")}>
              {split.isMobile && (
                <div className="px-3 py-2 border-b">
                  <MobileBackToListButton onClick={split.openList} label="Zur Buchung" />
                </div>
              )}
              {/* ── Zuordnung Section (collapsible, default closed unless AI has matches) ── */}
              <Collapsible open={zuordnungOpen} onOpenChange={setZuordnungOpen}>
                <div className="shrink-0">
                  <CollapsibleTrigger asChild>
                    <button className="w-full px-4 py-2 border-b bg-muted/20 flex items-center gap-2 hover:bg-muted/40 transition-colors">
                      <Link2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Zuordnung</span>
                      {(currentTxn?.ai_suggestion?.matches?.length > 0) && (
                        <Badge variant="outline" className="text-[10px] ml-1">{currentTxn.ai_suggestion.matches.length} Vorschläge</Badge>
                      )}
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4">
                      <AssignmentTabContent
                        currentTxn={currentTxn}
                        allInvoices={allInvoices}
                        allTemplates={allTemplates}
                        accounts={accounts}
                        formRows={formRows}
                        expandedRowId={expandedRowId}
                        onAssignInvoice={async (inv: any) => {
                          const targetRowId = expandedRowId || formRows[0]?.id;
                          if (!targetRowId) return;
                          setFormRows(rows => rows.map(r => {
                            // Apply invoice assignment to ALL rows (split-safe). Update auto-text if not user-edited.
                            const _ca = accounts.find((a: any) => a.id === (r.counter_account_id || inv.suggested_account_id));
                            const newAutoText = buildBookingText({
                              period: null,
                              invoiceNumber: inv.invoice_number,
                              vendorName: resolveVendor(inv.vendor_name),
                              counterAccountName: _ca?.account_name || null,
                            });
                            const rebuilt = rebuildBookingTextIfAuto(r.description, r.__autoTextSignature, {
                              period: null,
                              invoiceNumber: inv.invoice_number,
                              vendorName: resolveVendor(inv.vendor_name),
                              counterAccountName: _ca?.account_name || null,
                            });
                            const isTarget = r.id === targetRowId;
                            return {
                              ...r,
                              ...(isTarget ? { invoice_id: inv.id, matched_template_id: "" } : { invoice_id: r.invoice_id || inv.id }),
                              receipt_number: r.receipt_number || inv.invoice_number || r.receipt_number,
                              description: rebuilt.text || newAutoText,
                              __autoTextSignature: rebuilt.signature || newAutoText,
                            } as BookingRowData;
                          }));
                          await supabase.from("bank_transactions").update({
                            matched_invoice_id: inv.id,
                            matched_template_id: null,
                          }).eq("id", currentTxn.id);
                          setAssignmentOverrides(prev => ({
                            ...prev,
                            [currentTxn.id]: { invoiceId: inv.id, templateId: null },
                          }));
                          queryClient.invalidateQueries({ queryKey: ["txn-review-invoice"] });
                          queryClient.invalidateQueries({ queryKey: ["txn-review-template"] });
                          toast.success("Rechnung zugeordnet");
                        }}
                        onAssignTemplate={async (tpl: any) => {
                          const targetRowId = expandedRowId || formRows[0]?.id;
                          if (!targetRowId) return;
                          setFormRows(rows => rows.map(r => {
                            if (r.id !== targetRowId) return r;
                            const updated: BookingRowData = { ...r, matched_template_id: tpl.id, invoice_id: "" };
                            if (tpl.account_id) updated.counter_account_id = tpl.account_id;
                            if (tpl.vat_rate != null) updated.vat_rate = String(tpl.vat_rate);
                            if (tpl.is_35a_relevant) updated.is_35a_relevant = true;
                            const _ca = accounts.find((a: any) => a.id === (tpl.account_id || r.counter_account_id));
                            const newAutoText = buildBookingText({
                              period: null,
                              invoiceNumber: null,
                              vendorName: null,
                              counterAccountName: _ca?.account_name || tpl.chart_of_accounts?.account_name || null,
                            });
                            // Nur überschreiben, wenn User-Text noch automatisch
                            if (!r.description.trim() || r.description === r.__autoTextSignature) {
                              updated.description = newAutoText;
                            }
                            updated.__autoTextSignature = newAutoText;
                            return updated;
                          }));
                          await supabase.from("bank_transactions").update({
                            matched_template_id: tpl.id,
                            matched_invoice_id: null,
                          }).eq("id", currentTxn.id);
                          setAssignmentOverrides(prev => ({
                            ...prev,
                            [currentTxn.id]: { templateId: tpl.id, invoiceId: null },
                          }));
                          queryClient.invalidateQueries({ queryKey: ["txn-review-template"] });
                          queryClient.invalidateQueries({ queryKey: ["txn-review-invoice"] });
                          toast.success("Vorlage zugeordnet");
                        }}
                        formatCurrency={formatCurrency}
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* ── Analyse Section (Bottom, collapsible) ── */}
              <Collapsible defaultOpen={true} className="flex-1 flex flex-col min-h-0">
                <div className="border-t flex flex-col flex-1 min-h-0">
                  <div className="flex items-center">
                    <CollapsibleTrigger asChild>
                      <button className="flex-1 px-4 py-2 bg-muted/20 flex items-center gap-2 hover:bg-muted/40 transition-colors">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Analyse</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                      </button>
                    </CollapsibleTrigger>
                    <Button variant="ghost" size="sm" onClick={rerunAiAnalysis} disabled={rerunningAi} title="KI-Analyse erneut starten" className="mr-2 h-7">
                      {rerunningAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <CollapsibleContent className="flex-1 flex flex-col min-h-0">
                    {invoiceDetail ? (
                      <div className="flex flex-col flex-1 min-h-0">
                        <div className="px-4 py-2 border-b space-y-1 shrink-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">Rechnung</span>
                            {invoiceDetail.vendor_name && (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs" title={invoiceDetail.vendor_name}>
                                  {resolveVendor(invoiceDetail.vendor_name)}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 w-5 p-0"
                                  title="Kurzname für diesen Lieferanten festlegen (gilt nur für künftige Buchungen)"
                                  onClick={() => setAliasDialogOpen(true)}
                                >
                                  <Pencil className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </div>
                            )}
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
                        {(() => {
                          const lineItems: any[] = Array.isArray(invoiceDetail?.line_items) ? invoiceDetail.line_items : [];
                          const hasItems = lineItems.length > 0;
                          const activeSel = expandedRowId ? (rowLineSelections[expandedRowId] || []) : [];
                          // Map item-index → row number where it is used (for badges in other rows)
                          const usedInOtherRows: Record<number, number> = {};
                          Object.entries(rowLineSelections).forEach(([rid, idxs]) => {
                            if (rid === expandedRowId) return;
                            const rowNum = formRows.findIndex(r => r.id === rid) + 1;
                            if (rowNum < 1) return;
                            idxs.forEach(i => { if (!(i in usedInOtherRows)) usedInOtherRows[i] = rowNum; });
                          });
                          return (
                            <Tabs
                              value={invoiceViewTab}
                              onValueChange={(v) => setInvoiceViewTab(v as "pdf" | "items")}
                              className="flex-1 flex flex-col min-h-0"
                            >
                              <TabsList className="mx-4 mt-2 self-start h-8">
                                <TabsTrigger value="pdf" className="text-xs px-3 h-6">
                                  <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                                </TabsTrigger>
                                <TabsTrigger
                                  value="items"
                                  disabled={!hasItems}
                                  className="text-xs px-3 h-6"
                                  title={hasItems ? "Positionen klicken zum Splitten" : "Keine OCR-Positionen vorhanden"}
                                >
                                  <PackagePlus className="h-3.5 w-3.5 mr-1" />
                                  Positionen{hasItems ? ` (${lineItems.length})` : ""}
                                </TabsTrigger>
                              </TabsList>
                              <TabsContent
                                value="pdf"
                                forceMount
                                className="flex-1 m-0 mt-2 min-h-0 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden"
                              >
                                {pdfUrl ? (
                                  <iframe src={pdfUrl} className="w-full border-0 flex-1 min-h-[300px]" title="Rechnung PDF" />
                                ) : (
                                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                                    PDF wird geladen...
                                  </div>
                                )}
                              </TabsContent>
                              <TabsContent
                                value="items"
                                className="flex-1 m-0 mt-2 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
                              >
                                <InvoiceLineItemsView
                                  invoice={invoiceDetail}
                                  selectedIndices={activeSel}
                                  usedInOtherRows={usedInOtherRows}
                                  hasActiveRow={!!expandedRowId}
                                  onToggleItem={(idx) => toggleLineItemForActiveRow(idx, lineItems)}
                                  onCreateNewBookingFromSelection={() => createNewBookingFromSelection(lineItems)}
                                  onFallbackVatRateChange={(rate) => {
                                    setFallbackVatRate(rate);
                                    // Re-apply each row's selection so amounts reflect the new rate
                                    Object.entries(rowLineSelections).forEach(([rid, idxs]) => {
                                      if (idxs && idxs.length > 0) {
                                        applySelectionToRow(rid, idxs, lineItems);
                                      }
                                    });
                                  }}
                                />
                              </TabsContent>
                            </Tabs>
                          );
                        })()}
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

                        {/* Linked Invoice */}
                        {linkedInvoice && (
                          <div className="mt-3 border-t pt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                <span className="text-sm font-medium">Verknüpfte Rechnung</span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={async () => {
                                  if (showLinkedInvoicePdf) {
                                    setShowLinkedInvoicePdf(false);
                                    return;
                                  }
                                  if (!linkedInvoicePdfUrl && linkedInvoice.file_path) {
                                    const { data } = await supabase.storage
                                      .from("invoices")
                                      .createSignedUrl(linkedInvoice.file_path, 3600);
                                    if (data?.signedUrl) setLinkedInvoicePdfUrl(data.signedUrl);
                                  }
                                  setShowLinkedInvoicePdf(true);
                                }}
                              >
                                {showLinkedInvoicePdf ? "Schließen" : "PDF anzeigen"}
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {linkedInvoice.vendor_name && (
                                <div>
                                  <span className="text-xs text-muted-foreground">Lieferant</span>
                                  <p className="font-medium">{linkedInvoice.vendor_name}</p>
                                </div>
                              )}
                              {linkedInvoice.gross_amount != null && (
                                <div>
                                  <span className="text-xs text-muted-foreground">Brutto</span>
                                  <p className="font-medium">{formatCurrency(linkedInvoice.gross_amount)}</p>
                                </div>
                              )}
                              {linkedInvoice.invoice_number && (
                                <div>
                                  <span className="text-xs text-muted-foreground">Re-Nr.</span>
                                  <p className="font-medium">{linkedInvoice.invoice_number}</p>
                                </div>
                              )}
                              {linkedInvoice.invoice_date && (
                                <div>
                                  <span className="text-xs text-muted-foreground">Datum</span>
                                  <p className="font-medium">{format(new Date(linkedInvoice.invoice_date), "dd.MM.yyyy", { locale: de })}</p>
                                </div>
                              )}
                            </div>
                            {showLinkedInvoicePdf && linkedInvoicePdfUrl && (
                              <iframe
                                src={`${linkedInvoicePdfUrl}#view=FitH`}
                                className="w-full border-0 rounded-md"
                                style={{ height: "calc(100vh - 200px)", minHeight: "800px" }}
                                title="Verknüpfte Rechnung PDF"
                              />
                            )}
                          </div>
                        )}
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
                        {currentTxn.ai_suggestion.booking_hint?.explanation && (() => {
                          const sb = currentTxn.ai_suggestion.booking_hint?.suggested_bookings || [];
                          const confs = sb.map((s: any) => s?.confidence).filter((c: any) => typeof c === "number");
                          const aggConf = confs.length ? confs.reduce((a: number, b: number) => a + b, 0) / confs.length : null;
                          return (
                            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 text-sm space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="flex-1">{currentTxn.ai_suggestion.booking_hint.explanation}</p>
                                {aggConf != null && <ConfidenceBadge value={aggConf} />}
                              </div>
                              {sb.length > 0 && (
                                <div className="space-y-1.5 pt-1 border-t border-purple-200/60 dark:border-purple-800/60">
                                  {sb.map((s: any, idx: number) => {
                                    const refs: string[] = Array.isArray(s?.rag_references) ? s.rag_references : [];
                                    return (
                                      <div key={idx} className="text-xs space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-medium">
                                            {s.counter_account_number ? `${s.counter_account_number}` : "?"} – {s.counter_account_name || s.description || "Vorschlag"}
                                          </span>
                                          {typeof s.confidence === "number" && (
                                            <ConfidenceBadge value={s.confidence} showIcon={false} />
                                          )}
                                        </div>
                                        {refs.length > 0 && (
                                          <Collapsible>
                                            <CollapsibleTrigger className="text-[11px] text-purple-700 dark:text-purple-300 hover:underline inline-flex items-center gap-1">
                                              <ChevronRight className="h-3 w-3" />
                                              {refs.length} RAG-Referenz{refs.length === 1 ? "" : "en"}
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="mt-1 pl-3 border-l-2 border-purple-300 dark:border-purple-700 space-y-0.5">
                                              {refs.map((r, i) => (
                                                <p key={i} className="text-[11px] text-muted-foreground">• {r}</p>
                                              ))}
                                            </CollapsibleContent>
                                          </Collapsible>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
            )}
            </div>
          </>
        ) : null}
      </DialogContent>
      <VendorAliasDialog
        open={aliasDialogOpen}
        onOpenChange={setAliasDialogOpen}
        rawVendorName={(invoiceDetail as any)?.vendor_name || ""}
        buildingId={buildingId}
      />
    </Dialog>
  );
}

// ─── Collapsible Booking Row Card ──────────────────────────────────────────────

function BookingRowCard({
  row, index, isExpanded, onToggle, accounts, buildingId, onAccountCreated, onUpdateField, onBook, onRemove,
  isBooking, fieldRefs, handleEnterNavigation, focusFieldByName, onUndoRow, isUndoing, formatCurrency, invoiceDetail, heatingUnits,
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
  focusFieldByName: (name: string) => void;
  onUndoRow?: () => void;
  isUndoing?: boolean;
  formatCurrency: (amount: number | null) => string;
  invoiceDetail?: any;
  heatingUnits?: Array<{ id: string; name: string }>;
}) {
  const counterAccount = accounts.find((a: any) => a.id === row.counter_account_id);
  const selectedCounterAccount = counterAccount;
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [createAccountTarget, setCreateAccountTarget] = useState<"account_id" | "counter_account_id">("counter_account_id");
  const [show35aDialog, setShow35aDialog] = useState(false);
  const [showFuelDialog, setShowFuelDialog] = useState(false);

  // Line items from invoice for §35a selection
  const invoiceLineItems = useMemo(() => {
    if (!invoiceDetail?.line_items) return [];
    const items = invoiceDetail.line_items;
    if (Array.isArray(items)) return items;
    return [];
  }, [invoiceDetail?.line_items]);

  // Auto-calculate VAT when amount/rate changes
  useEffect(() => {
    const amount = parseAmount(row.amount) || 0;
    const vatRate = parseAmount(row.vat_rate) || 0;
    if (vatRate > 0 && amount > 0) {
      const vatAmount = amount - (amount / (1 + vatRate / 100));
      onUpdateField("vat_amount", vatAmount.toFixed(2));
    }
  }, [row.amount, row.vat_rate]);

  return (
    <>
    <Collapsible open={isExpanded} onOpenChange={() => onToggle()}>
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
            title={row.booked ? "Klicken zum Bearbeiten" : undefined}
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
              <button
                onClick={e => { e.stopPropagation(); onUpdateField("needs_review", !row.needs_review); }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                  row.needs_review
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Flag className="h-3.5 w-3.5" />
                Prüfen
              </button>
              <span className={cn("text-sm font-bold", row.booking_type === "income" ? "text-green-600" : "text-destructive")}>
                {row.booking_type === "income" ? "+" : "−"}{formatCurrency(parseAmount(row.amount) || 0)}
              </span>
              {onRemove && !row.booked && (
                <button
                  onClick={e => { e.stopPropagation(); onRemove(); }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title="Zeile entfernen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {row.booked && onUndoRow && (
                <button
                  onClick={e => { e.stopPropagation(); onUndoRow(); }}
                  disabled={isUndoing}
                  className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-muted-foreground hover:text-amber-700 disabled:opacity-50"
                  title="Teilbuchung rückgängig machen"
                >
                  {isUndoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3 border-t pt-3">
            {row.needs_review && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
                <Flag className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                <Input className="h-7 text-xs flex-1 border-orange-200 dark:border-orange-700" placeholder="Prüfnotiz (optional), z.B. IBAN unklar, Betrag prüfen..."
                  value={row.review_note} onChange={e => onUpdateField("review_note", e.target.value)} />
              </div>
            )}
            {/* Konto */}
            <div ref={el => fieldRefs.current["account_id"] = el}>
              <label className="text-xs font-bold text-primary mb-1 block">Konto</label>
              <AccountSearchSelect
                value={row.account_id}
                onChange={v => {
                  if (v === "__create__") { setCreateAccountTarget("account_id"); setCreateAccountOpen(true); }
                  else onUpdateField("account_id", v);
                }}
                accounts={accounts}
                excludeCategory="Bankkonto"
                placeholder="Konto suchen…"
                showCreateOption
                onCreateClick={() => { setCreateAccountTarget("account_id"); setCreateAccountOpen(true); }}
                onCommit={() => focusFieldByName("amount")}
              />
            </div>

            {/* Betrag + Typ inline */}
            <div className="flex items-center gap-1">
              <Input ref={el => fieldRefs.current["amount"] = el}
                type="text" inputMode="decimal"
                className={cn("h-14 text-4xl md:text-4xl font-bold flex-1 border-none shadow-none px-0 focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none", row.booking_type === "income" ? "text-green-600" : "text-destructive")}
                value={`${row.booking_type === "income" ? "+" : "−"}${row.amount}`}
                onChange={e => {
                  const raw = e.target.value;
                  // Strip any sign characters and non-numeric chars except . and ,
                  const digits = raw.replace(/[^0-9.,]/g, "");
                  onUpdateField("amount", digits);
                }}
                onKeyDown={e => {
                  if (e.key === "+" || e.key === "-") {
                    e.preventDefault();
                    onUpdateField("booking_type", e.key === "+" ? "income" : "expense");
                    return;
                  }
                  // Block Backspace/Delete on position 0 (the sign character)
                  const input = e.target as HTMLInputElement;
                  if (e.key === "Backspace" && input.selectionStart !== null && input.selectionStart <= 1 && input.selectionEnd !== null && input.selectionEnd <= 1) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === "Delete" && input.selectionStart === 0) {
                    e.preventDefault();
                    return;
                  }
                  // Prevent cursor from going before sign
                  if (e.key === "Home") {
                    e.preventDefault();
                    input.setSelectionRange(1, 1);
                    return;
                  }
                  handleEnterNavigation(e as any, "amount");
                }}
                onFocus={e => {
                  const input = e.target as HTMLInputElement;
                  // Select numeric portion (skip the sign char at index 0) so typing overrides
                  setTimeout(() => input.setSelectionRange(1, input.value.length), 0);
                }}
                onClick={e => {
                  const input = e.target as HTMLInputElement;
                  input.setSelectionRange(1, input.value.length);
                }}
                onWheel={e => (e.target as HTMLElement).blur()} />
              <Button type="button" size="icon" variant={row.booking_type === "expense" ? "default" : "outline"}
                className={cn("h-8 w-8 shrink-0 text-sm font-bold", row.booking_type === "expense" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                onClick={() => onUpdateField("booking_type", "expense")}>−</Button>
              <Button type="button" size="icon" variant={row.booking_type === "income" ? "default" : "outline"}
                className={cn("h-8 w-8 shrink-0 text-sm font-bold", row.booking_type === "income" && "bg-green-600 hover:bg-green-700 text-white")}
                onClick={() => onUpdateField("booking_type", "income")}>+</Button>
            </div>
            {parseAmount(row.vat_amount) > 0 && row.vat_rate && (
              <p className="text-xs text-muted-foreground">davon MwSt: {formatCurrency(parseAmount(row.vat_amount))} ({row.vat_rate}%)</p>
            )}
            {(() => {
              const ca = accounts.find((a: any) => a.id === row.counter_account_id);
              return ca?.account_number?.startsWith("4") && !row.vat_rate ? (
                <p className="text-xs text-orange-500 font-medium">⚠ MwSt-Satz erforderlich</p>
              ) : null;
            })()}

            {/* Gegenkonto */}
            <div ref={el => fieldRefs.current["counter_account_id"] = el}>
              <label className="text-xs font-bold text-primary mb-1 block">Gegenkonto</label>
              <AccountSearchSelect
                value={row.counter_account_id}
                onChange={v => {
                  if (v === "__create__") { setCreateAccountTarget("counter_account_id"); setCreateAccountOpen(true); }
                  else {
                    onUpdateField("counter_account_id", v);
                    const acc = accounts.find((a: any) => a.id === v);
                    if (acc?.account_number?.startsWith("4")) {
                      onUpdateField("vat_rate", "");
                    }
                  }
                }}
                accounts={accounts}
                placeholder="Gegenkonto suchen…"
                showCreateOption
                onCreateClick={() => { setCreateAccountTarget("counter_account_id"); setCreateAccountOpen(true); }}
                onCommit={() => focusFieldByName("description_shortcut")}
              />
            </div>

            {/* Description with template combobox */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Buchungstext</label>
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <BookingTextTemplateCombobox
                  inputRef={(el) => { fieldRefs.current["description_shortcut"] = el; }}
                  fiscalYear={row.fiscal_year}
                  invoice={invoiceDetail ? { invoice_number: (invoiceDetail as any).invoice_number, vendor_name: (invoiceDetail as any).vendor_name } : null}
                  counterAccountName={accounts.find((a: any) => a.id === row.counter_account_id)?.account_name || null}
                  existingText={row.description}
                  preserveExistingText={false}
                  onApply={(text) => {
                    onUpdateField("description", text);
                    onUpdateField("__autoTextSignature", text);
                  }}
                  onCommit={() => focusFieldByName("description")}
                  onSkip={() => focusFieldByName("description")}
                />
                <Input ref={el => fieldRefs.current["description"] = el} className="h-9 text-sm"
                  value={row.description} onChange={e => onUpdateField("description", e.target.value)}
                  onKeyDown={e => handleEnterNavigation(e, "description")}
                  placeholder="z. B. 09/25 Hausmeister Markus Gschwend, Re. Nr. 8824748" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Format: <em>Buchungskürzel</em> Gegenkonto <em>Lieferant</em> <em>Re. Nr.</em>
              </p>
            </div>

            {/* Compact row */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Belegnummer</label>
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
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Wirtschaftsjahr</label>
                <Input ref={el => fieldRefs.current["fiscal_year"] = el}
                  className="h-8 text-xs font-mono" type="number" value={row.fiscal_year}
                  onChange={e => onUpdateField("fiscal_year", e.target.value)}
                  onKeyDown={e => handleEnterNavigation(e, "fiscal_year")} />
              </div>
              <div>
                {(() => {
                  const counterAcc = accounts.find((a: any) => a.id === row.counter_account_id);
                  const isAccrual = counterAcc?.account_number?.startsWith("4");
                  const vatMissing = isAccrual && !row.vat_rate;
                  return (
                    <>
                      <label className={cn("text-xs font-medium mb-1 block", vatMissing ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")}>
                        MwSt % {isAccrual && <span className="text-orange-500">*</span>}
                      </label>
                      <Select value={row.vat_rate} onValueChange={v => { onUpdateField("vat_rate", v); setTimeout(() => focusFieldByName("__book__"), 50); }}>
                        <SelectTrigger className={cn("h-8 text-xs", vatMissing && "border-orange-400 ring-1 ring-orange-300")} ref={el => fieldRefs.current["vat_rate"] = el}>
                          <SelectValue placeholder="Wählen…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          <SelectItem value="7">7%</SelectItem>
                          <SelectItem value="19">19%</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  );
                })()}
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

            {/* §35a & Brennstoff Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShow35aDialog(true)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  row.is_35a_relevant
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                §35a
                {row.is_35a_relevant && row.amount_35a && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{row.amount_35a}€</Badge>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowFuelDialog(true)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  row.is_fuel_purchase
                    ? "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Flame className="h-3.5 w-3.5" />
                Brennstoff
                {row.is_fuel_purchase && row.fuel_type && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{row.fuel_type === "oil" ? "Öl" : "Pellets"}</Badge>
                )}
              </button>
            </div>

            {/* Vendor History */}
            <VendorHistorySection booking={{ building_id: buildingId, id: undefined, description: row.description, counter_account_id: row.counter_account_id, account_id: row.account_id, counter_account: accounts.find((a: any) => a.id === row.counter_account_id) || null, invoices: invoiceDetail ? { vendor_name: invoiceDetail.vendor_name } : null }} />

            {/* Book / Update button */}
            <Button ref={el => { fieldRefs.current["__book__"] = el; }} onClick={onBook} disabled={isBooking || !row.account_id} className="w-full h-9 text-sm">
              {isBooking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : row.booked ? <RefreshCw className="h-4 w-4 mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              {row.booked ? "Aktualisieren" : (row.needs_review ? "Buchen & Zur Prüfung" : "Buchen")}
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

      {/* §35a Dialog */}
      <Dialog open={show35aDialog} onOpenChange={setShow35aDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <h3 className="font-semibold text-base shrink-0">§35a – Haushaltsnahe Dienstleistungen</h3>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <Section35aEditor
              is35aRelevant={!!row.is_35a_relevant}
              onIs35aRelevantChange={(v) => onUpdateField("is_35a_relevant", v)}
              invoiceLineItems={invoiceLineItems}
              lineItemsDetail={Array.isArray(row.line_items_detail) ? (row.line_items_detail as any) : []}
              onLineItemsDetailChange={(items) => onUpdateField("line_items_detail", JSON.stringify(items))}
              onAmount35aChange={(val) => onUpdateField("amount_35a", val)}
              defaultVatRate={parseAmount(row.vat_rate) || 0}
              defaultType35a={(() => {
                const acc: any = (accounts as any[]).find(a => a.id === row.account_id) || (accounts as any[]).find(a => a.id === row.counter_account_id);
                return (acc?.settlement_35a_type === "handwerker" ? "handwerker" : "dienste");
              })()}
              currentAmount35a={parseAmount(row.amount_35a) || 0}
              toggleIdSuffix={String(index)}
            />
          </div>
          <Button onClick={() => setShow35aDialog(false)} className="w-full shrink-0">Übernehmen</Button>
        </DialogContent>
      </Dialog>

      {/* Brennstoffkauf Dialog */}
      <Dialog open={showFuelDialog} onOpenChange={setShowFuelDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              <h3 className="font-semibold text-base">Brennstoffkauf</h3>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox id={`fuel-dialog-${index}`} checked={row.is_fuel_purchase} onCheckedChange={v => onUpdateField("is_fuel_purchase", !!v)} />
              <label htmlFor={`fuel-dialog-${index}`} className="text-sm font-medium">Brennstoffkauf erfassen</label>
            </div>

            {(() => {
              const fuelUnit = row.fuel_type === "oil" ? "l"
                : row.fuel_type === "pellets" ? "kg"
                : (row.fuel_type === "gas" || row.fuel_type === "district_heating") ? "kWh"
                : "l";
              const showCo2 = ["oil", "gas", "district_heating"].includes(row.fuel_type);
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Art</label>
                      <Select value={row.fuel_type} onValueChange={v => onUpdateField("fuel_type", v)}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Wählen…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="oil">Heizöl</SelectItem>
                          <SelectItem value="pellets">Pellets</SelectItem>
                          <SelectItem value="gas">Gas</SelectItem>
                          <SelectItem value="district_heating">Fernwärme</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Menge ({fuelUnit})
                      </label>
                      <Input className="h-9 text-sm" type="number" placeholder="0" value={row.fuel_quantity}
                        onChange={e => onUpdateField("fuel_quantity", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Gesamtpreis (€)</label>
                      <Input className="h-9 text-sm" type="number" step="0.01" placeholder="0,00" value={row.fuel_total_price}
                        onChange={e => onUpdateField("fuel_total_price", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Lieferdatum</label>
                      <Input className="h-9 text-sm" type="date" value={row.fuel_date}
                        onChange={e => onUpdateField("fuel_date", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Energieinhalt (kWh)</label>
                      <Input className="h-9 text-sm" type="number" step="0.01" placeholder="0" value={row.fuel_energy_content_kwh}
                        onChange={e => onUpdateField("fuel_energy_content_kwh", e.target.value)} />
                    </div>
                  </div>

                  {/* Verbrauchszeitraum */}
                  {(row.fuel_type === "gas" || row.fuel_type === "district_heating") ? (
                    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="text-xs text-amber-900 dark:text-amber-200">
                          <p className="font-medium">Verbrauchszeitraum (Heizjahr)</p>
                          <p className="opacity-80 mt-0.5">Bei Jahresabrechnungen liegt der Verbrauch meist im Vorjahr. Werte aus Rechnung übernehmen — die Buchung bleibt im Rechnungsjahr, der Verbrauch wandert ins korrekte Heizjahr.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Verbrauch von</label>
                          <Input className="h-9 text-sm" type="date" value={row.fuel_consumption_from}
                            onChange={e => onUpdateField("fuel_consumption_from", e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Verbrauch bis</label>
                          <Input className="h-9 text-sm" type="date" value={row.fuel_consumption_to}
                            onChange={e => onUpdateField("fuel_consumption_to", e.target.value)} />
                        </div>
                      </div>
                      {row.fuel_consumption_to && (
                        <div className="text-xs font-medium text-amber-900 dark:text-amber-200">
                          → Zugeordnet zu Heizjahr <span className="font-bold">{new Date(row.fuel_consumption_to).getFullYear()}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                        Verbrauchszeitraum abweichend? (Standard = Lieferdatum)
                      </summary>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Verbrauch von</label>
                          <Input className="h-9 text-sm" type="date" value={row.fuel_consumption_from}
                            onChange={e => onUpdateField("fuel_consumption_from", e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Verbrauch bis</label>
                          <Input className="h-9 text-sm" type="date" value={row.fuel_consumption_to}
                            onChange={e => onUpdateField("fuel_consumption_to", e.target.value)} />
                        </div>
                      </div>
                    </details>
                  )}

                  {showCo2 && (
                    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="text-xs text-amber-900 dark:text-amber-200">
                          <p className="font-medium">CO₂-Daten (BEHG) — für Heizkostenabrechnung</p>
                          <p className="opacity-80 mt-0.5">Werte aus Rechnung übernehmen, nicht raten.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">CO₂-Emissionen (kg)</label>
                          <Input className="h-9 text-sm" type="number" step="0.01" placeholder="0" value={row.fuel_co2_emissions_kg}
                            onChange={e => onUpdateField("fuel_co2_emissions_kg", e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">CO₂-Steueranteil (€)</label>
                          <Input className="h-9 text-sm" type="number" step="0.01" placeholder="0,00" value={row.fuel_co2_tax_amount}
                            onChange={e => onUpdateField("fuel_co2_tax_amount", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {heatingUnits && heatingUnits.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Heizkreis</label>
                      <Select
                        value={row.fuel_heating_unit_id || "__none__"}
                        onValueChange={v => onUpdateField("fuel_heating_unit_id", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Kein Heizkreis" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Kein Heizkreis</SelectItem>
                          {heatingUnits.map(hu => (
                            <SelectItem key={hu.id} value={hu.id}>{hu.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              );
            })()}

            <Button onClick={() => {
              if (row.fuel_type && row.fuel_quantity) onUpdateField("is_fuel_purchase", true);
              setShowFuelDialog(false);
            }} className="w-full">
              Übernehmen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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

// ─── Create Account Inline Dialog moved to ./CreateAccountInlineDialog ────────


// ─── Assignment Tab Content ────────────────────────────────────────────────────

function AssignmentTabContent({
  currentTxn, allInvoices, allTemplates,
  accounts, formRows, expandedRowId, onAssignInvoice, onAssignTemplate, formatCurrency,
}: {
  currentTxn: any;
  allInvoices: any[];
  allTemplates: any[];
  accounts: any[];
  formRows: BookingRowData[];
  expandedRowId: string | null;
  onAssignInvoice: (inv: any) => void;
  onAssignTemplate: (tpl: any) => void;
  formatCurrency: (amount: number | null) => string;
}) {
  const [invoiceFilter, setInvoiceFilter] = useState<"unassigned" | "assigned">("unassigned");
  const aiMatches = currentTxn?.ai_suggestion?.matches || [];

  // Extract transaction metadata for smart matching
  const txnIban = currentTxn?.amount < 0 ? currentTxn?.creditor_iban : currentTxn?.debtor_iban;
  const txnName = (currentTxn?.amount < 0 ? currentTxn?.creditor_name : currentTxn?.debtor_name) || "";
  const txnPurpose = (currentTxn?.purpose || "").toLowerCase();
  const txnAmount = Math.abs(currentTxn?.amount || 0);

  // Cross-reference AI match IDs against actual invoice/template lists to determine type
  const invoiceIdSet = useMemo(() => new Set(allInvoices.map((i: any) => i.id)), [allInvoices]);
  const templateIdSet = useMemo(() => new Set(allTemplates.map((t: any) => t.id)), [allTemplates]);

  // Determine default tab based on AI matches
  const defaultTab = useMemo(() => {
    const hasTemplateMatch = aiMatches.some((m: any) => m.id && templateIdSet.has(m.id));
    const hasInvoiceMatch = aiMatches.some((m: any) => m.id && invoiceIdSet.has(m.id));
    if (hasTemplateMatch && !hasInvoiceMatch) return "vorlagen";
    return "rechnungen";
  }, [aiMatches, invoiceIdSet, templateIdSet]);

  const [assignTab, setAssignTab] = useState<string>(defaultTab);

  // Update tab when transaction changes and default changes
  useEffect(() => {
    setAssignTab(defaultTab);
  }, [currentTxn?.id, defaultTab]);

  const invoiceMatches = useMemo(() => {
    const matchMap = new Map<string, any>();
    aiMatches.filter((m: any) => m.id && m.score > 0.5 && invoiceIdSet.has(m.id)).forEach((m: any) => matchMap.set(m.id, m));
    return matchMap;
  }, [aiMatches, invoiceIdSet]);

  const templateMatches = useMemo(() => {
    const matchMap = new Map<string, any>();
    aiMatches.filter((m: any) => m.id && m.score > 0.5 && templateIdSet.has(m.id)).forEach((m: any) => matchMap.set(m.id, m));
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
    // Time-based validity check: skip templates that don't apply to this txn date
    const txnDateStr = (currentTxn?.booking_date || "").slice(0, 10);
    if (txnDateStr) {
      if (tpl.valid_from && txnDateStr < String(tpl.valid_from).slice(0, 10)) return null;
      if (tpl.valid_to && txnDateStr > String(tpl.valid_to).slice(0, 10)) return null;
    }
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
  }, [txnIban, txnName, txnAmount, templateMatches, currentTxn?.booking_date]);

  // Sort: AI matches first, then smart matches, then rest
  const filteredInvoices = useMemo(() => {
    return allInvoices.filter((inv: any) => {
      if (invoiceFilter === "assigned") return inv.status === "paid";
      return inv.status !== "paid";
    });
  }, [allInvoices, invoiceFilter]);

  const sortedInvoices = useMemo(() => {
    return [...filteredInvoices].sort((a, b) => {
      const aiA = invoiceMatches.get(a.id)?.score || 0;
      const aiB = invoiceMatches.get(b.id)?.score || 0;
      const smartA = getInvoiceMatchReason(a) ? 0.5 : 0;
      const smartB = getInvoiceMatchReason(b) ? 0.5 : 0;
      return (aiB + smartB) - (aiA + smartA);
    });
  }, [filteredInvoices, invoiceMatches, getInvoiceMatchReason]);

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
          <div className="flex items-center justify-end mb-2 gap-1">
            <Button variant={invoiceFilter === "unassigned" ? "default" : "outline"} size="sm" className="h-6 text-[11px] px-2" onClick={() => setInvoiceFilter("unassigned")}>
              Nicht zugeordnet
            </Button>
            <Button variant={invoiceFilter === "assigned" ? "default" : "outline"} size="sm" className="h-6 text-[11px] px-2" onClick={() => setInvoiceFilter("assigned")}>
              Zugeordnet
            </Button>
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
