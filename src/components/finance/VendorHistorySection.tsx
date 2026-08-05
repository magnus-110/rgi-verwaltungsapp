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

  const invoiceVendorName = booking?.invoices?.vendor_name?.trim() || null;
  const descriptionVendorText = booking?.description?.trim() || null;
  const fallbackAccountName = booking?.counter_account?.account_name?.trim() || null;

  const vendorName = useMemo(() => {
    if (invoiceVendorName) return invoiceVendorName;
    if (descriptionVendorText) {
      const match = descriptionVendorText.match(/^([^,\-–]+)/);
      return match ? match[1].trim() : descriptionVendorText.substring(0, 60);
    }
    return fallbackAccountName;
  }, [invoiceVendorName, descriptionVendorText, fallbackAccountName]);

  const searchTokens = useMemo(() => {
    if (!vendorName) return [] as string[];
    return vendorName
      .replace(/[()]/g, " ")
      .replace(/\b(gmbh|mbh|ug|kg|ag|ohg|eg|ltd|inc|co|und|u\.)\b/gi, " ")
      .split(/\s+/)
      .map(token => token.trim())
      .filter(token => token.length >= 3)
      .slice(0, 4);
  }, [vendorName]);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const currentBookingId = typeof booking?.id === "string" && UUID_RE.test(booking.id) ? booking.id : null;

  // Always use counter_account_id for exact match when available — covers Personenkonten (Hausgeld) and Kreditoren ohne Rechnung
  const exactCreditorAccountId = booking?.counter_account_id || null;

  const { data: historyBookings = [] } = useQuery({
    queryKey: ["vendor-history", booking?.building_id, currentBookingId, exactCreditorAccountId, vendorName, searchTokens.join("|")],
    queryFn: async () => {
      if (!booking?.building_id) return [];

      const baseSelect = `
        id, booking_date, amount, booking_type, fiscal_year, status, description, booking_reference, vat_rate,
        chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
        counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
        invoices!bookings_invoice_id_fkey(vendor_name, invoice_number)
      `;

      const applyExclude = (q: any) => (currentBookingId ? q.neq("id", currentBookingId) : q);

      const exactMatchesPromise = exactCreditorAccountId
        ? applyExclude(
            supabase
              .from("bookings")
              .select(baseSelect)
              .eq("building_id", booking.building_id)
              .eq("counter_account_id", exactCreditorAccountId)
          )
            .order("booking_date", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as any[], error: null });

      let descriptionQuery = applyExclude(
        supabase
          .from("bookings")
          .select(baseSelect)
          .eq("building_id", booking.building_id)
      )
        .order("booking_date", { ascending: false })
        .limit(100);

      for (const token of searchTokens.slice(0, 3)) {
        descriptionQuery = descriptionQuery.ilike("description", `%${token}%`);
      }

      const byDescriptionPromise = searchTokens.length > 0
        ? descriptionQuery
        : Promise.resolve({ data: [] as any[], error: null });

      let invoiceQuery = supabase.from("invoices").select("id");
      for (const token of searchTokens.slice(0, 3)) {
        invoiceQuery = invoiceQuery.ilike("vendor_name", `%${token}%`);
      }

      const matchingInvoices = searchTokens.length > 0
        ? await invoiceQuery.limit(200)
        : { data: [] as any[], error: null };

      if ((matchingInvoices as any).error) throw (matchingInvoices as any).error;

      const invoiceIds = ((matchingInvoices as any).data || []).map((i: any) => i.id);

      const byInvoicePromise = invoiceIds.length > 0
        ? applyExclude(
            supabase
              .from("bookings")
              .select(baseSelect)
              .eq("building_id", booking.building_id)
              .in("invoice_id", invoiceIds)
          )
            .order("booking_date", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as any[], error: null });

      const [exactRes, descRes, invRes] = await Promise.all([exactMatchesPromise, byDescriptionPromise, byInvoicePromise]);
      if ((exactRes as any).error) throw (exactRes as any).error;
      if ((descRes as any).error) throw (descRes as any).error;
      if ((invRes as any).error) throw (invRes as any).error;

      const merged = new Map<string, any>();
      [...((exactRes as any).data || []), ...((descRes as any).data || []), ...((invRes as any).data || [])].forEach((b: any) => {
        merged.set(b.id, b);
      });

      return Array.from(merged.values()).sort(
        (a, b) => new Date(b.booking_date).getTime() - new Date(a.booking_date).getTime()
      );
    },
    enabled: isOpen && !!booking?.building_id && (!!exactCreditorAccountId || searchTokens.length > 0),
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
            <div className="max-h-[280px] overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="h-7 px-2 text-xs">Datum</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Beleg-Nr.</TableHead>
                    <TableHead className="h-7 px-2 text-xs text-right">Betrag</TableHead>
                    <TableHead className="h-7 px-2 text-xs">MwSt</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Konto</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Gegenkonto</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Buchungstext</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Rechnung</TableHead>
                    <TableHead className="h-7 px-2 text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((b: any) => (
                    <TableRow key={b.id} className="text-xs align-top">
                      <TableCell className="px-2 py-1 whitespace-nowrap">
                        {format(new Date(b.booking_date), "dd.MM.yyyy", { locale: de })}
                      </TableCell>
                      <TableCell className="px-2 py-1 font-mono text-[10px]">
                        {b.booking_reference || "–"}
                      </TableCell>
                      <TableCell className={cn("px-2 py-1 font-medium font-mono text-right whitespace-nowrap", b.booking_type === "income" ? "text-foreground" : "")}>
                        {b.booking_type === "income" ? "+" : ""}{formatCurrency(b.amount)}
                      </TableCell>
                      <TableCell className="px-2 py-1 whitespace-nowrap">
                        {b.vat_rate != null ? `${b.vat_rate}%` : "–"}
                      </TableCell>
                      <TableCell className="px-2 py-1 whitespace-nowrap">
                        {b.chart_of_accounts ? (
                          <span title={b.chart_of_accounts.account_name}>
                            {b.chart_of_accounts.account_number} <span className="text-muted-foreground">{b.chart_of_accounts.account_name}</span>
                          </span>
                        ) : "–"}
                      </TableCell>
                      <TableCell className="px-2 py-1 whitespace-nowrap">
                        {b.counter_account ? (
                          <span title={b.counter_account.account_name}>
                            {b.counter_account.account_number} <span className="text-muted-foreground">{b.counter_account.account_name}</span>
                          </span>
                        ) : "–"}
                      </TableCell>
                      <TableCell className="px-2 py-1 max-w-[260px]">
                        <span className="line-clamp-2" title={b.description || ""}>{b.description || "–"}</span>
                      </TableCell>
                      <TableCell className="px-2 py-1 whitespace-nowrap">
                        {b.invoices?.invoice_number || b.invoices?.vendor_name || "–"}
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
