import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import { de } from "date-fns/locale";
import { CreditCard, AlertTriangle, Play, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TransferReviewMode } from "@/components/transfers/TransferReviewMode";

export function Transfers() {
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list"],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name, building_code").order("name");
      return data || [];
    },
  });

  const { data: invoices = [], refetch } = useQuery({
    queryKey: ["transfer-invoices", buildingFilter],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, buildings(name, building_code)")
        .neq("status", "paid")
        .order("due_date", { ascending: true, nullsFirst: false });

      if (buildingFilter !== "all") {
        query = query.eq("building_id", buildingFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const formatCurrency = (val: number | null) => {
    if (val == null) return "–";
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return isPast(new Date(dueDate)) && !isToday(new Date(dueDate));
  };

  const handleSaveNote = async (invoiceId: string) => {
    const { error } = await supabase
      .from("invoices")
      .update({ payment_notes: noteText } as any)
      .eq("id", invoiceId);
    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      toast.success("Notiz gespeichert");
      refetch();
    }
    setEditingNote(null);
  };

  if (reviewMode && invoices.length > 0) {
    return (
      <TransferReviewMode
        invoices={invoices}
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
            {invoices.length} offene Rechnung{invoices.length !== 1 ? "en" : ""} zur Zahlung
          </p>
        </div>
        <div className="flex items-center gap-3">
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
          {invoices.length > 0 && (
            <Button onClick={() => { setReviewIndex(0); setReviewMode(true); }}>
              <Play className="h-4 w-4 mr-2" />
              Prüfmodus starten
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fällig am</TableHead>
              <TableHead>Lieferant</TableHead>
              <TableHead>Re.-Nr.</TableHead>
              <TableHead>IBAN</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Liegenschaft</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Keine offenen Rechnungen vorhanden
                </TableCell>
              </TableRow>
            )}
            {invoices.map((inv, idx) => {
              const overdue = isOverdue(inv.due_date);
              return (
                <TableRow
                  key={inv.id}
                  className={`cursor-pointer hover:bg-muted/50 ${overdue ? "bg-destructive/5" : ""}`}
                  onClick={() => { setReviewIndex(idx); setReviewMode(true); }}
                >
                  <TableCell className={overdue ? "text-destructive font-medium" : ""}>
                    <div className="flex items-center gap-1.5">
                      {overdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                      {inv.due_date ? format(new Date(inv.due_date), "dd.MM.yyyy") : "–"}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{inv.vendor_name || "–"}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.invoice_number || "–"}</TableCell>
                  <TableCell className="font-mono text-xs">{inv.vendor_iban || "–"}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(inv.gross_amount)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {(inv as any).buildings?.building_code || "–"}
                  </TableCell>
                  <TableCell>
                    {inv.review_status === "verified" ? (
                      <Badge variant="default" className="text-xs">Geprüft</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Offen</Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Popover
                      open={editingNote === inv.id}
                      onOpenChange={(open) => {
                        if (open) {
                          setEditingNote(inv.id);
                          setNoteText((inv as any).payment_notes || "");
                        } else {
                          setEditingNote(null);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <StickyNote className={`h-3.5 w-3.5 ${(inv as any).payment_notes ? "text-primary" : "text-muted-foreground"}`} />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64" align="end">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Notiz</p>
                          <Textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Zahlungsnotiz..."
                            rows={3}
                          />
                          <Button size="sm" className="w-full" onClick={() => handleSaveNote(inv.id)}>
                            Speichern
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
