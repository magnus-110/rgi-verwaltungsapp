import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckCircle, BookOpen } from "lucide-react";
import { CreateBookingDialog } from "./CreateBookingDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

export function BookingsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterBuilding, setFilterBuilding] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["bookings", filterBuilding, filterYear],
    queryFn: async () => {
      let query = supabase.from("bookings")
        .select("*, buildings(name, building_code), chart_of_accounts(account_number, account_name)")
        .eq("fiscal_year", parseInt(filterYear))
        .order("booking_date", { ascending: false });
      if (filterBuilding !== "all") query = query.eq("building_id", filterBuilding);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const confirmBooking = async (id: string) => {
    const { error } = await supabase.from("bookings").update({
      status: "confirmed",
      confirmed_by: user?.id,
      confirmed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error("Fehler beim Bestätigen"); return; }
    toast.success("Buchung bestätigt");
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const formatCurrency = (amount: number | null) =>
    amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <CardTitle className="text-lg">Buchungen</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-28 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBuilding} onValueChange={setFilterBuilding}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="Alle Liegenschaften" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Liegenschaften</SelectItem>
              {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Manuelle Buchung
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground text-sm p-4">Laden...</div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Noch keine Buchungen vorhanden</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Konto</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead>Liegenschaft</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead>Quelle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b: any) => (
                <TableRow key={b.id} className={b.status === "pending" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                  <TableCell className="text-sm">
                    {format(new Date(b.booking_date), "dd.MM.yyyy", { locale: de })}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <span className="font-mono">{b.chart_of_accounts?.account_number}</span>
                      <span className="text-muted-foreground ml-1">{b.chart_of_accounts?.account_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{b.description || "–"}</TableCell>
                  <TableCell className="text-sm">{b.buildings?.name || "–"}</TableCell>
                  <TableCell className="text-right font-medium text-sm">{formatCurrency(b.amount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {b.source === "manual" ? "Manuell" : b.source === "ocr" ? "OCR" : b.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                      {b.status === "confirmed" ? "Bestätigt" : "Offen"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {b.status === "pending" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => confirmBooking(b.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Bestätigen
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CreateBookingDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} buildings={buildings} />
    </Card>
  );
}
