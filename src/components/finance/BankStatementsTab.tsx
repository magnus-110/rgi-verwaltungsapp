import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, CheckCircle2, FileQuestion, LayoutTemplate, EyeOff, Building2, BookOpen, Link2, Link2Off, Send, RefreshCw, Landmark, FileWarning, Sparkles, Flag, AlertCircle, RotateCw, FileText, ExternalLink, FileCode } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AssignmentDialog } from "./AssignmentDialog";
import { TransactionDetailSheet } from "./TransactionDetailSheet";
import { CreateBookingDialog } from "./CreateBookingDialog";
import { EditBookingDialog } from "./EditBookingDialog";
import { TransactionReviewMode } from "./TransactionReviewMode";
import { useTransactionAiPrefetch } from "@/hooks/useTransactionAiPrefetch";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";
import { BankAccountMappingDialog } from "./BankAccountMappingDialog";
import { useBuildingBankAccounts } from "@/hooks/useBuildingBankAccounts";
const MATCH_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  matched_invoice: { label: "Rechnung", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2 },
  matched_template: { label: "Vorlage", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: LayoutTemplate },
  manually_matched: { label: "Manuell", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", icon: CheckCircle2 },
  invoice_pending: { label: "Rechnung fehlt", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", icon: FileWarning },
  unmatched: { label: "Unbekannt", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: FileQuestion },
  ignored: { label: "Ignoriert", color: "bg-muted text-muted-foreground", icon: EyeOff },
};

interface BankStatementsTabProps {
  sharedBuildingId?: string | null;
  onBuildingChange?: (id: string | null) => void;
}

export function BankStatementsTab({ sharedBuildingId, onBuildingChange }: BankStatementsTabProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookingAll, setBookingAll] = useState(false);
  const [internalBuilding, setInternalBuilding] = useState<string>("");
  const selectedBuilding = sharedBuildingId || internalBuilding;
  const setSelectedBuilding = (id: string) => {
    setInternalBuilding(id);
    onBuildingChange?.(id);
  };
  const [showBooked, setShowBooked] = useState(false);
  const [statementsExpanded, setStatementsExpanded] = useState(false);
  const [statementPdf, setStatementPdf] = useState<{ url: string; name: string } | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);
  const [editBooking, setEditBooking] = useState<any | null>(null);
  const [editBuildingName, setEditBuildingName] = useState<string>("");
  const [manualAssignTxn, setManualAssignTxn] = useState<any | null>(null);
  const [manualAssignType, setManualAssignType] = useState<"invoice" | "template">("invoice");
  const [manualAssignId, setManualAssignId] = useState<string>("");
  const [showMatchedInvoices, setShowMatchedInvoices] = useState(false);
  const [bookingSingleId, setBookingSingleId] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const [createBookingOpen, setCreateBookingOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<any>(null);
  const [linkedTransactionId, setLinkedTransactionId] = useState<string | null>(null);
  const [currentHintIndex, setCurrentHintIndex] = useState<number | null>(null);
  const [reviewModeOpen, setReviewModeOpen] = useState(false);
  const [reviewInitialIndex, setReviewInitialIndex] = useState(0);
  const [reviewFlaggedFirst, setReviewFlaggedFirst] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mappingDialog, setMappingDialog] = useState<{ iban: string; bankName?: string | null } | null>(null);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all transactions for the selected building
  const { data: allBuildingTxns = [], isLoading: txnsLoading } = useQuery({
    queryKey: ["bank-transactions-building", selectedBuilding],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*, bookings!bank_transactions_booking_id_fkey(id, needs_review, review_note)")
        .eq("building_id", selectedBuilding)
        .order("booking_date", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuilding,
  });

  // AI prefetch for unmatched transactions
  const aiPrefetchState = useTransactionAiPrefetch(
    selectedBuilding || null,
    allBuildingTxns,
    !!selectedBuilding && allBuildingTxns.length > 0
  );
  const { reset: resetAiPrefetch } = aiPrefetchState;

  // Fetch bank statements (full list for IBAN display + downloadable list)
  const { data: bankStatements = [] } = useQuery({
    queryKey: ["bank-statements-list", selectedBuilding],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const { data, error } = await supabase
        .from("bank_statements")
        .select("id, account_iban, account_name, file_name, file_path, source_format, statement_date_from, statement_date_to, opening_balance, closing_balance, parse_warnings, created_at")
        .eq("building_id", selectedBuilding)
        .order("statement_date_to", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuilding,
  });

  // Get unique bank accounts
  const bankAccounts = useMemo(() => {
    const seen = new Set<string>();
    return bankStatements.filter((s: any) => {
      if (!s.account_iban || seen.has(s.account_iban)) return false;
      seen.add(s.account_iban);
      return true;
    });
  }, [bankStatements]);

  // IBAN -> Konto im Kontenrahmen Zuordnung (pro Liegenschaft)
  const { data: bankMappings = [] } = useBuildingBankAccounts(selectedBuilding || null);
  const mappingByIban = useMemo(() => {
    const m: Record<string, { display_name: string | null; coa_account_id: string | null; account_number?: string }> = {};
    bankMappings.forEach((b) => {
      m[b.iban] = { display_name: b.display_name, coa_account_id: b.coa_account_id };
    });
    return m;
  }, [bankMappings]);

  // Lade Account-Numbers der zugeordneten Konten (für Anzeige in der Pille)
  const mappedAccountIds = useMemo(
    () => bankMappings.map((b) => b.coa_account_id).filter(Boolean) as string[],
    [bankMappings]
  );
  const { data: mappedAccounts = [] } = useQuery({
    queryKey: ["bank-mapping-accounts", mappedAccountIds.sort().join(",")],
    queryFn: async () => {
      if (mappedAccountIds.length === 0) return [] as any[];
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name")
        .in("id", mappedAccountIds);
      if (error) throw error;
      return data || [];
    },
    enabled: mappedAccountIds.length > 0,
  });
  const accountById = useMemo(() => {
    const m: Record<string, { account_number: string; account_name: string }> = {};
    (mappedAccounts as any[]).forEach((a) => (m[a.id] = a));
    return m;
  }, [mappedAccounts]);

  // Global bookable count (across all buildings)
  const { data: allTransactions = [] } = useQuery({
    queryKey: ["bank-transactions-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, statement_id, match_status, booked_at, matched_invoice_id")
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: invoicesListRaw = [] } = useQuery({
    queryKey: ["invoices-for-assign", selectedBuilding],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, vendor_name, gross_amount, vendor_iban, invoice_date, status")
        .eq("building_id", selectedBuilding)
        .order("invoice_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuilding,
  });

  const invoicesList = useMemo(() => {
    if (showMatchedInvoices) return invoicesListRaw;
    const assignedInvoiceIds = new Set(
      allTransactions
        .filter((t: any) => t.matched_invoice_id)
        .map((t: any) => t.matched_invoice_id)
    );
    return invoicesListRaw.filter((inv: any) => !assignedInvoiceIds.has(inv.id));
  }, [invoicesListRaw, showMatchedInvoices, allTransactions]);

  const { data: templatesList = [] } = useQuery({
    queryKey: ["templates-for-assign", selectedBuilding],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const { data, error } = await supabase
        .from("booking_templates")
        .select("id, name, vendor_name, vendor_iban, expected_amount, account_id, chart_of_accounts(account_number, account_name)")
        .eq("building_id", selectedBuilding)
        .order("name");
      if (error) throw error;
      return data.map((t: any) => ({
        ...t,
        account_number: t.chart_of_accounts?.account_number,
        account_name: t.chart_of_accounts?.account_name,
      }));
    },
    enabled: !!selectedBuilding,
  });

  // Search filter (date, amount, purpose, name)
  const filteredBuildingTxns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allBuildingTxns;
    // Normalize amount: accept "1.234,56", "1234.56", "-50"
    const normNum = (s: string) => s.replace(/\./g, "").replace(",", ".");
    const qNum = parseFloat(normNum(q));
    const hasNum = !isNaN(qNum);
    return allBuildingTxns.filter((t: any) => {
      const dateStr = t.booking_date ? format(new Date(t.booking_date), "dd.MM.yyyy") : "";
      const dateIso = t.booking_date || "";
      const amt = Number(t.amount);
      const amtStr = String(amt);
      const amtDe = amt.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fields = [
        dateStr, dateIso, amtStr, amtDe,
        t.purpose, t.creditor_name, t.debtor_name, t.counterparty_iban,
      ].filter(Boolean).map((v: any) => String(v).toLowerCase());
      if (fields.some((f: string) => f.includes(q))) return true;
      if (hasNum && Math.abs(Math.abs(amt) - Math.abs(qNum)) < 0.005) return true;
      return false;
    });
  }, [allBuildingTxns, searchQuery]);

  // Categorize transactions
  const matchedTransactions = useMemo(() =>
    filteredBuildingTxns.filter((t: any) => ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status) && !t.booked_at),
    [filteredBuildingTxns]
  );
  const unmatchedTransactions = useMemo(() =>
    filteredBuildingTxns.filter((t: any) => (t.match_status === "unmatched" || t.match_status === "invoice_pending") && !t.booked_at),
    [filteredBuildingTxns]
  );
  const ignoredTransactions = useMemo(() =>
    filteredBuildingTxns.filter((t: any) => t.match_status === "ignored" && !t.booked_at),
    [filteredBuildingTxns]
  );
  const bookedTransactions = useMemo(() =>
    filteredBuildingTxns.filter((t: any) => t.booked_at),
    [filteredBuildingTxns]
  );

  // All unbooked transactions for review mode — same order as the list view:
  // first matched (chronological), then unmatched/invoice_pending (chronological).
  const allUnbookedForReview = useMemo(() => {
    const sortByDateThenId = (a: any, b: any) => {
      const da = new Date(a.booking_date).getTime();
      const db = new Date(b.booking_date).getTime();
      if (da !== db) return da - db;
      return String(a.id).localeCompare(String(b.id));
    };
    const matched = allBuildingTxns
      .filter((t: any) => ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status) && !t.booked_at)
      .sort(sortByDateThenId);
    const unmatched = allBuildingTxns
      .filter((t: any) => (t.match_status === "unmatched" || t.match_status === "invoice_pending") && !t.booked_at)
      .sort(sortByDateThenId);
    return [...matched, ...unmatched];
  }, [allBuildingTxns]);

  const globalBookableCount = useMemo(() => {
    return allTransactions.filter((t: any) =>
      ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status) && !t.booked_at
    ).length;
  }, [allTransactions]);

  const readFileContent = async (file: File): Promise<string> => {
    let xmlContent = await file.text();
    const encodingMatch = xmlContent.match(/<\?xml[^?]*encoding=["']([^"']+)["']/i);
    const declaredEncoding = encodingMatch?.[1]?.toUpperCase();
    if (declaredEncoding && declaredEncoding !== "UTF-8") {
      xmlContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file, declaredEncoding);
      });
    }
    return xmlContent;
  };

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result as string;
      const b64 = res.includes(",") ? res.split(",")[1] : res;
      resolve(b64);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allFiles = Array.from(files).filter(f => /\.(xml|pdf)$/i.test(f.name));
    if (allFiles.length === 0) {
      toast.error("Bitte CAMT-XML oder Kontoauszug-PDF hochladen");
      return;
    }
    if (!selectedBuilding || selectedBuilding === "all") {
      toast.error("Bitte zuerst eine Liegenschaft auswählen, bevor ein Kontoauszug importiert wird");
      return;
    }

    setUploading(true);
    setUploadProgress(allFiles.length > 1 ? { current: 0, total: allFiles.length } : null);

    let totalImported = 0;
    let totalMatched = 0;
    let totalDuplicates = 0;
    let errors = 0;
    const allWarnings: string[] = [];

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      if (allFiles.length > 1) setUploadProgress({ current: i + 1, total: allFiles.length });

      try {
        const isPdf = /\.pdf$/i.test(file.name);
        let data: any, error: any;

        if (isPdf) {
          const pdfBase64 = await fileToBase64(file);
          ({ data, error } = await supabase.functions.invoke("parse-bank-statement-pdf", {
            body: { pdfBase64, fileName: file.name, buildingId: selectedBuilding },
          }));
        } else {
          const xmlContent = await readFileContent(file);
          ({ data, error } = await supabase.functions.invoke("parse-bank-statement", {
            body: { xmlContent, buildingId: selectedBuilding !== "all" ? selectedBuilding : null },
          }));
        }
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        totalImported += data.totalTransactions || 0;
        totalMatched += data.matchedCount || 0;
        totalDuplicates += data.duplicatesSkipped || 0;
        if (Array.isArray(data.warnings) && data.warnings.length) {
          allWarnings.push(`${file.name}: ${data.warnings.join("; ")}`);
        }
      } catch (err: any) {
        errors++;
        console.error(`Fehler bei ${file.name}:`, err);
      }
    }

    if (allFiles.length === 1) {
      if (errors > 0) {
        toast.error("Fehler beim Import");
      } else if (totalImported === 0 && totalDuplicates > 0) {
        toast.info(`Alle ${totalDuplicates} Transaktionen waren bereits importiert.`);
      } else {
        const parts = [];
        if (totalImported > 0) parts.push(`${totalImported} importiert`);
        if (totalMatched > 0) parts.push(`${totalMatched} zugeordnet`);
        if (totalDuplicates > 0) parts.push(`${totalDuplicates} Duplikate übersprungen`);
        toast.success(parts.join(", "));
      }
    } else {
      const parts = [`${allFiles.length - errors} von ${allFiles.length} Dateien verarbeitet`];
      if (totalImported > 0) parts.push(`${totalImported} Transaktionen importiert`);
      if (totalMatched > 0) parts.push(`${totalMatched} zugeordnet`);
      if (totalDuplicates > 0) parts.push(`${totalDuplicates} Duplikate übersprungen`);
      if (errors > 0) parts.push(`${errors} Fehler`);
      toast.success(parts.join(", "));
    }

    if (allWarnings.length) {
      toast.warning(allWarnings.join(" • "), { duration: 8000 });
    }

    queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
    queryClient.invalidateQueries({ queryKey: ["bank-statements-info"] });
    queryClient.invalidateQueries({ queryKey: ["bank-statements-list"] });
    queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
    queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    queryClient.invalidateQueries({ queryKey: ["bank-reconciliations"] });

    setUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  const updateMatchStatus = async (txnId: string, status: string) => {
    const { error } = await supabase.from("bank_transactions").update({ match_status: status }).eq("id", txnId);
    if (error) { toast.error("Fehler beim Aktualisieren"); }
    else {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    }
  };

  // Sync any booking already linked to this transaction so its invoice_id stays consistent
  const syncBookingMatch = async (
    txnId: string,
    invoiceId: string | null,
    templateId: string | null | undefined,
  ) => {
    const { data: linkedBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("bank_transaction_id", txnId);
    if (linkedBookings && linkedBookings.length > 0) {
      const upd: any = { invoice_id: invoiceId };
      if (templateId !== undefined) upd.matched_template_id = templateId;
      await supabase
        .from("bookings")
        .update(upd)
        .eq("bank_transaction_id", txnId);
    }
  };
  // Backwards-compat shim
  const syncBookingInvoice = (txnId: string, invoiceId: string | null) =>
    syncBookingMatch(txnId, invoiceId, undefined);

  const removeAssignment = async (txnId: string) => {
    const { error } = await supabase.from("bank_transactions").update({
      match_status: "unmatched",
      matched_invoice_id: null,
      matched_template_id: null,
    }).eq("id", txnId);
    if (error) { toast.error("Fehler beim Entfernen der Zuordnung"); }
    else {
      await syncBookingMatch(txnId, null, null);
      toast.success("Zuordnung entfernt");
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("bookings") });
    }
  };

  const openReviewForTxn = (txnId: string) => {
    const idx = allUnbookedForReview.findIndex((t: any) => t.id === txnId);
    setReviewInitialIndex(idx >= 0 ? idx : 0);
    setReviewModeOpen(true);
  };

  const handleManualAssign = async () => {
    if (!manualAssignTxn || !manualAssignId) return;
    const updateData: any = {
      match_status: "manually_matched",
      ai_suggestion: null, // Reset so AI re-analyzes with new context
      ai_analysis_status: null,
      ai_analysis_attempts: 0,
    };
    if (manualAssignType === "invoice") { updateData.matched_invoice_id = manualAssignId; updateData.matched_template_id = null; }
    else { updateData.matched_template_id = manualAssignId; updateData.matched_invoice_id = null; }
    const txnId = manualAssignTxn.id;
    const { error } = await supabase.from("bank_transactions").update(updateData).eq("id", txnId);
    if (error) { toast.error("Fehler beim Zuordnen"); }
    else {
      if (manualAssignType === "invoice") await syncBookingMatch(txnId, manualAssignId, null);
      else await syncBookingMatch(txnId, null, manualAssignId);
      toast.success("Transaktion manuell zugeordnet");
      setManualAssignTxn(null);
      setManualAssignId("");
      // Reset AI prefetch so it picks up the newly matched transaction
      resetAiPrefetch();
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("bookings") });
      openReviewForTxn(txnId);
    }
  };

  const handleBookAll = async () => {
    setBookingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-booking-data", {
        body: { bookAll: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.message || "Alle Buchungen gesendet");
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
    } catch (err: any) {
      toast.error("Fehler beim Buchen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setBookingAll(false);
    }
  };

  const handleRematch = async () => {
    if (!selectedBuilding) return;
    setRematching(true);
    try {
      // Reset AI prefetch state so it restarts after rematch
      resetAiPrefetch();
      // Reset all AI suggestions for this building so they get re-analyzed
      await supabase.from("bank_transactions")
        .update({
          ai_suggestion: null,
          ai_analysis_status: null,
          ai_analysis_attempts: 0,
        } as any)
        .eq("building_id", selectedBuilding)
        .is("booked_at", null);

      const { data, error } = await supabase.functions.invoke("parse-bank-statement", {
        body: { rematchBuildingId: selectedBuilding },
      });
      if (error) throw error;
      if (data?.matched > 0) {
        toast.success(`${data.matched} von ${data.total} Transaktionen neu zugeordnet`);
      } else {
        toast.info("Keine neuen Zuordnungen gefunden");
      }
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    } catch (err: any) {
      toast.error("Fehler beim Abgleich: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setRematching(false);
    }
  };

  const handleBookSingle = async (txnId: string) => {
    setBookingSingleId(txnId);
    try {
      const { data, error } = await supabase.functions.invoke("send-booking-data", {
        body: { transactionIds: [txnId] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.message || "Transaktion gebucht");
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    } catch (err: any) {
      toast.error("Fehler beim Buchen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setBookingSingleId(null);
    }
  };

  const openReviewAtTransaction = (txn: any) => {
    const idx = allUnbookedForReview.findIndex((t: any) => t.id === txn.id);
    setReviewInitialIndex(idx >= 0 ? idx : 0);
    setReviewModeOpen(true);
  };

  const openStatementPdf = async (filePath: string | null, fileName?: string) => {
    if (!filePath) {
      toast.error("Originaldatei nicht verfügbar");
      return;
    }
    const { data, error } = await supabase.storage.from("building-documents").createSignedUrl(filePath, 600);
    if (error || !data?.signedUrl) {
      toast.error("Datei konnte nicht geöffnet werden");
      return;
    }
    const isPdf = filePath.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      setStatementPdf({ url: data.signedUrl, name: fileName || "Kontoauszug" });
    } else {
      // Non-PDF (CAMT XML etc.) → download via anchor (avoids popup blocker)
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = fileName || "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const renderTransactionRow = (txn: any) => {
    const config = MATCH_STATUS_CONFIG[txn.match_status] || MATCH_STATUS_CONFIG.unmatched;
    const Icon = config.icon;
    const name = txn.amount < 0 ? txn.creditor_name : txn.debtor_name;
    const isMatchedUnbooked = ["matched_invoice", "matched_template", "manually_matched"].includes(txn.match_status) && !txn.booked_at;
    return (
      <TableRow key={txn.id} className="cursor-pointer hover:bg-accent/50" onClick={async () => {
        if (txn.booked_at && txn.bookings?.id) {
          // Direkt in Buchungs-Bearbeitung springen statt Detail-Sheet
          const { data: full, error } = await supabase
            .from("bookings")
            .select("*, invoices(id, file_path, file_name, vendor_name)")
            .eq("id", txn.bookings.id)
            .maybeSingle();
          if (error || !full) { toast.error("Buchung nicht gefunden"); return; }
          const bName = buildings.find((b: any) => b.id === full.building_id)?.name || "";
          setEditBuildingName(bName);
          setEditBooking(full);
          return;
        }
        if (isMatchedUnbooked) {
          openReviewAtTransaction(txn);
        } else if ((txn.match_status === "unmatched" || txn.match_status === "invoice_pending") && !txn.booked_at) {
          openReviewAtTransaction(txn);
        } else {
          setSelectedTransaction(txn.id);
        }
      }}>
        <TableCell className="text-sm whitespace-nowrap">{format(new Date(txn.booking_date), "dd.MM.yyyy")}</TableCell>
        <TableCell className="text-sm max-w-[150px] truncate">{name || "–"}</TableCell>
        <TableCell className="text-sm max-w-[200px] truncate">{txn.purpose || "–"}</TableCell>
        <TableCell className={`text-sm text-right font-mono whitespace-nowrap ${txn.amount < 0 ? "text-destructive" : "text-green-600"}`}>
          {txn.amount < 0 ? "" : "+"}{Number(txn.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Badge className={`text-xs gap-1 ${config.color}`} variant="outline">
              <Icon className="h-3 w-3" />{config.label}
            </Badge>
            {txn.booked_at && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">✓</Badge>}
            {isMatchedUnbooked && (txn.matched_invoice_id || txn.matched_template_id) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => { e.stopPropagation(); removeAssignment(txn.id); }}
                    >
                      <Link2Off className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Zuordnung entfernen</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {txn.bookings?.needs_review && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Flag className="h-3.5 w-3.5 text-orange-500 fill-orange-500" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs font-medium">Zur Prüfung markiert</p>
                    {txn.bookings?.review_note && <p className="text-xs text-muted-foreground">{txn.bookings.review_note}</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const transactionTableHeader = (
    <TableHeader>
      <TableRow>
        <TableHead>Datum</TableHead>
        <TableHead>Name</TableHead>
        <TableHead>Verwendungszweck</TableHead>
        <TableHead className="text-right">Betrag</TableHead>
        <TableHead>Status</TableHead>
        
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg">Kontoauszüge</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedBuilding && unmatchedTransactions.length > 0 && (
                <Button variant="outline" size="icon" disabled={rematching} onClick={handleRematch} title="Neu abgleichen">
                  {rematching ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <div className="relative">
                      <RefreshCw className="h-4 w-4" />
                      <span className="absolute -top-2 -right-2 text-[10px] font-bold bg-primary text-primary-foreground rounded-full h-4 w-4 flex items-center justify-center">{unmatchedTransactions.length}</span>
                    </div>
                  )}
                </Button>
              )}

              <input ref={fileInputRef} type="file" accept=".xml,.pdf" multiple className="hidden" onChange={handleFileUpload} />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || !selectedBuilding || selectedBuilding === "all"} title={!selectedBuilding ? "Bitte zuerst Liegenschaft wählen" : undefined}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {uploadProgress ? `Datei ${uploadProgress.current}/${uploadProgress.total}…` : "Importiere…"}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Kontoauszug importieren
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedBuilding ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Bitte wählen Sie eine Liegenschaft aus</p>
              <p className="text-sm mt-1">Kontoauszüge werden pro Liegenschaft angezeigt</p>
            </div>
          ) : txnsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allBuildingTxns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Transaktionen importiert</p>
              <p className="text-sm mt-1">Laden Sie CAMT-XML oder Kontoauszug-PDFs hoch</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Bank account info */}
              {bankAccounts.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {bankAccounts.map((ba: any, i: number) => {
                    const map = mappingByIban[ba.account_iban];
                    const acc = map?.coa_account_id ? accountById[map.coa_account_id] : null;
                    const isMapped = !!acc;
                    return (
                      <button
                        type="button"
                        key={i}
                        onClick={() => setMappingDialog({ iban: ba.account_iban, bankName: ba.account_name })}
                        className={
                          "flex items-center gap-2 text-sm rounded-lg px-3 py-2 border transition-colors text-left " +
                          (isMapped
                            ? "bg-muted/50 hover:bg-muted border-border"
                            : "bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50 border-orange-300 dark:border-orange-800")
                        }
                        title="Klicken um IBAN einem Konto im Kontenrahmen zuzuordnen"
                      >
                        <Landmark className={"h-4 w-4 shrink-0 " + (isMapped ? "text-primary" : "text-orange-600")} />
                        <span className="font-mono text-xs">{ba.account_iban?.replace(/(.{4})/g, '$1 ').trim()}</span>
                        {ba.account_name && <span className="text-muted-foreground">— {ba.account_name}</span>}
                        {isMapped ? (
                          <Badge variant="secondary" className="text-[10px] ml-1">
                            {map?.display_name ? `${map.display_name} · ` : ""}{acc?.account_number} {acc?.account_name}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] ml-1 bg-orange-500 hover:bg-orange-600 text-white">Zuordnen</Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Importierte Auszüge (eingeklappt per Default) */}
              {bankStatements.length > 0 && (
                <Card className="bg-muted/20">
                  <CardHeader className="pb-2">
                    <button
                      type="button"
                      onClick={() => setStatementsExpanded(v => !v)}
                      className="w-full flex items-center justify-between gap-2 text-left"
                      aria-expanded={statementsExpanded}
                    >
                      <CardTitle className="text-sm flex items-center gap-2">
                        {statementsExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <FileText className="h-4 w-4" />
                        Importierte Auszüge ({bankStatements.length})
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">
                        {statementsExpanded ? "Einklappen" : "Ausklappen"}
                      </span>
                    </button>
                  </CardHeader>
                  {statementsExpanded && (
                    <CardContent className="pt-0">
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {bankStatements.map((s: any) => {
                          const isPdf = s.source_format === "pdf";
                          const hasWarn = Array.isArray(s.parse_warnings) && s.parse_warnings.length > 0;
                          const startDate = s.statement_date_from ? new Date(s.statement_date_from) : null;
                          const monthLabel = startDate
                            ? `${format(startDate, "LLLL", { locale: de })} ${format(startDate, "yyyy")}`
                            : s.file_name;
                          return (
                            <div key={s.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/50">
                              {isPdf ? <FileText className="h-3.5 w-3.5 text-red-600 shrink-0" /> : <FileCode className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                              <Badge variant="outline" className="text-[10px] h-4">{isPdf ? "PDF" : "CAMT"}</Badge>
                              <span className="font-medium whitespace-nowrap">{monthLabel}</span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                {s.statement_date_from && format(new Date(s.statement_date_from), "dd.MM.yy")}
                                {s.statement_date_to && ` – ${format(new Date(s.statement_date_to), "dd.MM.yy")}`}
                              </span>
                              <span className="flex-1 truncate text-muted-foreground" title={s.file_name}>{s.file_name}</span>
                              {s.opening_balance != null && s.closing_balance != null && (
                                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                                  {Number(s.opening_balance).toLocaleString("de-DE", { minimumFractionDigits: 2 })} → {Number(s.closing_balance).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                                </span>
                              )}
                              {hasWarn && (() => {
                                const isCritical = s.parse_warnings.some((w: string) =>
                                  /Summenprüfung|Σ Transaktionen/i.test(String(w))
                                );
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        {isCritical ? (
                                          <Badge variant="destructive" className="text-[10px] h-5 gap-1 cursor-help">
                                            <AlertCircle className="h-3 w-3" />
                                            Prüfen!
                                          </Badge>
                                        ) : (
                                          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                        )}
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-md">
                                        <p className="text-xs font-semibold mb-1">
                                          {isCritical ? "Datensätze prüfen — Bank-Summe stimmt nicht!" : "Hinweise zum Import"}
                                        </p>
                                        <ul className="text-xs list-disc pl-4">
                                          {s.parse_warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                                        </ul>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                              {s.file_path ? (
                                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => openStatementPdf(s.file_path, s.file_name)}>
                                  <ExternalLink className="h-3 w-3 mr-1" />Öffnen
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">— nur Daten</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )}

              {/* Search */}
              {selectedBuilding && allBuildingTxns.length > 0 && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Suche nach Datum, Betrag, Verwendungszweck oder Name…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-md"
                  />
                  {searchQuery && (
                    <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>Zurücksetzen</Button>
                  )}
                  {searchQuery && (
                    <span className="text-xs text-muted-foreground">{filteredBuildingTxns.length} von {allBuildingTxns.length} Treffern</span>
                  )}
                </div>
              )}

              {/* Summary badges + AI prefetch indicator */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{allBuildingTxns.length} Transaktionen gesamt</Badge>
                {unmatchedTransactions.length > 0 && <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950">{unmatchedTransactions.length} offen</Badge>}
                {matchedTransactions.length > 0 && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">{matchedTransactions.length} zugeordnet</Badge>}
                {ignoredTransactions.length > 0 && <Badge variant="outline" className="text-xs bg-muted">{ignoredTransactions.length} ignoriert</Badge>}
                {bookedTransactions.length > 0 && <Badge variant="outline" className="text-xs">{bookedTransactions.length} gebucht</Badge>}
                {(() => {
                  const failedTxns = allBuildingTxns.filter((t: any) => t.ai_analysis_status === "failed");
                  const renderErrorPopoverContent = () => (
                    <PopoverContent className="w-[420px] p-0" align="start">
                      <div className="p-3 border-b">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          KI-Analyse-Fehler ({failedTxns.length})
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Diese Transaktionen konnten nicht analysiert werden.
                        </p>
                      </div>
                      <ScrollArea className="max-h-[400px]">
                        <div className="p-2 space-y-2">
                          {failedTxns.map((t: any) => (
                            <div key={t.id} className="text-xs border rounded p-2 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{format(new Date(t.booking_date), "dd.MM.yyyy")}</span>
                                <span className={`font-mono font-semibold ${Number(t.amount) < 0 ? "text-destructive" : "text-green-600"}`}>
                                  {Number(t.amount).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                                </span>
                              </div>
                              <div className="text-muted-foreground line-clamp-2">{t.purpose || t.creditor_name || t.debtor_name || "—"}</div>
                              <div className="text-destructive bg-destructive/5 rounded px-2 py-1 text-[11px]">
                                {t.ai_analysis_error || "Unbekannter Fehler"}
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <span className="text-[10px] text-muted-foreground">Versuche: {t.ai_analysis_attempts ?? 0}</span>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={async () => {
                                      await supabase.from("bank_transactions")
                                        .update({ ai_analysis_status: null, ai_analysis_attempts: 0, ai_analysis_error: null } as any)
                                        .eq("id", t.id);
                                      resetAiPrefetch();
                                      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
                                      toast.success("Transaktion wird erneut analysiert");
                                    }}
                                  >
                                    <RotateCw className="h-3 w-3 mr-1" />Erneut
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      setManualAssignTxn(t);
                                      setManualAssignType("invoice");
                                      setManualAssignId("");
                                    }}
                                  >
                                    Zuordnen
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  );

                  return (
                    <>
                      {aiPrefetchState.running && (
                        <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 gap-1">
                          <Sparkles className="h-3 w-3 animate-pulse" />
                          KI analysiert {aiPrefetchState.completed}/{aiPrefetchState.total}
                          {failedTxns.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-destructive ml-1 underline underline-offset-2 hover:text-destructive/80 cursor-pointer">
                                  ({failedTxns.length} Fehler)
                                </button>
                              </PopoverTrigger>
                              {renderErrorPopoverContent()}
                            </Popover>
                          )}
                        </Badge>
                      )}
                      {!aiPrefetchState.running && aiPrefetchState.abortReason && (
                        <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 gap-1">
                          <FileWarning className="h-3 w-3" />
                          {aiPrefetchState.abortReason}
                        </Badge>
                      )}
                      {!aiPrefetchState.running && !aiPrefetchState.abortReason && aiPrefetchState.completed > 0 && (
                        <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                          <Sparkles className="h-3 w-3 mr-1" />
                          {aiPrefetchState.completed} KI-Vorschläge
                        </Badge>
                      )}
                      {!aiPrefetchState.running && failedTxns.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button>
                              <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 gap-1 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900">
                                <AlertCircle className="h-3 w-3" />
                                {failedTxns.length} KI-Fehler
                              </Badge>
                            </button>
                          </PopoverTrigger>
                          {renderErrorPopoverContent()}
                        </Popover>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Matched (not yet booked) transactions - ABOVE unmatched */}
              {matchedTransactions.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />Zugeordnete Transaktionen ({matchedTransactions.length})
                    </h4>
                  </div>
                  <Table>
                    {transactionTableHeader}
                    <TableBody>{matchedTransactions.map(renderTransactionRow)}</TableBody>
                  </Table>
                </div>
              )}

              {/* Unmatched transactions */}
              {unmatchedTransactions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-yellow-600" />Offene Transaktionen ({unmatchedTransactions.length})
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">Diese Transaktionen konnten keiner Rechnung oder Vorlage zugeordnet werden. Sie können einzeln ohne Zuordnung gebucht werden.</p>
                  <Table>
                    {transactionTableHeader}
                    <TableBody>{unmatchedTransactions.map(renderTransactionRow)}</TableBody>
                  </Table>
                </div>
              )}


              {/* Ignored transactions */}
              {ignoredTransactions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Switch checked={showIgnored} onCheckedChange={setShowIgnored} id="show-ignored" />
                    <Label htmlFor="show-ignored" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-2">
                      <EyeOff className="h-4 w-4" />Ignorierte Transaktionen ({ignoredTransactions.length})
                    </Label>
                  </div>
                  {showIgnored && (
                    <Table>
                      {transactionTableHeader}
                      <TableBody>{ignoredTransactions.map(renderTransactionRow)}</TableBody>
                    </Table>
                  )}
                </div>
              )}

              {/* Booked transactions */}
              {bookedTransactions.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Switch checked={showBooked} onCheckedChange={setShowBooked} id="show-booked" />
                      <Label htmlFor="show-booked" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />Gebuchte Transaktionen ({bookedTransactions.length})
                      </Label>
                    </div>
                    {showBooked && bookedTransactions.some((t: any) => t.bookings?.needs_review) && (
                      <div className="flex items-center gap-2">
                        <Switch checked={reviewFlaggedFirst} onCheckedChange={setReviewFlaggedFirst} id="flagged-first" />
                        <Label htmlFor="flagged-first" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1.5">
                          <Flag className="h-3.5 w-3.5 text-orange-500" />Markierte oben
                        </Label>
                      </div>
                    )}
                  </div>
                  {showBooked && (
                    <Table>
                      {transactionTableHeader}
                      <TableBody>{
                        (reviewFlaggedFirst
                          ? [...bookedTransactions].sort((a: any, b: any) => (b.bookings?.needs_review ? 1 : 0) - (a.bookings?.needs_review ? 1 : 0))
                          : bookedTransactions
                        ).map(renderTransactionRow)
                      }</TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionDetailSheet transactionId={selectedTransaction} onClose={() => setSelectedTransaction(null)} />

      <AssignmentDialog
        transaction={manualAssignTxn}
        onClose={() => setManualAssignTxn(null)}
        invoicesList={invoicesList}
        templatesList={templatesList}
        allTransactions={allBuildingTxns}
        showMatchedInvoices={showMatchedInvoices}
        setShowMatchedInvoices={setShowMatchedInvoices}
        onAssign={async (type, id) => {
          if (!manualAssignTxn) return;
          const updateData: any = {
            match_status: "manually_matched",
            ai_suggestion: null, // Reset so AI re-analyzes with new invoice/template context
            ai_analysis_status: null,
            ai_analysis_attempts: 0,
          };
          if (type === "invoice") { updateData.matched_invoice_id = id; updateData.matched_template_id = null; }
          else { updateData.matched_template_id = id; updateData.matched_invoice_id = null; }
          const { error } = await supabase.from("bank_transactions").update(updateData).eq("id", manualAssignTxn.id);
          if (error) { toast.error("Fehler beim Zuordnen"); }
          else {
            const txnId = manualAssignTxn.id;
            if (type === "invoice") await syncBookingMatch(txnId, id, null);
            else await syncBookingMatch(txnId, null, id);
            toast.success("Transaktion manuell zugeordnet");
            setManualAssignTxn(null);
            setManualAssignId("");
            resetAiPrefetch();
            queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
            queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
            queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("bookings") });
            openReviewForTxn(txnId);
          }
        }}
        onOpenBookingDialog={(prefill, hintIndex) => {
          setBookingPrefill(prefill);
          setLinkedTransactionId(manualAssignTxn?.id || null);
          setCurrentHintIndex(hintIndex ?? null);
          setCreateBookingOpen(true);
        }}
        onCreateTemplate={async (template, txn) => {
          // Find account_id from account_number
          let accountId = null;
          if (template.account_number) {
            const { data: accData } = await supabase
              .from("chart_of_accounts")
              .select("id")
              .eq("account_number", template.account_number)
              .limit(1)
              .maybeSingle();
            if (accData) accountId = accData.id;
          }

          const { data: newTemplate, error } = await supabase.from("booking_templates").insert({
            name: template.name,
            vendor_name: template.vendor_name,
            vendor_iban: template.vendor_iban || null,
            expected_amount: template.expected_amount,
            interval: template.interval || null,
            account_id: accountId,
            building_id: selectedBuilding,
          } as any).select("id").single();

          if (error) {
            toast.error("Fehler beim Erstellen der Vorlage");
            return;
          }

          // Assign transaction to new template
          await supabase.from("bank_transactions").update({
            matched_template_id: newTemplate.id,
            match_status: "manually_matched",
          }).eq("id", txn.id);

          toast.success("Vorlage erstellt & Transaktion zugeordnet");
          setManualAssignTxn(null);
          queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
          queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
          queryClient.invalidateQueries({ queryKey: ["templates-for-assign"] });
        }}
      />

      <CreateBookingDialog
        open={createBookingOpen}
        onOpenChange={(open) => {
          setCreateBookingOpen(open);
          if (!open) {
            setBookingPrefill(null);
            setLinkedTransactionId(null);
          }
        }}
        buildings={buildings}
        preselectedBuildingId={selectedBuilding}
        preselectedYear={String(new Date().getFullYear())}
        prefill={bookingPrefill}
        linkedTransactionId={linkedTransactionId}
        onBookingCreated={async (bookingId) => {
          // Link the booking to the transaction but do NOT mark as booked yet.
          if (linkedTransactionId) {
            await supabase.from("bank_transactions").update({
              booking_id: bookingId,
              match_status: "manually_matched",
            }).eq("id", linkedTransactionId);
          }
          // Notify AssignmentDialog to dismiss this hint
          if (currentHintIndex !== null && manualAssignTxn) {
            setManualAssignTxn((prev: any) => prev ? { ...prev, _dismissHintIndex: currentHintIndex } : prev);
          }
          setCurrentHintIndex(null);
          queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
          queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
          queryClient.invalidateQueries({ queryKey: ["bookings"] });
        }}
      />

      <TransactionReviewMode
        open={reviewModeOpen}
        onOpenChange={setReviewModeOpen}
        transactions={allUnbookedForReview}
        buildingId={selectedBuilding}
        initialIndex={reviewInitialIndex}
      />

      <PdfViewerModal
        isOpen={!!statementPdf}
        onClose={() => setStatementPdf(null)}
        documentUrl={statementPdf?.url ?? null}
        documentName={statementPdf?.name ?? "Kontoauszug"}
      />

      {mappingDialog && selectedBuilding && (
        <BankAccountMappingDialog
          open={!!mappingDialog}
          onOpenChange={(o) => { if (!o) setMappingDialog(null); }}
          buildingId={selectedBuilding}
          iban={mappingDialog.iban}
          bankNameFromStatement={mappingDialog.bankName}
        />
      )}
    </div>
  );
}
