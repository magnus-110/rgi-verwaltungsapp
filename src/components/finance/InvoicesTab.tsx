import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Loader2, ChevronLeft, ChevronRight, Sparkles, FileCode, RefreshCw, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Download } from "lucide-react";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { InvoiceDropZone } from "./InvoiceDropZone";
import { InvoiceDetailSheet } from "./InvoiceDetailSheet";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import JSZip from "jszip";

const PAGE_SIZE = 25;


const OCR_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Wartend", className: "text-muted-foreground" },
  processing: { label: "Wird analysiert...", className: "text-primary" },
  done: { label: "Extrahiert", className: "text-green-600" },
  error: { label: "Fehler", className: "text-destructive" },
};

interface InvoicesTabProps {
  sharedBuildingId?: string | null;
  onBuildingChange?: (id: string | null) => void;
}

export function InvoicesTab({ sharedBuildingId, onBuildingChange }: InvoicesTabProps) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [internalFilterBuilding, setInternalFilterBuilding] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  // 'all' | 'expense' (echte Eingangsrechnungen) | 'income' (Belege für Zahlungseingang)
  const [filterDirection, setFilterDirection] = useState<"all" | "expense" | "income">("all");

  // Use shared building if provided, otherwise use internal filter
  const filterBuilding = sharedBuildingId ? sharedBuildingId : internalFilterBuilding;
  const [page, setPage] = useState(0);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sanitizeFilename = (s: string) =>
    (s || "")
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 80);

  const exportZip = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const { data: rows, error } = await supabase
        .from("invoices")
        .select("id, file_path, file_name, invoice_number, invoice_date, vendor_name")
        .in("id", Array.from(selectedIds));
      if (error) throw error;
      if (!rows || rows.length === 0) {
        toast.error("Keine Rechnungen gefunden");
        return;
      }

      const zip = new JSZip();
      const usedNames = new Set<string>();
      let ok = 0;
      let fail = 0;

      for (const r of rows as any[]) {
        if (!r.file_path) { fail++; continue; }
        try {
          const { data: blob, error: dlErr } = await supabase.storage
            .from("invoices")
            .download(r.file_path);
          if (dlErr || !blob) { fail++; continue; }

          const datePart = r.invoice_date
            ? format(new Date(r.invoice_date), "yyyyMMdd")
            : "ohne-datum";
          const vendorPart = sanitizeFilename(r.vendor_name || "Lieferant");
          const nrPart = sanitizeFilename(r.invoice_number || r.id.slice(0, 8));
          const ext = (r.file_name?.split(".").pop() || "pdf").toLowerCase();
          let base = `${datePart}_${vendorPart}_${nrPart}`;
          let name = `${base}.${ext}`;
          let i = 2;
          while (usedNames.has(name)) {
            name = `${base}_${i}.${ext}`;
            i++;
          }
          usedNames.add(name);
          zip.file(name, blob);
          ok++;
        } catch {
          fail++;
        }
      }

      if (ok === 0) {
        toast.error("Keine Belege konnten geladen werden");
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rechnungen_${format(new Date(), "yyyyMMdd_HHmm")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`ZIP mit ${ok} Beleg${ok === 1 ? "" : "en"} heruntergeladen${fail ? ` (${fail} fehlgeschlagen)` : ""}`);
      setSelectedIds(new Set());
    } catch (e: any) {
      toast.error(`Export fehlgeschlagen: ${e?.message || "Unbekannt"}`);
    } finally {
      setExporting(false);
    }
  };


  // Count of stuck OCR jobs (error / pending) — drives the bulk-retry button
  const { data: stuckCount = 0 } = useQuery({
    queryKey: ["invoices-stuck-ocr-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .in("ocr_status", ["error", "pending"]);
      if (error) return 0;
      return count || 0;
    },
    refetchInterval: 15000,
  });

  const retryOcr = async (invoiceId: string) => {
    setRetryingId(invoiceId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke("extract-invoice", {
        body: { invoiceId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      toast.success("OCR neu gestartet");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-stuck-ocr-count"] });
    } catch (e: any) {
      toast.error(`OCR-Fehler: ${e?.message || "Unbekannt"}`);
    } finally {
      setRetryingId(null);
    }
  };

  const retryAllStuck = async () => {
    setBulkRetrying(true);
    try {
      const { data: stuck, error } = await supabase
        .from("invoices")
        .select("id")
        .in("ocr_status", ["error", "pending"])
        .limit(100);
      if (error) throw error;
      if (!stuck || stuck.length === 0) {
        toast.info("Keine ausstehenden OCR-Jobs");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      // Sequentiell mit kleiner Pause, um Mistral-Ratelimit zu schonen
      let ok = 0;
      let fail = 0;
      for (const row of stuck) {
        try {
          const { error: invErr } = await supabase.functions.invoke("extract-invoice", {
            body: { invoiceId: row.id },
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
          if (invErr) fail++; else ok++;
        } catch { fail++; }
        await new Promise(r => setTimeout(r, 600));
      }
      toast.success(`OCR neu gestartet: ${ok} erfolgreich${fail ? `, ${fail} fehlgeschlagen` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-stuck-ocr-count"] });
    } catch (e: any) {
      toast.error(`Bulk-OCR fehlgeschlagen: ${e?.message || "Unbekannt"}`);
    } finally {
      setBulkRetrying(false);
    }
  };

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["invoices", filterBuilding, filterStatus, filterDirection, page],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, buildings(name, building_code)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1) as any;

      if (filterBuilding === "unassigned") {
        query = query.is("building_id", null);
      } else if (filterBuilding !== "all") {
        query = query.eq("building_id", filterBuilding);
      }
      // Direction filter (Einnahme vs Ausgabe)
      if (filterDirection === "income") {
        query = query.eq("invoice_type", "credit_note");
      } else if (filterDirection === "expense") {
        query = query.neq("invoice_type", "credit_note");
      }
      if (filterStatus === "paid") query = query.eq("status", "paid");
      else if (filterStatus === "unpaid") query = query.eq("status", "open");
      else if (filterStatus === "verified") query = query.eq("review_status", "verified");
      else if (filterStatus === "unverified") query = query.eq("review_status", "open");

      const { data, error, count } = await query;
      if (error) throw error;
      return { invoices: data || [], totalCount: count || 0 };
    },
    refetchInterval: 10000,
  });

  // Mini-Dashboard: offene Beträge (Ausgaben rot vs Einnahmen grün)
  const { data: summary } = useQuery({
    queryKey: ["invoices-summary", filterBuilding],
    queryFn: async () => {
      let qOpenExpense = supabase
        .from("invoices")
        .select("gross_amount")
        .eq("status", "open")
        .neq("invoice_type", "credit_note");
      let qOpenIncome = supabase
        .from("invoices")
        .select("gross_amount")
        .eq("status", "credit_open")
        .eq("invoice_type", "credit_note");
      if (filterBuilding === "unassigned") {
        qOpenExpense = qOpenExpense.is("building_id", null);
        qOpenIncome = qOpenIncome.is("building_id", null);
      } else if (filterBuilding !== "all") {
        qOpenExpense = qOpenExpense.eq("building_id", filterBuilding);
        qOpenIncome = qOpenIncome.eq("building_id", filterBuilding);
      }
      const [{ data: exp }, { data: inc }] = await Promise.all([qOpenExpense, qOpenIncome]);
      const sum = (rows: any[] | null) =>
        (rows || []).reduce((a, r) => a + (Number(r.gross_amount) || 0), 0);
      return { openExpense: sum(exp), openIncome: sum(inc) };
    },
    refetchInterval: 15000,
  });

  const invoices = invoiceData?.invoices || [];
  const totalCount = invoiceData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const formatCurrency = (amount: number | null) =>
    amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

  const handleFilterBuilding = (v: string) => {
    setInternalFilterBuilding(v);
    if (v !== "all" && v !== "unassigned") {
      onBuildingChange?.(v);
    }
    setPage(0);
  };
  const handleFilterStatus = (v: string) => { setFilterStatus(v); setPage(0); };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Rechnungen hochladen</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceDropZone buildings={buildings} />
        </CardContent>
      </Card>

      {/* Mini-Dashboard: Offene Beträge in beide Richtungen */}
      {summary && (summary.openExpense > 0 || summary.openIncome > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="border-destructive/30">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4 text-destructive" />
                <span className="text-sm text-muted-foreground">Offene Ausgaben</span>
              </div>
              <span className="text-lg font-semibold text-destructive">
                {formatCurrency(summary.openExpense)}
              </span>
            </CardContent>
          </Card>
          <Card className="border-success/30">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="h-4 w-4 text-success" />
                <span className="text-sm text-muted-foreground">Offene Einnahmen</span>
              </div>
              <span className="text-lg font-semibold text-success">
                {formatCurrency(summary.openIncome)}
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg">Rechnungen</CardTitle>
            {totalCount > 0 && (
              <Badge variant="secondary" className="text-xs">{totalCount}</Badge>
            )}
            {/* Direction-Filter-Chips */}
            <div className="flex items-center gap-1 ml-2">
              <Button
                size="sm"
                variant={filterDirection === "all" ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => { setFilterDirection("all"); setPage(0); }}
              >
                Alle
              </Button>
              <Button
                size="sm"
                variant={filterDirection === "expense" ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => { setFilterDirection("expense"); setPage(0); }}
              >
                <ArrowUpFromLine className="h-3 w-3 mr-1" />
                Ausgaben
              </Button>
              <Button
                size="sm"
                variant={filterDirection === "income" ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => { setFilterDirection("income"); setPage(0); }}
              >
                <ArrowDownToLine className="h-3 w-3 mr-1" />
                Einnahmen
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!sharedBuildingId && (
              <Select value={internalFilterBuilding} onValueChange={handleFilterBuilding}>
                <SelectTrigger className="w-48 h-9 text-sm">
                  <SelectValue placeholder="Alle Liegenschaften" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Liegenschaften</SelectItem>
                  <SelectItem value="unassigned">⚠ Nicht zugeordnet</SelectItem>
                  {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={filterStatus} onValueChange={handleFilterStatus}>
              <SelectTrigger className="w-40 h-9 text-sm">
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="unpaid">💳 Unbezahlt</SelectItem>
                <SelectItem value="paid">✅ Bezahlt</SelectItem>
                <SelectItem value="unverified">🔍 Ungeprüft</SelectItem>
                <SelectItem value="verified">✓ Geprüft</SelectItem>
              </SelectContent>
            </Select>
            {stuckCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={retryAllStuck}
                disabled={bulkRetrying}
                className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                {bulkRetrying ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                {stuckCount} OCR neu starten
              </Button>
            )}
            {selectedIds.size > 0 && (
              <Button size="sm" variant="outline" onClick={exportZip} disabled={exporting}>
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                ZIP export ({selectedIds.size})
              </Button>
            )}
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Manuell anlegen
            </Button>

          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Laden...
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Noch keine Rechnungen vorhanden</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={invoices.length > 0 && invoices.every((i: any) => selectedIds.has(i.id))}
                        onCheckedChange={(checked) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (checked) invoices.forEach((i: any) => next.add(i.id));
                            else invoices.forEach((i: any) => next.delete(i.id));
                            return next;
                          });
                        }}
                        aria-label="Alle auswählen"
                      />
                    </TableHead>
                    <TableHead>Re.-Nr.</TableHead>
                    <TableHead>Lieferant</TableHead>
                    <TableHead>Liegenschaft</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead>Bezahlung</TableHead>
                    <TableHead>Prüfung</TableHead>
                    <TableHead className="w-[60px]">OCR</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {invoices.map((inv: any) => {
                    const isCredit = inv.invoice_type === "credit_note";
                    const isPaid = inv.status === "paid";
                    const isCreditMatched = inv.status === "credit_matched";
                    const isVerified = (inv.review_status || "open") === "verified";

                    const togglePayment = async (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (isCredit) return; // Belege werden über Bank-Match abgewickelt
                      const newStatus = isPaid ? "open" : "paid";
                      const updates: any = { status: newStatus };
                      if (newStatus === "paid") updates.paid_at = new Date().toISOString();
                      else updates.paid_at = null;
                      const { error } = await supabase.from("invoices").update(updates).eq("id", inv.id);
                      if (error) { toast.error("Fehler"); return; }
                      toast.success(newStatus === "paid" ? "Als bezahlt markiert" : "Als offen markiert");
                      queryClient.invalidateQueries({ queryKey: ["invoices"] });
                    };

                    return (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedInvoiceId(inv.id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(inv.id)}
                            onCheckedChange={() => toggleSelected(inv.id)}
                            aria-label="Rechnung auswählen"
                          />
                        </TableCell>

                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            {isCredit && (
                              <ArrowDownToLine className="h-3.5 w-3.5 text-success shrink-0" aria-label="Beleg für Zahlungseingang" />
                            )}
                            {inv.invoice_number || "–"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            {inv.einvoice_format && (
                              <FileCode
                                className="h-3.5 w-3.5 text-success shrink-0"
                                aria-label={`E-Rechnung (${inv.einvoice_format})`}
                              />
                            )}
                            {inv.vendor_name || "–"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.buildings?.name || (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                              Zuweisen
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.invoice_date ? format(new Date(inv.invoice_date), "dd.MM.yyyy", { locale: de }) : "–"}
                        </TableCell>
                        <TableCell className={`text-right font-medium text-sm ${isCredit ? "text-success" : ""}`}>
                          {isCredit && inv.gross_amount ? "+" : ""}{formatCurrency(inv.gross_amount)}
                        </TableCell>
                        <TableCell>
                          {isCredit ? (
                            <Badge
                              variant="outline"
                              className={
                                isCreditMatched
                                  ? "bg-green-600 text-white text-xs border-green-700"
                                  : "text-xs text-success border-success/40"
                              }
                            >
                              {isCreditMatched ? "Verbucht" : "Beleg offen"}
                            </Badge>
                          ) : (
                            <Badge
                              variant={isPaid ? "default" : "destructive"}
                              className={`cursor-pointer ${isPaid ? "bg-green-600 text-white text-xs hover:bg-green-700" : "text-xs hover:bg-destructive/80"}`}
                              onClick={togglePayment}
                            >
                              {isPaid ? "Bezahlt" : "Offen"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isVerified ? "default" : "outline"}
                            className={isVerified ? "bg-blue-600 text-white text-xs" : "text-xs"}
                          >
                            {isVerified ? "Geprüft" : "Offen"}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {inv.ocr_status === "processing" && (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="OCR läuft" />
                          )}
                          {(inv.ocr_status === "error" || inv.ocr_status === "pending") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                              disabled={retryingId === inv.id}
                              onClick={() => retryOcr(inv.id)}
                              aria-label="OCR neu starten"
                              title={inv.ocr_error || "OCR neu starten"}
                            >
                              {retryingId === inv.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </>
                              )}
                            </Button>
                          )}
                          {inv.ocr_status === "done" && (
                            <Sparkles className="h-3.5 w-3.5 text-green-600" aria-label="OCR erfolgreich" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2">
                  <p className="text-sm text-muted-foreground">
                    Seite {page + 1} von {totalPages} ({totalCount} Rechnungen)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CreateInvoiceDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} buildings={buildings} />
      <InvoiceDetailSheet invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} buildings={buildings} />
    </div>
  );
}
