import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import { CreditCard, AlertTriangle, Play, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TransferReviewMode } from "@/components/transfers/TransferReviewMode";
import { InvoiceDropZone } from "@/components/finance/InvoiceDropZone";

export function Transfers() {
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewInvoices, setReviewInvoices] = useState<any[]>([]);
  const [showPaid, setShowPaid] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list"],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name, building_code").order("name");
      return data || [];
    },
  });

  const { data: invoices = [], refetch } = useQuery({
    queryKey: ["transfer-invoices", buildingFilter, showPaid],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, buildings(name, building_code)")
        .order("due_date", { ascending: true, nullsFirst: false });

      if (!showPaid) {
        query = query.neq("status", "paid");
      }

      if (buildingFilter !== "all") {
        query = query.eq("building_id", buildingFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const unpaidInvoices = useMemo(() => invoices.filter(i => i.status !== "paid"), [invoices]);

  const formatCurrency = (val: number | null) => {
    if (val == null) return "–";
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return isPast(new Date(dueDate)) && !isToday(new Date(dueDate));
  };

  const getPurpose = (inv: any) => {
    if (inv.payment_purpose) return inv.payment_purpose;
    // Fallback until AI generates it
    const parts: string[] = [];
    if (inv.invoice_number) parts.push(`Re. Nr. ${inv.invoice_number}`);
    if (inv.description) {
      const short = inv.description.split(/\s+/).slice(0, 3).join(" ");
      parts.push(short);
    }
    return parts.join(", ") || "–";
  };

  const openReviewForInvoice = (inv: any) => {
    // For paid invoices, open single-invoice review (read-only)
    // For unpaid, open in the unpaid list context
    const isPaid = inv.status === "paid";
    if (isPaid) {
      setReviewInvoices([inv]);
      setReviewIndex(0);
    } else {
      setReviewInvoices(unpaidInvoices);
      const idx = unpaidInvoices.findIndex(u => u.id === inv.id);
      setReviewIndex(idx >= 0 ? idx : 0);
    }
    setReviewMode(true);
  };

  if (reviewMode && reviewInvoices.length > 0) {
    return (
      <TransferReviewMode
        invoices={reviewInvoices}
        initialIndex={reviewIndex}
        onClose={() => { setReviewMode(false); refetch(); }}
        onRefetch={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            Überweisungen
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unpaidInvoices.length} offene Rechnung{unpaidInvoices.length !== 1 ? "en" : ""} zur Zahlung
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={showPaid} onCheckedChange={setShowPaid} id="show-paid" />
            <label htmlFor="show-paid" className="text-sm text-muted-foreground cursor-pointer">
              Bezahlte anzeigen
            </label>
          </div>
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Alle Gebäude" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gebäude</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.building_code} – {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {unpaidInvoices.length > 0 && (
            <Button onClick={() => { setReviewInvoices(unpaidInvoices); setReviewIndex(0); setReviewMode(true); }}>
              <Play className="h-4 w-4 mr-2" />
              Prüfmodus starten
            </Button>
          )}
        </div>
      </div>

      <InvoiceDropZone buildings={buildings} />

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fällig am</TableHead>
              <TableHead>Lieferant</TableHead>
              <TableHead>Verwendungszweck</TableHead>
              <TableHead>IBAN</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Liegenschaft</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {showPaid ? "Keine Rechnungen vorhanden" : "Keine offenen Rechnungen vorhanden"}
                </TableCell>
              </TableRow>
            )}
            {invoices.map((inv) => {
              const overdue = inv.status !== "paid" && isOverdue(inv.due_date);
              const isPaid = inv.status === "paid";
              const hasNote = !!(inv as any).payment_notes;
              return (
                <>
                  <TableRow
                    key={inv.id}
                    className={`cursor-pointer hover:bg-muted/50 ${overdue ? "bg-destructive/5" : ""} ${isPaid ? "opacity-60" : ""}`}
                    onClick={() => openReviewForInvoice(inv)}
                  >
                    <TableCell className={overdue ? "text-destructive font-medium" : ""}>
                      <div className="flex items-center gap-1.5">
                        {overdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                        {inv.due_date ? format(new Date(inv.due_date), "dd.MM.yyyy") : "–"}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{inv.vendor_name || "–"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{getPurpose(inv)}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.vendor_iban || "–"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(inv.gross_amount)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(inv as any).buildings?.name || "–"}
                    </TableCell>
                    <TableCell>
                      {isPaid ? (
                        <Badge variant="secondary" className="text-xs">Bezahlt</Badge>
                      ) : inv.review_status === "verified" ? (
                        <Badge variant="default" className="text-xs">Geprüft</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Offen</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  {hasNote && (
                    <TableRow key={`${inv.id}-note`} className={`border-b-0 ${isPaid ? "opacity-60" : ""}`}>
                      <TableCell colSpan={7} className="pt-0 pb-2 pl-8">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <StickyNote className="h-3 w-3 text-primary" />
                          {(inv as any).payment_notes}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
