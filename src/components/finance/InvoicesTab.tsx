import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Loader2, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { InvoiceDropZone } from "./InvoiceDropZone";
import { InvoiceDetailSheet } from "./InvoiceDetailSheet";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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

  // Use shared building if provided, otherwise use internal filter
  const filterBuilding = sharedBuildingId ? sharedBuildingId : internalFilterBuilding;
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

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["invoices", filterBuilding, filterStatus, page],
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Rechnungen</CardTitle>
            {totalCount > 0 && (
              <Badge variant="secondary" className="text-xs">{totalCount}</Badge>
            )}
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
                    <TableHead>Bezahlung</TableHead>
                    <TableHead>Prüfung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => {
                    const isPaid = inv.status === "paid";
                    const isVerified = (inv.review_status || "open") === "verified";

                    const togglePayment = async (e: React.MouseEvent) => {
                      e.stopPropagation();
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
                        <TableCell className="font-mono text-xs">{inv.invoice_number || "–"}</TableCell>
                        <TableCell className="text-sm">{inv.vendor_name || "–"}</TableCell>
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
                        <TableCell className="text-right font-medium text-sm">{formatCurrency(inv.gross_amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={isPaid ? "default" : "destructive"}
                            className={`cursor-pointer ${isPaid ? "bg-green-600 text-white text-xs hover:bg-green-700" : "text-xs hover:bg-destructive/80"}`}
                            onClick={togglePayment}
                          >
                            {isPaid ? "Bezahlt" : "Offen"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isVerified ? "default" : "outline"}
                            className={isVerified ? "bg-blue-600 text-white text-xs" : "text-xs"}
                          >
                            {isVerified ? "Geprüft" : "Offen"}
                          </Badge>
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
