import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Upload, FileText, Loader2, ChevronDown, ChevronUp, CheckCircle2, FileQuestion, LayoutTemplate, EyeOff, Trash2, Building2, BookOpen, Link2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { TransactionDetailSheet } from "./TransactionDetailSheet";

const MATCH_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  matched_invoice: { label: "Rechnung", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2 },
  matched_template: { label: "Vorlage", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: LayoutTemplate },
  manually_matched: { label: "Manuell", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", icon: CheckCircle2 },
  unmatched: { label: "Unbekannt", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: FileQuestion },
  ignored: { label: "Ignoriert", color: "bg-muted text-muted-foreground", icon: EyeOff },
};

export function BankStatementsTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookingAll, setBookingAll] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [showIgnored, setShowIgnored] = useState(false);
  const [showBooked, setShowBooked] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);
  const [manualAssignTxn, setManualAssignTxn] = useState<any | null>(null);
  const [manualAssignType, setManualAssignType] = useState<"invoice" | "template">("invoice");
  const [manualAssignId, setManualAssignId] = useState<string>("");
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: statements = [], isLoading } = useQuery({
    queryKey: ["bank-statements", selectedBuilding],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const { data, error } = await supabase
        .from("bank_statements")
        .select("*")
        .eq("building_id", selectedBuilding)
        .order("import_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuilding,
  });

  // Fetch ALL transactions for ALL statements to determine completion status and global bookable count
  const { data: allTransactions = [] } = useQuery({
    queryKey: ["bank-transactions-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, statement_id, match_status, booked_at")
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["bank-transactions", expandedStatement],
    queryFn: async () => {
      if (!expandedStatement) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("statement_id", expandedStatement)
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!expandedStatement,
  });

  const [showMatchedInvoices, setShowMatchedInvoices] = useState(false);

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

  // Filter out invoices already assigned to a bank transaction (unless toggle is on)
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
        .select("id, name, vendor_name, vendor_iban, expected_amount")
        .eq("building_id", selectedBuilding)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuilding,
  });

  // Compute completion status per statement
  const statementCompletion = useMemo(() => {
    const map: Record<string, { total: number; completed: number; isComplete: boolean }> = {};
    allTransactions.forEach((t: any) => {
      if (!map[t.statement_id]) map[t.statement_id] = { total: 0, completed: 0, isComplete: false };
      map[t.statement_id].total++;
      if (t.booked_at || t.match_status === "ignored") map[t.statement_id].completed++;
    });
    Object.values(map).forEach(v => { v.isComplete = v.total > 0 && v.completed === v.total; });
    return map;
  }, [allTransactions]);

  // Global bookable count
  const globalBookableCount = useMemo(() => {
    return allTransactions.filter((t: any) =>
      ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status) && !t.booked_at
    ).length;
  }, [allTransactions]);

  // Filter statements
  const visibleStatements = useMemo(() => {
    if (showCompleted) return statements;
    return statements.filter((s: any) => {
      const comp = statementCompletion[s.id];
      return !comp || !comp.isComplete;
    });
  }, [statements, statementCompletion, showCompleted]);

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
    let lastStatementId: string | null = null;

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
        if (data.statementId) lastStatementId = data.statementId;
      } catch (err: any) {
        errors++;
        console.error(`Fehler bei ${file.name}:`, err);
      }
    }

    // Show summary
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
    queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    if (lastStatementId) setExpandedStatement(lastStatementId);

    setUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deleteStatement = async (stmtId: string) => {
    try {
      const { error: txError } = await supabase.from("bank_transactions").delete().eq("statement_id", stmtId);
      if (txError) throw txError;
      const { error: stmtError } = await supabase.from("bank_statements").delete().eq("id", stmtId);
      if (stmtError) throw stmtError;
      if (expandedStatement === stmtId) setExpandedStatement(null);
      toast.success("Kontoauszug gelöscht");
      queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    } catch (err: any) {
      toast.error("Fehler beim Löschen: " + (err.message || "Unbekannter Fehler"));
    }
  };

  const assignBuildingToStatement = async (stmtId: string, buildingId: string | null) => {
    try {
      const { error: stmtError } = await supabase.from("bank_statements").update({ building_id: buildingId }).eq("id", stmtId);
      if (stmtError) throw stmtError;
      const { error: txError } = await supabase.from("bank_transactions").update({ building_id: buildingId }).eq("statement_id", stmtId);
      if (txError) throw txError;
      toast.success("Liegenschaft zugeordnet");
      setAssigningBuilding(null);
      queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannter Fehler"));
    }
  };

  const updateMatchStatus = async (txnId: string, status: string) => {
    const { error } = await supabase.from("bank_transactions").update({ match_status: status }).eq("id", txnId);
    if (error) { toast.error("Fehler beim Aktualisieren"); }
    else {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
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
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
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
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
    }
  };

  const handleBookStatement = async (stmtId: string) => {
    setBooking(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-booking-data", {
        body: { statementId: stmtId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.message || "Buchungen gesendet");
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ queryKey: ["bookings-pending"] });
    } catch (err: any) {
      toast.error("Fehler beim Buchen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setBooking(false);
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
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      queryClient.invalidateQueries({ queryKey: ["bookings-pending"] });
    } catch (err: any) {
      toast.error("Fehler beim Buchen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setBookingAll(false);
    }
  };

  const getMatchCounts = (stmtId: string) => {
    if (expandedStatement !== stmtId) return null;
    const matched = transactions.filter((t) => ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status)).length;
    const booked = transactions.filter((t) => t.booked_at).length;
    const unmatched = transactions.filter((t) => t.match_status === "unmatched").length;
    const ignored = transactions.filter((t) => t.match_status === "ignored").length;
    const bookable = transactions.filter((t) => ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status) && !t.booked_at).length;
    return { total: transactions.length, matched, booked, unmatched, ignored, bookable };
  };

  const getBuildingName = (buildingId: string | null) => {
    if (!buildingId) return null;
    return buildings.find((b) => b.id === buildingId)?.name || null;
  };

  const matchedTransactions = transactions.filter((t) => ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status));
  const unmatchedTransactions = transactions.filter((t) => t.match_status === "unmatched");
  const ignoredTransactions = transactions.filter((t) => t.match_status === "ignored");

  const completedCount = statements.filter((s: any) => statementCompletion[s.id]?.isComplete).length;

  const renderTransactionRow = (txn: any) => {
    const config = MATCH_STATUS_CONFIG[txn.match_status] || MATCH_STATUS_CONFIG.unmatched;
    const Icon = config.icon;
    const name = txn.amount < 0 ? txn.creditor_name : txn.debtor_name;
    return (
      <TableRow key={txn.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedTransaction(txn.id)}>
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
          </div>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {txn.match_status === "unmatched" && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setManualAssignTxn(txn); setManualAssignType("invoice"); setManualAssignId(""); }}>
                <Link2 className="h-3 w-3 mr-1" />Zuordnen
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => updateMatchStatus(txn.id, "ignored")}>
                <EyeOff className="h-3 w-3 mr-1" />Ignorieren
              </Button>
            </div>
          )}
          {["matched_invoice", "matched_template", "manually_matched"].includes(txn.match_status) && !txn.booked_at && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setManualAssignTxn(txn); setManualAssignType("invoice"); setManualAssignId(""); }}>
                <Link2 className="h-3 w-3 mr-1" />Ändern
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => removeAssignment(txn.id)}>
                Entfernen
              </Button>
            </div>
          )}
          {txn.match_status === "ignored" && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => updateMatchStatus(txn.id, "unmatched")}>
              Wiederherstellen
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg">Kontoauszüge</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Global book button */}
              {globalBookableCount > 0 && (
                <Button
                  variant="default"
                  disabled={bookingAll}
                  onClick={handleBookAll}
                >
                  {bookingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BookOpen className="h-4 w-4 mr-2" />}
                  Alle buchen ({globalBookableCount})
                </Button>
              )}

              <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
                <SelectTrigger className="w-[220px]">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Liegenschaft wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    CAMT importieren
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Show completed toggle */}
          {completedCount > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Switch checked={showCompleted} onCheckedChange={setShowCompleted} id="show-completed" />
              <Label htmlFor="show-completed" className="text-sm text-muted-foreground cursor-pointer">
                Abgeschlossene anzeigen ({completedCount})
              </Label>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!selectedBuilding ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Bitte wählen Sie eine Liegenschaft aus</p>
              <p className="text-sm mt-1">Kontoauszüge werden pro Liegenschaft angezeigt</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleStatements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{statements.length > 0 ? "Alle Kontoauszüge abgeschlossen" : "Noch keine Kontoauszüge importiert"}</p>
              {statements.length === 0 && <p className="text-sm mt-1">Laden Sie eine CAMT XML-Datei hoch</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleStatements.map((stmt: any) => {
                const isExpanded = expandedStatement === stmt.id;
                const counts = getMatchCounts(stmt.id);
                const buildingName = getBuildingName(stmt.building_id);
                const comp = statementCompletion[stmt.id];
                return (
                  <div key={stmt.id} className={`border rounded-lg ${comp?.isComplete ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <button
                        className="flex-1 flex items-center gap-3 text-left"
                        onClick={() => setExpandedStatement(isExpanded ? null : stmt.id)}
                      >
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm">
                            {stmt.account_iban || "Kontoauszug"}{" "}
                            {stmt.statement_date_from && (
                              <span className="text-muted-foreground font-normal">
                                ({format(new Date(stmt.statement_date_from), "dd.MM.yyyy", { locale: de })}
                                {stmt.statement_date_to && ` – ${format(new Date(stmt.statement_date_to), "dd.MM.yyyy", { locale: de })}`})
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Importiert am {format(new Date(stmt.import_date), "dd.MM.yyyy HH:mm", { locale: de })}</span>
                            {buildingName && (
                              <Badge variant="outline" className="text-xs">
                                <Building2 className="h-3 w-3 mr-1" />{buildingName}
                              </Badge>
                            )}
                            {comp?.isComplete && (
                              <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">
                                <CheckCircle2 className="h-3 w-3 mr-1" />Abgeschlossen
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        {counts && (
                          <div className="flex gap-1">
                            {counts.booked > 0 && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">{counts.booked}/{counts.total} gebucht</Badge>}
                            {counts.booked === 0 && counts.matched > 0 && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">{counts.matched} zugeordnet</Badge>}
                            {counts.unmatched > 0 && <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950">{counts.unmatched} offen</Badge>}
                          </div>
                        )}

                        {counts && counts.bookable > 0 && (
                          <Button size="sm" className="text-xs" disabled={booking} onClick={() => handleBookStatement(stmt.id)}>
                            {booking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <BookOpen className="h-3.5 w-3.5 mr-1" />}
                            Buchen ({counts.bookable})
                          </Button>
                        )}

                        {assigningBuilding === stmt.id ? (
                          <Select value={stmt.building_id || "none"} onValueChange={(val) => assignBuildingToStatement(stmt.id, val === "none" ? null : val)}>
                            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Liegenschaft" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Keine Zuordnung</SelectItem>
                              {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAssigningBuilding(stmt.id)}>
                            <Building2 className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Kontoauszug löschen?</AlertDialogTitle>
                              <AlertDialogDescription>Der Kontoauszug und alle zugehörigen Transaktionen werden unwiderruflich gelöscht.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteStatement(stmt.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <button onClick={() => setExpandedStatement(isExpanded ? null : stmt.id)}>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t px-4 pb-4 space-y-4">
                        {matchedTransactions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />Zugeordnete Transaktionen ({matchedTransactions.length})
                            </h4>
                            <Table>
                              <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Name</TableHead><TableHead>Verwendungszweck</TableHead><TableHead className="text-right">Betrag</TableHead><TableHead>Status</TableHead><TableHead>Aktionen</TableHead></TableRow></TableHeader>
                              <TableBody>{matchedTransactions.map(renderTransactionRow)}</TableBody>
                            </Table>
                          </div>
                        )}
                        {unmatchedTransactions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
                              <FileQuestion className="h-4 w-4 text-yellow-600" />Unbekannte Transaktionen ({unmatchedTransactions.length})
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">Diese Transaktionen konnten keiner Rechnung oder Vorlage zugeordnet werden.</p>
                            <Table>
                              <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Name</TableHead><TableHead>Verwendungszweck</TableHead><TableHead className="text-right">Betrag</TableHead><TableHead>Status</TableHead><TableHead>Aktionen</TableHead></TableRow></TableHeader>
                              <TableBody>{unmatchedTransactions.map(renderTransactionRow)}</TableBody>
                            </Table>
                          </div>
                        )}
                        {ignoredTransactions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-muted-foreground mt-4 mb-2 flex items-center gap-2">
                              <EyeOff className="h-4 w-4" />Ignorierte Transaktionen ({ignoredTransactions.length})
                            </h4>
                            <Table>
                              <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Name</TableHead><TableHead>Verwendungszweck</TableHead><TableHead className="text-right">Betrag</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                              <TableBody>{ignoredTransactions.map(renderTransactionRow)}</TableBody>
                            </Table>
                          </div>
                        )}
                        {transactions.length === 0 && <p className="text-center text-muted-foreground py-8">Keine Transaktionen</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionDetailSheet transactionId={selectedTransaction} onClose={() => setSelectedTransaction(null)} />

      <Dialog open={!!manualAssignTxn} onOpenChange={() => setManualAssignTxn(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Transaktion manuell zuordnen</DialogTitle></DialogHeader>
          {manualAssignTxn && (
            <div className="space-y-4">
              {/* Transaction details */}
              <div className="bg-muted p-3 rounded-md text-sm space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-base">
                    {manualAssignTxn.amount < 0 ? "" : "+"}{Number(manualAssignTxn.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                  </span>
                  <span className="text-xs text-muted-foreground">{format(new Date(manualAssignTxn.booking_date), "dd.MM.yyyy")}</span>
                </div>
                <p className="text-sm font-medium">{(manualAssignTxn.amount < 0 ? manualAssignTxn.creditor_name : manualAssignTxn.debtor_name) || "–"}</p>
                <p className="text-xs text-muted-foreground font-mono">{(manualAssignTxn.amount < 0 ? manualAssignTxn.creditor_iban : manualAssignTxn.debtor_iban) || "–"}</p>
                <p className="text-xs text-muted-foreground">{manualAssignTxn.purpose || "Kein Verwendungszweck"}</p>
              </div>
              <div>
                <Label>Zuordnungstyp</Label>
                <Select value={manualAssignType} onValueChange={(v: "invoice" | "template") => { setManualAssignType(v); setManualAssignId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Rechnung</SelectItem>
                    <SelectItem value="template">Vorlage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {manualAssignType === "invoice" && (
                <div className="flex items-center gap-2">
                  <Switch checked={showMatchedInvoices} onCheckedChange={setShowMatchedInvoices} id="show-matched" />
                  <Label htmlFor="show-matched" className="text-xs text-muted-foreground cursor-pointer">
                    Bereits zugeordnete Rechnungen anzeigen
                  </Label>
                </div>
              )}
              <div>
                <Label>{manualAssignType === "invoice" ? "Rechnung" : "Vorlage"}</Label>
                <Select value={manualAssignId} onValueChange={setManualAssignId}>
                  <SelectTrigger><SelectValue placeholder="Auswählen..." /></SelectTrigger>
                  <SelectContent>
                    {manualAssignType === "invoice" ? (
                      invoicesList.map((inv: any) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {inv.invoice_number || "–"} | {inv.vendor_name || "–"} | {inv.gross_amount ? `${Number(inv.gross_amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {inv.vendor_iban || "Keine IBAN"} {inv.invoice_date ? `• ${format(new Date(inv.invoice_date), "dd.MM.yyyy")}` : ""}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      templatesList.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex flex-col">
                            <span className="text-sm">{t.name} {t.expected_amount ? `| ${Number(t.expected_amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : ""}</span>
                            <span className="text-xs text-muted-foreground">
                              {t.vendor_name || "–"} {t.vendor_iban ? `• ${t.vendor_iban}` : ""}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualAssignTxn(null)}>Abbrechen</Button>
            <Button onClick={handleManualAssign} disabled={!manualAssignId}>Zuordnen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
