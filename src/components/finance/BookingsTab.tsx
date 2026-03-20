import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckCircle, BookOpen, AlertCircle, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CreateBookingDialog } from "./CreateBookingDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

export function BookingsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterBuilding, setFilterBuilding] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const canQuery = !!filterBuilding && !!filterYear;

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["bookings", filterBuilding, filterYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select("*, buildings(name, building_code), chart_of_accounts(account_number, account_name)")
        .eq("fiscal_year", parseInt(filterYear))
        .eq("building_id", filterBuilding)
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: canQuery,
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

  const handleOpenCreate = () => {
    if (!filterBuilding) {
      toast.error("Bitte zuerst eine Liegenschaft auswählen");
      return;
    }
    setIsCreateOpen(true);
  };

  const formatCurrency = (amount: number | null) =>
    amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));
  const selectedBuildingName = buildings.find(b => b.id === filterBuilding)?.name;

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-row items-center justify-between flex-wrap gap-4">
          <CardTitle className="text-lg">Buchungen</CardTitle>
          <Button onClick={handleOpenCreate} disabled={!filterBuilding}>
            <Plus className="h-4 w-4 mr-2" /> Neue Buchung
          </Button>
        </div>

        {/* Mandatory filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Liegenschaft *</span>
            <Select value={filterBuilding} onValueChange={setFilterBuilding}>
              <SelectTrigger className="w-64 h-10">
                <SelectValue placeholder="Liegenschaft auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Wirtschaftsjahr *</span>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-32 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!canQuery ? (
          <div className="text-center py-16 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Liegenschaft & Wirtschaftsjahr auswählen</p>
            <p className="text-sm mt-1">Wählen Sie oben eine Liegenschaft und ein Wirtschaftsjahr, um die Buchungen zu sehen.</p>
          </div>
        ) : isLoading ? (
          <div className="text-muted-foreground text-sm p-4">Laden...</div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Noch keine Buchungen für {selectedBuildingName} im Jahr {filterYear}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Kürzel</TableHead>
                  <TableHead>Konto</TableHead>
                  <TableHead>Buchungstext</TableHead>
                  <TableHead>Beleg-Nr.</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead className="text-right">MwSt</TableHead>
                  <TableHead>Optionen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b: any) => (
                  <TableRow key={b.id} className={b.status === "pending" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(b.booking_date), "dd.MM.yyyy", { locale: de })}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {b.booking_reference || "–"}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <span className="font-mono">{b.chart_of_accounts?.account_number}</span>
                        <span className="text-muted-foreground ml-1">{b.chart_of_accounts?.account_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{b.description || "–"}</TableCell>
                    <TableCell className="text-xs font-mono">{b.receipt_number || "–"}</TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      <span className={b.booking_type === "income" ? "text-green-600" : ""}>
                        {b.booking_type === "income" ? "+" : ""}{formatCurrency(b.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {b.vat_rate > 0 ? `${b.vat_rate}%` : "–"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {b.is_35a_relevant && (
                          <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">§35a</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {b.source === "manual" ? "Manuell" : b.source === "ocr" ? "OCR" : b.source}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                        {b.status === "confirmed" ? "Bestätigt" : "Offen"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {b.status === "pending" && (
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => confirmBooking(b.id)}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Bestätigen
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <CreateBookingDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        buildings={buildings}
        preselectedBuildingId={filterBuilding}
        preselectedYear={filterYear}
      />
    </Card>
  );
}
