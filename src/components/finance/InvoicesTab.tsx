import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, CheckCircle, CreditCard, BookOpen, Loader2, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { InvoiceDropZone } from "./InvoiceDropZone";
import { InvoiceDetailSheet } from "./InvoiceDetailSheet";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PAGE_SIZE = 25;

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: any }> = {
  open: { label: "Offen", variant: "destructive", icon: FileText },
  verified: { label: "Geprüft", variant: "outline", icon: CheckCircle },
  paid: { label: "Bezahlt", variant: "secondary", icon: CreditCard },
  booked: { label: "Gebucht", variant: "default", icon: BookOpen },
};

const OCR_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Wartend", className: "text-muted-foreground" },
  processing: { label: "Wird analysiert...", className: "text-primary" },
  done: { label: "Extrahiert", className: "text-green-600" },
  error: { label: "Fehler", className: "text-destructive" },
};

export function InvoicesTab() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterBuilding, setFilterBuilding] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Paginated query with count
  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["invoices", filterBuilding, filterStatus, page],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, buildings(name, building_code)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterBuilding === "unassigned") {
        query = query.is("building_id", null);
      } else if (filterBuilding !== "all") {
        query = query.eq("building_id", filterBuilding);
      }
      if (filterStatus !== "all") query = query.eq("status", filterStatus);

      const { data, error, count } = await query;
      if (error) throw error;
      return { invoices: data || [], totalCount: count || 0 };
    },
    // Refetch every 10s to pick up OCR status changes
    refetchInterval: 10000,
  });

  const invoices = invoiceData?.invoices || [];
  const totalCount = invoiceData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const updateStatus = async (id: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "paid") updates.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(updates).eq("id", id);
    if (error) { toast.error("Fehler beim Aktualisieren"); return; }
    toast.success(`Status auf "${STATUS_CONFIG[newStatus]?.label}" geändert`);
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const getNextStatus = (current: string): string | null => {
    const flow = ["open", "verified", "paid", "booked"];
    const idx = flow.indexOf(current);
    return idx < flow.length - 1 ? flow[idx + 1] : null;
  };

  const formatCurrency = (amount: number | null) =>
    amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

  // Reset page on filter change
  const handleFilterBuilding = (v: string) => { setFilterBuilding(v); setPage(0); };
  const handleFilterStatus = (v: string) => { setFilterStatus(v); setPage(0); };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Rechnungen hochladen</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceDropZone buildings={buildings} />
        </CardContent>
      </Card>

      {/* Invoice List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Rechnungen</CardTitle>
            {totalCount > 0 && (
              <Badge variant="secondary" className="text-xs">{totalCount}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterBuilding} onValueChange={handleFilterBuilding}>
              <SelectTrigger className="w-48 h-9 text-sm">
                <SelectValue placeholder="Alle Liegenschaften" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Liegenschaften</SelectItem>
                <SelectItem value="unassigned">⚠ Nicht zugeordnet</SelectItem>
                {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={handleFilterStatus}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
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
                    <TableHead>Re.-Nr.</TableHead>
                    <TableHead>Lieferant</TableHead>
                    <TableHead>Liegenschaft</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>OCR</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => {
                    const status = STATUS_CONFIG[inv.status] || STATUS_CONFIG.open;
                    const ocrStatus = OCR_STATUS[inv.ocr_status] || OCR_STATUS.pending;
                    const nextStatus = getNextStatus(inv.status);
                    return (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedInvoiceId(inv.id)}
                      >
                        <TableCell className="font-mono text-xs">{inv.invoice_number || "–"}</TableCell>
                        <TableCell className="text-sm">{inv.vendor_name || "–"}</TableCell>
                        <TableCell className="text-sm">{inv.buildings?.name || "–"}</TableCell>
                        <TableCell className="text-sm">
                          {inv.invoice_date ? format(new Date(inv.invoice_date), "dd.MM.yyyy", { locale: de }) : "–"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">{formatCurrency(inv.gross_amount)}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs flex items-center gap-1 ${ocrStatus.className}`}>
                            {inv.ocr_status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
                            {inv.ocr_status === "done" && <Sparkles className="h-3 w-3" />}
                            {ocrStatus.label}
                          </span>
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          {nextStatus && inv.status !== "paid" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => updateStatus(inv.id, nextStatus)}>
                              → {STATUS_CONFIG[nextStatus]?.label}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2">
                  <p className="text-sm text-muted-foreground">
                    Seite {page + 1} von {totalPages} ({totalCount} Rechnungen)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                    >
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
