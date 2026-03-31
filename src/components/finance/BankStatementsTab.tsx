import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Upload, Loader2, CheckCircle2, FileQuestion, LayoutTemplate, EyeOff, Building2, BookOpen, Link2 } from "lucide-react";
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
  const [showMatchedInvoices, setShowMatchedInvoices] = useState(false);

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
        .select("*")
        .eq("building_id", selectedBuilding)
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuilding,
  });

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
        .select("id, name, vendor_name, vendor_iban, expected_amount")
        .eq("building_id", selectedBuilding)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuilding,
  });

  // Categorize transactions
  const matchedTransactions = useMemo(() =>
    allBuildingTxns.filter((t: any) => ["matched_invoice", "matched_template", "manually_matched"].includes(t.match_status) && !t.booked_at),
    [allBuildingTxns]
  );
  const unmatchedTransactions = useMemo(() =>
    allBuildingTxns.filter((t: any) => t.match_status === "unmatched"),
    [allBuildingTxns]
  );
  const ignoredTransactions = useMemo(() =>
    allBuildingTxns.filter((t: any) => t.match_status === "ignored"),
    [allBuildingTxns]
  );
  const bookedTransactions = useMemo(() =>
    allBuildingTxns.filter((t: any) => t.booked_at),
    [allBuildingTxns]
  );

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

  const transactionTableHeader = (
    <TableHeader>
      <TableRow>
        <TableHead>Datum</TableHead>
        <TableHead>Name</TableHead>
        <TableHead>Verwendungszweck</TableHead>
        <TableHead className="text-right">Betrag</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Aktionen</TableHead>
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
              {globalBookableCount > 0 && (
                <Button variant="default" disabled={bookingAll} onClick={handleBookAll}>
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
              {/* Summary badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{allBuildingTxns.length} Transaktionen gesamt</Badge>
                {unmatchedTransactions.length > 0 && <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950">{unmatchedTransactions.length} offen</Badge>}
                {matchedTransactions.length > 0 && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">{matchedTransactions.length} zugeordnet</Badge>}
                {bookedTransactions.length > 0 && <Badge variant="outline" className="text-xs">{bookedTransactions.length} gebucht</Badge>}
                {ignoredTransactions.length > 0 && <Badge variant="outline" className="text-xs">{ignoredTransactions.length} ignoriert</Badge>}
              </div>

              {/* Unmatched transactions */}
              {unmatchedTransactions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-yellow-600" />Offene Transaktionen ({unmatchedTransactions.length})
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">Diese Transaktionen konnten keiner Rechnung oder Vorlage zugeordnet werden.</p>
                  <Table>
                    {transactionTableHeader}
                    <TableBody>{unmatchedTransactions.map(renderTransactionRow)}</TableBody>
                  </Table>
                </div>
              )}

              {/* Matched (not yet booked) transactions */}
              {matchedTransactions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />Zugeordnete Transaktionen ({matchedTransactions.length})
                  </h4>
                  <Table>
                    {transactionTableHeader}
                    <TableBody>{matchedTransactions.map(renderTransactionRow)}</TableBody>
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
                  <div className="flex items-center gap-2 mb-2">
                    <Switch checked={showBooked} onCheckedChange={setShowBooked} id="show-booked" />
                    <Label htmlFor="show-booked" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />Gebuchte Transaktionen ({bookedTransactions.length})
                    </Label>
                  </div>
                  {showBooked && (
                    <Table>
                      {transactionTableHeader}
                      <TableBody>{bookedTransactions.map(renderTransactionRow)}</TableBody>
                    </Table>
                  )}
                </div>
              )}
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
