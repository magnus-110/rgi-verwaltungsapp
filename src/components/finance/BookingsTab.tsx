import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BookOpen, AlertTriangle, FileText, ChevronDown, ChevronRight, Search, LayoutTemplate, Flag, Plus, List, LayoutGrid, Eye, EyeOff, RotateCcw, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AccountPlanView } from "./AccountPlanView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { EditBookingDialog } from "./EditBookingDialog";
import { CreateBookingDialog } from "./CreateBookingDialog";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export function BookingsTab({
  sharedBuildingId,
  sharedPeriodId,
}: {
  sharedBuildingId?: string | null;
  sharedPeriodId?: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Resolve fiscal year from the selected billing period (matches Abrechnung tab)
  const { data: selectedPeriod } = useQuery({
    queryKey: ["billing-period-detail-bookings", sharedPeriodId],
    queryFn: async () => {
      if (!sharedPeriodId) return null;
      const { data, error } = await supabase
        .from("billing_periods")
        .select("id, fiscal_year, period_from, period_to")
        .eq("id", sharedPeriodId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!sharedPeriodId,
  });

  const filterYear = selectedPeriod?.fiscal_year
    ? String(selectedPeriod.fiscal_year)
    : String(new Date().getFullYear());

  const [searchQuery, setSearchQuery] = useState("");
  const [editBooking, setEditBooking] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(0);
  const [confirmedOpen, setConfirmedOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [templateDetail, setTemplateDetail] = useState<any>(null);
  const [filterReview, setFilterReview] = useState(false);
  const [filterUncertain, setFilterUncertain] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "plan">(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("bookings-view-mode") : null;
    return saved === "list" ? "list" : "plan";
  });
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [undoBooking, setUndoBooking] = useState<any>(null);
  const [undoing, setUndoing] = useState(false);
  const [deleteBooking, setDeleteBooking] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aKeyDown, setAKeyDown] = useState(false);
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A") {
        if (isTypingTarget(e.target)) return;
        setAKeyDown(true);
      }
      if (e.key === "Escape") setSelectedIds(new Set());
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A") setAKeyDown(false);
    };
    const blur = () => setAKeyDown(false);
    // Click anywhere outside a selectable booking row clears the selection
    const onDocClick = (e: MouseEvent) => {
      if (aKeyDown) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore clicks inside dialogs / popovers / dropdowns
      if (target.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      // Ignore clicks on selectable rows or interactive controls inside them
      if (target.closest('[data-booking-row="true"]')) return;
      setSelectedIds(prev => (prev.size === 0 ? prev : new Set()));
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("click", onDocClick);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("click", onDocClick);
    };
  }, [aKeyDown]);

  const handleUndoBooking = async () => {
    if (!undoBooking) return;
    setUndoing(true);
    try {
      // Free linked bank_transaction(s)
      const { error: txError } = await supabase
        .from("bank_transactions")
        .update({ booked_at: null, booking_id: null })
        .eq("booking_id", undoBooking.id);
      if (txError) throw txError;
      // Delete the booking
      const { error: delError } = await supabase
        .from("bookings")
        .delete()
        .eq("id", undoBooking.id);
      if (delError) throw delError;
      toast.success("Buchung rückgängig – Transaktion zurück im Kontoauszug");
      setUndoBooking(null);
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0] as string;
        return typeof k === "string" && (k.startsWith("bookings") || k.startsWith("bank-transactions"));
      }});
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setUndoing(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!deleteBooking) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc(
        "delete_booking_with_cleanup",
        { p_booking_id: deleteBooking.id },
      );
      if (error) throw error;
      const count = (data as any)?.deleted ?? 1;
      const hadTxn = !!(data as any)?.bank_transaction_id;
      toast.success(
        count > 1
          ? `${count} Buchungen gelöscht (Splitgruppe)${hadTxn ? " – Transaktion wieder offen" : ""}`
          : `Buchung gelöscht${hadTxn ? " – Transaktion wieder offen" : ""}`,
      );
      setDeleteBooking(null);
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0] as string;
        return typeof k === "string" && (k.startsWith("bookings") || k.startsWith("bank-transactions"));
      }});
    } catch (err: any) {
      toast.error("Fehler beim Löschen: " + (err.message || "Unbekannt"));
    } finally {
      setDeleting(false);
    }
  };

  const handleViewModeChange = (v: string) => {
    if (v !== "list" && v !== "plan") return;
    setViewMode(v as "list" | "plan");
    try { localStorage.setItem("bookings-view-mode", v); } catch {}
  };

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingBookings = [], isLoading } = useQuery({
    queryKey: ["bookings-all", filterYear, sharedBuildingId],
    queryFn: async () => {
      let query = supabase.from("bookings")
        .select(`
          *,
          buildings(id, name, building_code),
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices(id, file_path, file_name, vendor_name),
          booking_templates!bookings_matched_template_id_fkey(id, name, vendor_name, expected_amount, vat_rate, interval, category)
        `)
        .eq("fiscal_year", parseInt(filterYear))
        .in("status", ["pending", "confirmed"])
        .order("booking_date", { ascending: false });
      if (sharedBuildingId) query = query.eq("building_id", sharedBuildingId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!sharedBuildingId,
  });

  const confirmedBookings: any[] = [];

  const { data: manualBookings = [] } = useQuery({
    queryKey: ["bookings-manual", filterYear, sharedBuildingId],
    queryFn: async () => {
      let query = supabase.from("bookings")
        .select(`
          *,
          buildings(id, name, building_code),
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices(id, file_path, file_name, vendor_name),
          booking_templates!bookings_matched_template_id_fkey(id, name, vendor_name, expected_amount, vat_rate, interval, category)
        `)
        .eq("fiscal_year", parseInt(filterYear))
        .eq("source", "manual")
        .neq("booking_reference", "KI")
        .order("booking_date", { ascending: false });
      if (sharedBuildingId) query = query.eq("building_id", sharedBuildingId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: manualOpen && !!sharedBuildingId,
  });

  // Universal search across all fields
  const universalFilter = useCallback((bookings: any[]) => {
    let result = bookings;
    if (filterReview) {
      result = result.filter((b: any) => b.needs_review === true);
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter((b: any) => {
      const fields = [
        b.description,
        b.receipt_number,
        b.booking_reference,
        b.chart_of_accounts?.account_number,
        b.chart_of_accounts?.account_name,
        b.counter_account?.account_number,
        b.counter_account?.account_name,
        b.buildings?.name,
        b.buildings?.building_code,
        b.invoices?.vendor_name,
        b.amount != null ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(b.amount) : null,
        b.amount != null ? String(b.amount) : null,
        b.booking_date ? format(new Date(b.booking_date), "dd.MM.yyyy") : null,
      ];
      return fields.some(f => f && String(f).toLowerCase().includes(q));
    });
  }, [searchQuery, filterReview]);

  const sortByDate = useCallback((arr: any[]) => {
    return [...arr].sort((a, b) => {
      const da = a.booking_date ? new Date(a.booking_date).getTime() : 0;
      const db = b.booking_date ? new Date(b.booking_date).getTime() : 0;
      return dateSort === "asc" ? da - db : db - da;
    });
  }, [dateSort]);

  const filteredPending = useMemo(() => sortByDate(universalFilter(pendingBookings)), [pendingBookings, universalFilter, sortByDate]);
  const filteredConfirmed = useMemo(() => sortByDate(universalFilter(confirmedBookings)), [confirmedBookings, universalFilter, sortByDate]);
  const filteredManual = useMemo(() => sortByDate(universalFilter(manualBookings)), [manualBookings, universalFilter, sortByDate]);

  const totalPages = Math.max(1, Math.ceil(filteredPending.length / PAGE_SIZE));
  const paginatedPending = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filteredPending.slice(start, start + PAGE_SIZE);
  }, [filteredPending, currentPage]);

  const handleRowClick = (booking: any, e?: React.MouseEvent) => {
    const id = booking.id as string;
    // Toggle off if already selected (no A required)
    if (selectedIds.has(id)) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    // Add to selection if A held
    if (aKeyDown) {
      setSelectedIds(prev => new Set(prev).add(id));
      return;
    }
    // If a selection is active and user clicks elsewhere without A → clear selection
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      return;
    }
    // Default: open editor
    setEditBooking(booking);
  };

  const clearSelectionOnBackground = (e: React.MouseEvent) => {
    if (selectedIds.size === 0 || aKeyDown) return;
    // Only clear if click target is the wrapper itself (not propagated from a row/button)
    if (e.target === e.currentTarget) setSelectedIds(new Set());
  };

  const handleInvoiceClick = useCallback(async (booking: any) => {
    try {
      const filePath = booking?.invoices?.file_path;
      const fileName = booking?.invoices?.file_name || "Rechnung.pdf";
      if (!filePath) { toast.error("Keine Datei hinterlegt"); return; }
      const cleanPath = filePath.replace(/^\/+/, "").replace(/^invoices\//, "");
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (error || !data?.signedUrl) {
        toast.error("PDF konnte nicht geladen werden");
        return;
      }
      setPdfUrl(data.signedUrl);
      setPdfFileName(fileName);
    } catch (err) {
      toast.error("Fehler beim Laden der Rechnung");
    }
  }, []);

  const handleTemplateClick = useCallback((booking: any) => {
    if (booking?.booking_templates) setTemplateDetail(booking.booking_templates);
  }, []);

  const formatCurrency = (amount: number | null) =>
    amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const renderRow = (b: any) => {
    const isIncome = b.booking_type === "income";
    const isSelected = selectedIds.has(b.id);

    return (
      <TableRow
        key={b.id}
        data-booking-row="true"
        className={cn(
          "cursor-pointer text-[13px] hover:bg-muted/60 transition-colors",
          b.needs_review && "bg-orange-50 dark:bg-orange-950/20",
          isSelected && "bg-primary/15 hover:bg-primary/20 ring-1 ring-inset ring-primary/40"
        )}
        onClick={(e) => handleRowClick(b, e)}
      >
        <TableCell className="py-2 px-3 whitespace-nowrap font-medium tabular-nums">
          {format(new Date(b.booking_date), "dd.MM.yyyy")}
        </TableCell>
        <TableCell className="py-2 px-3 font-mono tabular-nums">
          {b.chart_of_accounts?.account_number || "–"}
        </TableCell>
        <TableCell className="py-2 px-3 max-w-[180px] truncate">
          {b.chart_of_accounts?.account_name || "–"}
        </TableCell>
        <TableCell className={cn(
          "py-2 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap",
          isIncome ? "text-green-600" : "text-destructive"
        )}>
          {isIncome ? "+" : ""}{formatCurrency(b.amount)}
        </TableCell>
        <TableCell className="py-2 px-3 max-w-[300px] truncate">
          {b.description || "–"}
        </TableCell>
        <TableCell className="py-2 px-3 font-mono tabular-nums">
          {b.counter_account?.account_number || "–"}
        </TableCell>
        <TableCell className="py-2 px-3 max-w-[180px] truncate">
          {b.counter_account?.account_name || "–"}
        </TableCell>
        <TableCell className="py-2 px-3">
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {b.status === "confirmed" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300">✓</Badge></TooltipTrigger>
                  <TooltipContent><p className="text-xs">Gebucht</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {b.needs_review && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const { error } = await supabase
                          .from("bookings")
                          .update({ needs_review: false })
                          .eq("id", b.id);
                        if (error) { toast.error("Fehler: " + error.message); return; }
                        toast.success("Prüfung erledigt");
                        queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
                        queryClient.invalidateQueries({ queryKey: ["bookings-manual"] });
                      }}
                    >
                      <Flag className="h-3.5 w-3.5 text-orange-500 fill-orange-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Prüfung erledigt (Klick)</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {b.ai_warning && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs"><p className="text-xs">{b.ai_warning}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {b.source === "bank_import" && b.bank_transaction_id && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0"
                      onClick={(e) => { e.stopPropagation(); setUndoBooking(b); }}
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Buchung rückgängig – zurück zum Kontoauszug</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    onClick={(e) => { e.stopPropagation(); setDeleteBooking(b); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Buchung löschen{b.split_parts_total ? " (gesamte Splitgruppe)" : ""}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const tableHeaders = (
    <TableHeader>
      <TableRow className="text-xs">
        <TableHead className="py-2.5 px-3 font-semibold">
          <button
            type="button"
            onClick={() => setDateSort(s => s === "asc" ? "desc" : "asc")}
            className="inline-flex items-center gap-1 hover:text-primary"
            title="Nach Datum sortieren"
          >
            Bel. Datum
            {dateSort === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          </button>
        </TableHead>
        <TableHead className="py-2.5 px-3 font-semibold">Kto-Nr.</TableHead>
        <TableHead className="py-2.5 px-3 font-semibold">Konto</TableHead>
        <TableHead className="py-2.5 px-3 text-right font-semibold">Betrag</TableHead>
        <TableHead className="py-2.5 px-3 font-semibold">Buch-Text</TableHead>
        <TableHead className="py-2.5 px-3 font-semibold">G-Kto-Nr.</TableHead>
        <TableHead className="py-2.5 px-3 font-semibold">Gegen-Konto</TableHead>
        <TableHead className="py-2.5 px-3 w-[60px]"></TableHead>
      </TableRow>
    </TableHeader>
  );

  const renderSection = (title: string, bookings: any[], count: number) => (
    <>
      <div className="overflow-x-auto">
        <Table>
          {tableHeaders}
          <TableBody>
            {bookings.map(renderRow)}
          </TableBody>
        </Table>
      </div>
      <div className="text-right text-xs text-muted-foreground py-2 px-2 border-t">
        Anzahl Buchungen: {count}
      </div>
    </>
  );

  if (!sharedBuildingId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Bitte wähle oben eine Liegenschaft, um die Buchungen anzuzeigen.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche (Konto, Betrag, Text, Beleg…)"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(0); }}
            className="pl-9 h-9"
          />
        </div>
        {/* Zeitraum & Liegenschaft werden oben über den BillingPeriodSelector gesteuert */}
        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && handleViewModeChange(v)} className="h-9">
          <ToggleGroupItem value="list" size="sm" className="h-9 w-9 p-0" title="Liste">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="plan" size="sm" className="h-9 w-9 p-0" title="Kontenplan">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
        {viewMode === "plan" && (
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            title={showAllAccounts ? "Nur bebuchte Konten" : "Alle Konten"}
            onClick={() => setShowAllAccounts(s => !s)}
          >
            {showAllAccounts ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
        <Button
          variant={filterReview ? "default" : "outline"}
          size="icon"
          className={cn("h-9 w-9 relative", filterReview && "bg-orange-500 hover:bg-orange-600 text-white")}
          title="Prüfung"
          onClick={() => { setFilterReview(f => !f); setCurrentPage(0); }}
        >
          <Flag className="h-4 w-4" />
          {pendingBookings.filter((b: any) => b.needs_review).length > 0 && (
            <Badge variant="secondary" className="absolute -top-1.5 -right-1.5 text-[10px] h-4 min-w-4 px-1 rounded-full">
              {pendingBookings.filter((b: any) => b.needs_review).length}
            </Badge>
          )}
        </Button>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant="secondary" className="text-xs">
              {selectedIds.size} markiert
            </Badge>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setSelectedIds(new Set())}>
              Auswahl aufheben
            </Button>
          </div>
        )}
        <Button size="sm" className={cn("h-9 gap-1.5", selectedIds.size === 0 && "ml-auto")} onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Neue Buchung
        </Button>
      </div>

      {/* Pending bookings */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
          <h3 className="text-sm font-semibold">Buchungen</h3>
          <Badge variant="secondary" className="text-xs">{filteredPending.length}</Badge>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-muted-foreground text-sm p-6 text-center">Laden...</div>
          ) : viewMode === "plan" ? (
            <div className="p-4">
              <AccountPlanView
                bookings={filteredPending}
                fiscalYear={parseInt(filterYear)}
                buildingId={sharedBuildingId || null}
                onRowClick={handleRowClick}
                showAllAccounts={showAllAccounts}
              />
            </div>
          ) : filteredPending.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {searchQuery ? "Keine Buchungen für diese Suche" : `Keine Buchungen in ${filterYear}`}
              </p>
            </div>
          ) : (
            <>
              {renderSection("Buchungen", paginatedPending, filteredPending.length)}
              {totalPages > 1 && (
                <div className="py-2 border-t">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                          className={currentPage === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let page = i;
                        if (totalPages > 7) {
                          if (currentPage < 4) page = i;
                          else if (currentPage > totalPages - 5) page = totalPages - 7 + i;
                          else page = currentPage - 3 + i;
                        }
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              isActive={page === currentPage}
                              onClick={() => setCurrentPage(page)}
                              className="cursor-pointer"
                            >
                              {page + 1}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
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

      <Dialog open={!!templateDetail} onOpenChange={(open) => { if (!open) setTemplateDetail(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buchungsvorlage</DialogTitle>
          </DialogHeader>
          {templateDetail && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{templateDetail.name}</span>
              </div>
              {templateDetail.vendor_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lieferant</span>
                  <span>{templateDetail.vendor_name}</span>
                </div>
              )}
              {templateDetail.expected_amount != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Erwarteter Betrag</span>
                  <span>{formatCurrency(templateDetail.expected_amount)}</span>
                </div>
              )}
              {templateDetail.interval && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Intervall</span>
                  <span>{templateDetail.interval}</span>
                </div>
              )}
              {templateDetail.category && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kategorie</span>
                  <span>{templateDetail.category}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateBookingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        buildings={buildings}
        preselectedBuildingId={sharedBuildingId || undefined}
        preselectedYear={filterYear}
        onBookingCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
          queryClient.invalidateQueries({ queryKey: ["bookings-manual"] });
        }}
      />

      <AlertDialog open={!!undoBooking} onOpenChange={(o) => !o && setUndoBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buchung rückgängig machen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Buchung wird gelöscht und die zugehörige Bank-Transaktion erscheint wieder im Kontoauszug zur Verarbeitung.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={undoing}
              onClick={(e) => { e.preventDefault(); handleUndoBooking(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {undoing ? "Wird rückgängig gemacht…" : "Rückgängig machen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteBooking} onOpenChange={(o) => !o && setDeleteBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buchung endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBooking?.split_parts_total
                ? `Diese Buchung gehört zu einer Splitgruppe (${deleteBooking.split_parts_total} Teile). Es werden ALLE ${deleteBooking.split_parts_total} Teilbuchungen gelöscht.`
                : "Die Buchung wird unwiderruflich aus den Büchern entfernt."}
              {deleteBooking?.bank_transaction_id && " Die zugehörige Bank-Transaktion erscheint wieder im Kontoauszug."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleDeleteBooking(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Wird gelöscht…" : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
