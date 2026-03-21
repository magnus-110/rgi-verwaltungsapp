import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, BookOpen, AlertTriangle, FileText, ChevronDown, ChevronRight, Search, Building2, LayoutTemplate } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { CreateBookingDialog } from "./CreateBookingDialog";
import { EditBookingDialog } from "./EditBookingDialog";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

const PAGE_SIZE = 25;

export function BookingsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));
  const [searchQuery, setSearchQuery] = useState("");
  const [editBooking, setEditBooking] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(0);
  const [confirmedOpen, setConfirmedOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Pending bookings (all buildings)
  const { data: pendingBookings = [], isLoading } = useQuery({
    queryKey: ["bookings-pending", filterYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select(`
          *,
          buildings(id, name, building_code),
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices(id, file_path, file_name, vendor_name),
          booking_templates!bookings_matched_template_id_fkey(id, name)
        `)
        .eq("fiscal_year", parseInt(filterYear))
        .eq("status", "pending")
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Confirmed bookings (lazy, only when collapsible open)
  const { data: confirmedBookings = [] } = useQuery({
    queryKey: ["bookings-confirmed", filterYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select(`
          *,
          buildings(id, name, building_code),
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices(id, file_path, file_name, vendor_name),
          booking_templates!bookings_matched_template_id_fkey(id, name)
        `)
        .eq("fiscal_year", parseInt(filterYear))
        .eq("status", "confirmed")
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: confirmedOpen,
  });

  // Manual bookings (lazy)
  const { data: manualBookings = [] } = useQuery({
    queryKey: ["bookings-manual", filterYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select(`
          *,
          buildings(id, name, building_code),
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices(id, file_path, file_name, vendor_name),
          booking_templates!bookings_matched_template_id_fkey(id, name)
        `)
        .eq("fiscal_year", parseInt(filterYear))
        .eq("source", "manual")
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: manualOpen,
  });

  // Filter by search
  const filteredPending = useMemo(() => {
    if (!searchQuery.trim()) return pendingBookings;
    const q = searchQuery.toLowerCase();
    return pendingBookings.filter((b: any) =>
      b.buildings?.name?.toLowerCase().includes(q) ||
      b.buildings?.building_code?.toLowerCase().includes(q)
    );
  }, [pendingBookings, searchQuery]);

  // Group by building
  const groupedBookings = useMemo(() => {
    const groups: Record<string, { building: any; bookings: any[] }> = {};
    filteredPending.forEach((b: any) => {
      const key = b.building_id || "unassigned";
      if (!groups[key]) {
        groups[key] = { building: b.buildings || { name: "Ohne Zuordnung" }, bookings: [] };
      }
      groups[key].bookings.push(b);
    });
    return Object.entries(groups).sort((a, b) => 
      (a[1].building?.name || "").localeCompare(b[1].building?.name || "")
    );
  }, [filteredPending]);

  // Flatten for pagination
  const allFiltered = useMemo(() => {
    const result: { type: "header"; building: any } | { type: "booking"; booking: any }[] = [];
    groupedBookings.forEach(([, group]) => {
      result.push({ type: "header", building: group.building } as any);
      group.bookings.forEach(b => result.push({ type: "booking", booking: b } as any));
    });
    return result;
  }, [groupedBookings]);

  const totalPages = Math.max(1, Math.ceil(filteredPending.length / PAGE_SIZE));
  const paginatedBookings = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageItems = filteredPending.slice(start, end);
    
    // Group the page items
    const groups: Record<string, { building: any; bookings: any[] }> = {};
    pageItems.forEach((b: any) => {
      const key = b.building_id || "unassigned";
      if (!groups[key]) {
        groups[key] = { building: b.buildings || { name: "Ohne Zuordnung" }, bookings: [] };
      }
      groups[key].bookings.push(b);
    });
    return Object.entries(groups).sort((a, b) =>
      (a[1].building?.name || "").localeCompare(b[1].building?.name || "")
    );
  }, [filteredPending, currentPage]);

  const handleRowClick = (booking: any) => setEditBooking(booking);
  const handleRowKeyDown = (e: React.KeyboardEvent, booking: any) => {
    if (e.key === "Enter") { e.preventDefault(); setEditBooking(booking); }
  };

  const handleInvoiceClick = useCallback(async (invoiceId: string) => {
    try {
      const allBookings = [...pendingBookings, ...confirmedBookings, ...manualBookings];
      const booking = allBookings.find((b: any) => b.invoice_id === invoiceId);
      const filePath = booking?.invoices?.file_path;
      const fileName = booking?.invoices?.file_name || "Rechnung.pdf";
      if (!filePath) { toast.error("Keine Datei hinterlegt"); return; }
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(filePath, 3600);
      if (error || !data?.signedUrl) { toast.error("Fehler beim Laden"); return; }
      setPdfUrl(data.signedUrl);
      setPdfFileName(fileName);
    } catch { toast.error("Fehler beim Laden der Rechnung"); }
  }, [pendingBookings, confirmedBookings, manualBookings]);

  const formatCurrency = (amount: number | null) =>
    amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const renderBookingRow = (b: any) => (
    <TableRow
      key={b.id}
      tabIndex={0}
      className={`cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${b.status === "pending" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}
      onClick={() => handleRowClick(b)}
      onKeyDown={(e) => handleRowKeyDown(e, b)}
    >
      <TableCell className="text-sm whitespace-nowrap">
        {format(new Date(b.booking_date), "dd.MM.yyyy", { locale: de })}
      </TableCell>
      <TableCell>
        <div className="text-xs">
          {b.chart_of_accounts ? (
            <>
              <span className="font-mono font-medium">{b.chart_of_accounts.account_number}</span>
              <span className="text-muted-foreground ml-1">{b.chart_of_accounts.account_name}</span>
            </>
          ) : <span className="text-muted-foreground italic">–</span>}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-xs">
          {b.counter_account ? (
            <>
              <span className="font-mono font-medium">{b.counter_account.account_number}</span>
              <span className="text-muted-foreground ml-1">{b.counter_account.account_name}</span>
            </>
          ) : <span className="text-muted-foreground">–</span>}
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
        <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
          {b.ai_warning && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><AlertTriangle className="h-4 w-4 text-amber-500" /></TooltipTrigger>
                <TooltipContent className="max-w-xs"><p className="text-xs">{b.ai_warning}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {b.is_35a_relevant && (
            <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">§35a</Badge>
          )}
          {b.invoice_id && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
              onClick={(e) => { e.stopPropagation(); handleInvoiceClick(b.invoice_id); }}>
              <FileText className="h-3.5 w-3.5 text-primary" />
            </Button>
          )}
          {b.matched_template_id && b.booking_templates && (
            <LayoutTemplate className="h-4 w-4 text-primary" />
          )}
          <Badge variant="outline" className="text-[10px]">
            {b.source === "manual" ? "Manuell" : b.source === "ocr" ? "OCR" : b.source === "bank_import" ? "Bank" : b.source}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs">
          {b.status === "confirmed" ? "Bestätigt" : "Offen"}
        </Badge>
      </TableCell>
    </TableRow>
  );

  const tableHeaders = (
    <TableHeader>
      <TableRow>
        <TableHead>Datum</TableHead>
        <TableHead>Soll-Konto</TableHead>
        <TableHead>Gegen-Konto</TableHead>
        <TableHead>Buchungstext</TableHead>
        <TableHead>Beleg-Nr.</TableHead>
        <TableHead className="text-right">Betrag</TableHead>
        <TableHead className="text-right">MwSt</TableHead>
        <TableHead>Optionen</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-row items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-lg">
              Offene Buchungen
              {filteredPending.length > 0 && (
                <Badge variant="secondary" className="ml-2">{filteredPending.length}</Badge>
              )}
            </CardTitle>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Neue Buchung
            </Button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Suche</span>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Liegenschaft suchen..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(0); }}
                  className="pl-9 w-64 h-10"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Wirtschaftsjahr</span>
              <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); setCurrentPage(0); }}>
                <SelectTrigger className="w-32 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground text-sm p-4">Laden...</div>
          ) : filteredPending.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {searchQuery ? "Keine offenen Buchungen für diese Suche" : `Keine offenen Buchungen im Jahr ${filterYear}`}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  {tableHeaders}
                  <TableBody>
                    {paginatedBookings.map(([buildingId, group]) => (
                      <>
                        <TableRow key={`header-${buildingId}`} className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={9} className="py-2">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {group.building?.name || "Ohne Zuordnung"}
                              {group.building?.building_code && (
                                <span className="text-xs font-normal text-muted-foreground">({group.building.building_code})</span>
                              )}
                              <Badge variant="outline" className="text-xs ml-1">{group.bookings.length}</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        {group.bookings.map(renderBookingRow)}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                          className={currentPage === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <PaginationItem key={i}>
                          <PaginationLink
                            isActive={i === currentPage}
                            onClick={() => setCurrentPage(i)}
                            className="cursor-pointer"
                          >
                            {i + 1}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                          className={currentPage === totalPages - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmed bookings collapsible */}
      <Collapsible open={confirmedOpen} onOpenChange={setConfirmedOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                {confirmedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CardTitle className="text-lg">Bestätigte Buchungen</CardTitle>
                {confirmedOpen && confirmedBookings.length > 0 && (
                  <Badge variant="outline">{confirmedBookings.length}</Badge>
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {confirmedBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Keine bestätigten Buchungen im Jahr {filterYear}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    {tableHeaders}
                    <TableBody>{confirmedBookings.map(renderBookingRow)}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Manual bookings collapsible */}
      <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                {manualOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CardTitle className="text-lg">Manuelle Buchungen</CardTitle>
                {manualOpen && manualBookings.length > 0 && (
                  <Badge variant="outline">{manualBookings.length}</Badge>
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {manualBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Keine manuellen Buchungen im Jahr {filterYear}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    {tableHeaders}
                    <TableBody>{manualBookings.map(renderBookingRow)}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <CreateBookingDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        buildings={buildings}
        preselectedBuildingId=""
        preselectedYear={filterYear}
      />

      <EditBookingDialog
        open={!!editBooking}
        onOpenChange={(open) => { if (!open) setEditBooking(null); }}
        booking={editBooking}
        buildingName={editBooking?.buildings?.name || ""}
        onInvoiceClick={handleInvoiceClick}
      />

      <PdfViewerModal
        isOpen={!!pdfUrl}
        onClose={() => { setPdfUrl(null); setPdfFileName(""); }}
        documentUrl={pdfUrl}
        documentName={pdfFileName}
      />
    </div>
  );
}
