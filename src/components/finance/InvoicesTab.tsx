import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, CheckCircle, CreditCard, BookOpen } from "lucide-react";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: any }> = {
  open: { label: "Offen", variant: "destructive", icon: FileText },
  verified: { label: "Geprüft", variant: "outline", icon: CheckCircle },
  paid: { label: "Bezahlt", variant: "secondary", icon: CreditCard },
  booked: { label: "Gebucht", variant: "default", icon: BookOpen },
};

export function InvoicesTab() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterBuilding, setFilterBuilding] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", filterBuilding, filterStatus],
    queryFn: async () => {
      let query = supabase.from("invoices").select("*, buildings(name, building_code)").order("created_at", { ascending: false });
      if (filterBuilding !== "all") query = query.eq("building_id", filterBuilding);
      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <CardTitle className="text-lg">Rechnungen</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterBuilding} onValueChange={setFilterBuilding}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="Alle Liegenschaften" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Liegenschaften</SelectItem>
              {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue placeholder="Alle Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Rechnung anlegen
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground text-sm p-4">Laden...</div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Noch keine Rechnungen vorhanden</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Re.-Nr.</TableHead>
                <TableHead>Lieferant</TableHead>
                <TableHead>Liegenschaft</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv: any) => {
                const status = STATUS_CONFIG[inv.status] || STATUS_CONFIG.open;
                const nextStatus = getNextStatus(inv.status);
                return (
                  <TableRow key={inv.id}>
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
                      {nextStatus && (
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
        )}
      </CardContent>
      <CreateInvoiceDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} buildings={buildings} />
    </Card>
  );
}
