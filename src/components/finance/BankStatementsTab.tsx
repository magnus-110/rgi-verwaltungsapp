import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, CheckCircle2, FileQuestion, LayoutTemplate, EyeOff, Building2, BookOpen, Link2, Send, RefreshCw, Landmark, FileWarning, Sparkles, Flag } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";
import { AssignmentDialog } from "./AssignmentDialog";
import { TransactionDetailSheet } from "./TransactionDetailSheet";
import { CreateBookingDialog } from "./CreateBookingDialog";
import { TransactionReviewMode } from "./TransactionReviewMode";
import { useTransactionAiPrefetch } from "@/hooks/useTransactionAiPrefetch";
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
  const [showIgnored, setShowIgnored] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);
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
        .order("booking_date", { ascending: false });
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

  // Fetch bank statements for IBAN display
  const { data: bankStatements = [] } = useQuery({
    queryKey: ["bank-statements-info", selectedBuilding],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const { data, error } = await supabase
        .from("bank_statements")
        .select("account_iban, account_name")
        .eq("building_id", selectedBuilding)
        .not("account_iban", "is", null)
        .order("created_at", { ascending: false })
        .limit(5);
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
        .select("id, invoice_number, vendor_name, gross_amount, vendor_iban, invoice_date")
        .eq("status", "paid")
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

  // Categorize transactions
  const matchedTransactions = useMemo(() =>
    allBuildingTxns.filter((t: any) => ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status) && !t.booked_at),
    [allBuildingTxns]
  );
  const unmatchedTransactions = useMemo(() =>
    allBuildingTxns.filter((t: any) => t.match_status === "unmatched" || t.match_status === "invoice_pending"),
    [allBuildingTxns]
  );
  const ignoredTransactions = useMemo(() =>
    allBuildingTxns.filter((t: any) => t.match_status === "ignored" && !t.booked_at),
    [allBuildingTxns]
  );
  const bookedTransactions = useMemo(() =>
    allBuildingTxns.filter((t: any) => t.booked_at),
    [allBuildingTxns]
  );

  // All unbooked transactions for review mode (matched first, then unmatched)
  const allUnbookedForReview = useMemo(() => {
    const matched = allBuildingTxns.filter((t: any) => ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status) && !t.booked_at);
    const unmatched = allBuildingTxns.filter((t: any) => (t.match_status === "unmatched" || t.match_status === "invoice_pending") && !t.booked_at);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const xmlFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith(".xml"));
    if (xmlFiles.length === 0) {
      toast.error("Bitte CAMT XML-Dateien hochladen");
      return;
    }

    setUploading(true);
    setUploadProgress(xmlFiles.length > 1 ? { current: 0, total: xmlFiles.length } : null);

    let totalImported = 0;
    let totalMatched = 0;
    let totalDuplicates = 0;
    let errors = 0;

    for (let i = 0; i < xmlFiles.length; i++) {
      const file = xmlFiles[i];
      if (xmlFiles.length > 1) setUploadProgress({ current: i + 1, total: xmlFiles.length });

      try {
        const xmlContent = await readFileContent(file);
        const { data, error } = await supabase.functions.invoke("parse-bank-statement", {
          body: { xmlContent, buildingId: selectedBuilding !== "all" ? selectedBuilding : null },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        totalImported += data.totalTransactions || 0;
        totalMatched += data.matchedCount || 0;
        totalDuplicates += data.duplicatesSkipped || 0;
      } catch (err: any) {
        errors++;
        console.error(`Fehler bei ${file.name}:`, err);
      }
    }

    if (xmlFiles.length === 1) {
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
      const parts = [`${xmlFiles.length - errors} von ${xmlFiles.length} Dateien verarbeitet`];
      if (totalImported > 0) parts.push(`${totalImported} Transaktionen importiert`);
      if (totalMatched > 0) parts.push(`${totalMatched} zugeordnet`);
      if (totalDuplicates > 0) parts.push(`${totalDuplicates} Duplikate übersprungen`);
      if (errors > 0) parts.push(`${errors} Fehler`);
      toast.success(parts.join(", "));
    }

    queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
    queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
    queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });

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

  const removeAssignment = async (txnId: string) => {
    const { error } = await supabase.from("bank_transactions").update({
      match_status: "unmatched",
      matched_invoice_id: null,
      matched_template_id: null,
    }).eq("id", txnId);
    if (error) { toast.error("Fehler beim Entfernen der Zuordnung"); }
    else {
      toast.success("Zuordnung entfernt");
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    }
  };

  const handleManualAssign = async () => {
    if (!manualAssignTxn || !manualAssignId) return;
    const updateData: any = { match_status: "manually_matched" };
    if (manualAssignType === "invoice") { updateData.matched_invoice_id = manualAssignId; }
    else { updateData.matched_template_id = manualAssignId; }
    const { error } = await supabase.from("bank_transactions").update(updateData).eq("id", manualAssignTxn.id);
    if (error) { toast.error("Fehler beim Zuordnen"); }
    else {
      toast.success("Transaktion manuell zugeordnet");
      setManualAssignTxn(null);
      setManualAssignId("");
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
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
      queryClient.invalidateQueries({ queryKey: ["bookings-pending"] });
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
      // Reset all AI suggestions for this building so they get re-analyzed
      await supabase.from("bank_transactions")
        .update({ ai_suggestion: null } as any)
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

  const renderTransactionRow = (txn: any) => {
    const config = MATCH_STATUS_CONFIG[txn.match_status] || MATCH_STATUS_CONFIG.unmatched;
    const Icon = config.icon;
    const name = txn.amount < 0 ? txn.creditor_name : txn.debtor_name;
    const isMatchedUnbooked = ["matched_invoice", "matched_template", "manually_matched"].includes(txn.match_status) && !txn.booked_at;
    return (
      <TableRow key={txn.id} className="cursor-pointer hover:bg-accent/50" onClick={() => {
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

              <input ref={fileInputRef} type="file" accept=".xml" multiple className="hidden" onChange={handleFileUpload} />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
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
              <p className="text-sm mt-1">Laden Sie CAMT XML-Dateien hoch</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Bank account info */}
              {bankAccounts.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {bankAccounts.map((ba: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2 border">
                      <Landmark className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-mono text-xs">{ba.account_iban?.replace(/(.{4})/g, '$1 ').trim()}</span>
                      {ba.account_name && <span className="text-muted-foreground">— {ba.account_name}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Summary badges + AI prefetch indicator */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{allBuildingTxns.length} Transaktionen gesamt</Badge>
                {unmatchedTransactions.length > 0 && <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950">{unmatchedTransactions.length} offen</Badge>}
                {matchedTransactions.length > 0 && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">{matchedTransactions.length} zugeordnet</Badge>}
                {ignoredTransactions.length > 0 && <Badge variant="outline" className="text-xs bg-muted">{ignoredTransactions.length} ignoriert</Badge>}
                {bookedTransactions.length > 0 && <Badge variant="outline" className="text-xs">{bookedTransactions.length} gebucht</Badge>}
                {aiPrefetchState.running && (
                  <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 gap-1">
                    <Sparkles className="h-3 w-3 animate-pulse" />
                    KI analysiert {aiPrefetchState.completed}/{aiPrefetchState.total}
                  </Badge>
                )}
                {!aiPrefetchState.running && aiPrefetchState.completed > 0 && (
                  <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {aiPrefetchState.completed} KI-Vorschläge
                  </Badge>
                )}
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
          const updateData: any = { match_status: "manually_matched" };
          if (type === "invoice") { updateData.matched_invoice_id = id; updateData.matched_template_id = null; }
          else { updateData.matched_template_id = id; updateData.matched_invoice_id = null; }
          const { error } = await supabase.from("bank_transactions").update(updateData).eq("id", manualAssignTxn.id);
          if (error) { toast.error("Fehler beim Zuordnen"); }
          else {
            toast.success("Transaktion manuell zugeordnet");
            setManualAssignTxn(null);
            setManualAssignId("");
            queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
            queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
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
    </div>
  );
}
