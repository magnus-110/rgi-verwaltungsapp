import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

interface VendorHistorySectionProps {
  booking: any;
}

export function VendorHistorySection({ booking }: VendorHistorySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");

  const vendorName = useMemo(() => {
    if (booking?.invoices?.vendor_name) return booking.invoices.vendor_name;
    if (booking?.description) {
      // Use first meaningful phrase (up to comma or dash)
      const match = booking.description.match(/^([^,\-–]+)/);
      return match ? match[1].trim() : booking.description.substring(0, 30);
    }
    return null;
  }, [booking]);

  const { data: historyBookings = [] } = useQuery({
    queryKey: ["vendor-history", booking?.building_id, vendorName],
    queryFn: async () => {
      if (!vendorName || !booking?.building_id) return [];

      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_date, amount, booking_type, fiscal_year, status, description,
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          invoices(vendor_name)
        `)
        .eq("building_id", booking.building_id)
        .neq("id", booking.id)
        .or(`description.ilike.%${vendorName}%`)
        .order("booking_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!vendorName && !!booking?.building_id,
  });

  const availableYears = useMemo(() => {
    const years = new Set(historyBookings.map((b: any) => String(b.fiscal_year)));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [historyBookings]);

  const filteredBookings = useMemo(() => {
    if (yearFilter === "all") return historyBookings;
    return historyBookings.filter((b: any) => String(b.fiscal_year) === yearFilter);
  }, [historyBookings, yearFilter]);

  const totalAmount = useMemo(() =>
    filteredBookings.reduce((sum: number, b: any) => sum + (b.amount || 0), 0),
    [filteredBookings]
  );

  if (!vendorName) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 transition-colors rounded-lg">
        <div className="flex items-center gap-2 text-sm font-medium">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <History className="h-4 w-4 text-muted-foreground" />
          <span>Kreditor-Historie</span>
          <Badge variant="outline" className="text-xs font-normal max-w-[200px] truncate">
            {vendorName}
          </Badge>
        </div>
        {historyBookings.length > 0 && (
          <Badge variant="secondary" className="text-xs">{historyBookings.length}</Badge>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3">
        <div className="flex items-center gap-2 mb-2 mt-1">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue placeholder="Wirtschaftsjahr" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Jahre</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredBookings.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Keine weiteren Buchungen gefunden.</p>
        ) : (
          <>
            <div className="max-h-[200px] overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="h-7 px-2 text-xs">Datum</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Betrag</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Konto</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((b: any) => (
                    <TableRow key={b.id} className="text-xs">
                      <TableCell className="px-2 py-1">
                        {format(new Date(b.booking_date), "dd.MM.yy", { locale: de })}
                      </TableCell>
                      <TableCell className={cn("px-2 py-1 font-medium", b.booking_type === "income" ? "text-green-600" : "")}>
                        {b.booking_type === "income" ? "+" : ""}{formatCurrency(b.amount)}
                      </TableCell>
                      <TableCell className="px-2 py-1 truncate max-w-[120px]">
                        {b.chart_of_accounts ? `${b.chart_of_accounts.account_number}` : "–"}
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <Badge variant={b.status === "confirmed" ? "default" : "outline"} className="text-[10px] px-1 py-0">
                          {b.status === "confirmed" ? "✓" : b.status === "pending" ? "…" : b.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground px-1">
              <span>{filteredBookings.length} Buchungen</span>
              <span className="font-medium text-foreground">Σ {formatCurrency(totalAmount)}</span>
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
