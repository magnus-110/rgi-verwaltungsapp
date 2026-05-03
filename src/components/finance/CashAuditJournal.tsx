import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, AlertTriangle, Search, FileText, LayoutTemplate, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CashAuditJournalProps {
  buildingId: string;
  fiscalYear: number;
  progress: Record<string, any>;
  onProgressChange: (progress: Record<string, any>) => void;
  readOnly?: boolean;
  tokenMode?: boolean;
  token?: string;
}

export function CashAuditJournal({ buildingId, fiscalYear, progress, onProgressChange, readOnly, tokenMode, token }: CashAuditJournalProps) {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: bookings = [] } = useQuery({
    queryKey: ["audit-journal", buildingId, fiscalYear, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_bookings_by_token", { p_token: token });
        return (data as any[]) || [];
      }
      const { data } = await supabase
        .from("bookings")
        .select(`
          id, booking_date, description, amount, booking_type,
          receipt_number, account_id, counter_account_id,
          invoice_id, matched_template_id, needs_review, review_note,
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          invoices(id, vendor_name, file_path, gross_amount, invoice_number),
          booking_templates!bookings_matched_template_id_fkey(id, name, expected_amount, interval, vendor_name, linked_invoice_id)
        `)
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .in("status", ["pending", "confirmed"])
        .order("booking_date");
      return data || [];
    },
  });

  const bookingFlags = progress?.bookingFlags || {};
  const bookingNotes = progress?.bookingNotes || {};

  const setFlag = (bookingId: string, flag: "ok" | "issue" | null) => {
    if (readOnly) return;
    const updated = { ...bookingFlags, [bookingId]: flag };
    onProgressChange({ ...progress, bookingFlags: updated });
  };

  const setNote = (bookingId: string, note: string) => {
    if (readOnly) return;
    const updated = { ...bookingNotes, [bookingId]: note };
    onProgressChange({ ...progress, bookingNotes: updated });
  };

  const filtered = bookings.filter((b: any) => {
    if (monthFilter !== "all") {
      const month = new Date(b.booking_date).getMonth().toString();
      if (month !== monthFilter) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return (b.description || "").toLowerCase().includes(s) ||
        (b.receipt_number || "").toLowerCase().includes(s) ||
        (b.invoices?.vendor_name || "").toLowerCase().includes(s);
    }
    return true;
  });

  const selectedBooking = bookings.find((b: any) => b.id === selectedBookingId);
  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  const selectedIndex = filtered.findIndex((b: any) => b.id === selectedBookingId);
  const goToIndex = (i: number) => {
    if (i < 0 || i >= filtered.length) return;
    setSelectedBookingId(filtered[i].id);
  };

  // Auto-load PDF when selected booking changes
  useEffect(() => {
    setPdfUrl(null);
    if (!selectedBooking?.invoices?.file_path) return;
    let cancelled = false;
    setPdfLoading(true);
    (async () => {
      const cleanPath = selectedBooking.invoices.file_path.replace(/^\/+/, "").replace(/^invoices\//, "");
      const { data } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (!cancelled && data?.signedUrl) setPdfUrl(data.signedUrl);
      if (!cancelled) setPdfLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedBookingId]);

  const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  const flaggedOk = Object.values(bookingFlags).filter((v) => v === "ok").length;
  const flaggedIssue = Object.values(bookingFlags).filter((v) => v === "issue").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen..." className="pl-9" />
        </div>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Monate</SelectItem>
            {months.map((m, i) => (
              <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>{filtered.length} Buchungen</span>
        {flaggedOk > 0 && <span className="text-green-600">✓ {flaggedOk} geprüft</span>}
        {flaggedIssue > 0 && <span className="text-amber-600">⚠ {flaggedIssue} auffällig</span>}
      </div>

      <div className="space-y-1">
        {filtered.map((booking: any) => {
          const flag = bookingFlags[booking.id];
          const account = booking.chart_of_accounts;

          return (
            <button
              key={booking.id}
              onClick={() => setSelectedBookingId(booking.id)}
              className={cn(
                "w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/50",
                flag === "ok" && "border-green-300 bg-green-50/30",
                flag === "issue" && "border-amber-300 bg-amber-50/30"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(booking.booking_date).toLocaleDateString("de-DE")}
                    </span>
                    <span className="text-sm font-medium truncate">{booking.description || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {account && (
                      <span className="text-xs text-muted-foreground">
                        {account.account_number} {account.account_name}
                      </span>
                    )}
                    {booking.invoices && (
                      <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
                        <FileText className="h-2.5 w-2.5" />
                        Rechnung
                      </Badge>
                    )}
                    {booking.booking_templates && !booking.invoices && (
                      <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
                        <LayoutTemplate className="h-2.5 w-2.5" />
                        Vorlage
                      </Badge>
                    )}
                  </div>
                </div>
                <span className={cn(
                  "text-sm font-mono font-medium whitespace-nowrap",
                  booking.amount < 0 ? "text-red-700" : "text-green-700"
                )}>
                  {fmt(booking.amount)}
                </span>
                {flag === "ok" && <Check className="h-4 w-4 text-green-600 flex-shrink-0" />}
                {flag === "issue" && <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />}
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Keine Buchungen gefunden.
          </CardContent>
        </Card>
      )}

      {/* Vollbild-Prüfdialog */}
      <Dialog open={!!selectedBookingId} onOpenChange={(o) => !o && setSelectedBookingId(null)}>
        <DialogContent className="max-w-none w-screen h-screen p-0 gap-0 rounded-none border-0 [&>button]:hidden flex flex-col">
          {selectedBooking && (
            <>
              {/* Top bar */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={selectedIndex <= 0}
                    onClick={() => goToIndex(selectedIndex - 1)}
                    aria-label="Vorherige Buchung"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {selectedIndex + 1} / {filtered.length}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={selectedIndex >= filtered.length - 1}
                    onClick={() => goToIndex(selectedIndex + 1)}
                    aria-label="Nächste Buchung"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">Buchungsprüfung</span>
                    {bookingFlags[selectedBooking.id] === "ok" && (
                      <Badge className="bg-green-100 text-green-800 gap-1"><Check className="h-3 w-3" /> Geprüft</Badge>
                    )}
                    {bookingFlags[selectedBooking.id] === "issue" && (
                      <Badge className="bg-amber-100 text-amber-800 gap-1"><AlertTriangle className="h-3 w-3" /> Auffällig</Badge>
                    )}
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelectedBookingId(null)} aria-label="Schließen">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Two-column body */}
              <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0">
                {/* Left: Booking details + actions */}
                <div className="overflow-y-auto p-5 space-y-5 border-r">
                  <div>
                    <h3 className="text-base font-semibold mb-3">Buchungsdetails</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Datum</span>
                        <span>{new Date(selectedBooking.booking_date).toLocaleDateString("de-DE")}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Betrag</span>
                        <span className={cn("font-mono font-medium", selectedBooking.amount < 0 ? "text-red-700" : "text-green-700")}>
                          {fmt(selectedBooking.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Beschreibung</span>
                        <span className="text-right">{selectedBooking.description || "-"}</span>
                      </div>
                      {selectedBooking.chart_of_accounts && (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Konto</span>
                          <span className="text-right">
                            {selectedBooking.chart_of_accounts.account_number} {selectedBooking.chart_of_accounts.account_name}
                          </span>
                        </div>
                      )}
                      {selectedBooking.receipt_number && (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Beleg-Nr.</span>
                          <span>{selectedBooking.receipt_number}</span>
                        </div>
                      )}
                      {selectedBooking.booking_type && (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Typ</span>
                          <span>{selectedBooking.booking_type}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold mb-3">Nachweis</h3>
                    {selectedBooking.invoices ? (
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">Rechnung</span>
                        </div>
                        <div className="text-xs space-y-1 text-muted-foreground">
                          <div>Lieferant: {selectedBooking.invoices.vendor_name || "-"}</div>
                          <div>Rechnungs-Nr: {selectedBooking.invoices.invoice_number || "-"}</div>
                          <div>Bruttobetrag: {selectedBooking.invoices.gross_amount ? fmt(selectedBooking.invoices.gross_amount) : "-"}</div>
                        </div>
                      </div>
                    ) : selectedBooking.booking_templates ? (
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-1">
                          <LayoutTemplate className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">Buchungsvorlage</span>
                        </div>
                        <div className="text-xs space-y-1 text-muted-foreground">
                          <div>Name: {selectedBooking.booking_templates.name}</div>
                          <div>Lieferant: {selectedBooking.booking_templates.vendor_name || "-"}</div>
                          <div>Erwartet: {selectedBooking.booking_templates.expected_amount ? fmt(selectedBooking.booking_templates.expected_amount) : "-"}</div>
                          <div>Intervall: {selectedBooking.booking_templates.interval || "-"}</div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          Wiederkehrende Zahlung — kein Einzelbeleg vorhanden.
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border bg-muted/30 text-center text-sm text-muted-foreground">
                        Kein Beleg oder Vorlage verknüpft.
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="space-y-3 pt-3 border-t">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={bookingFlags[selectedBooking.id] === "ok" ? "default" : "outline"}
                          onClick={() => setFlag(selectedBooking.id, bookingFlags[selectedBooking.id] === "ok" ? null : "ok")}
                          className="gap-1.5"
                        >
                          <Check className="h-3.5 w-3.5" /> Geprüft
                        </Button>
                        <Button
                          size="sm"
                          variant={bookingFlags[selectedBooking.id] === "issue" ? "destructive" : "outline"}
                          onClick={() => setFlag(selectedBooking.id, bookingFlags[selectedBooking.id] === "issue" ? null : "issue")}
                          className="gap-1.5"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" /> Auffällig
                        </Button>
                      </div>
                      <Textarea
                        value={bookingNotes[selectedBooking.id] || ""}
                        onChange={(e) => setNote(selectedBooking.id, e.target.value)}
                        placeholder="Anmerkung zur Buchung..."
                        className="text-sm min-h-[80px]"
                        rows={3}
                      />
                    </div>
                  )}
                  {readOnly && bookingNotes[selectedBooking.id] && (
                    <div className="pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Anmerkung</p>
                      <p className="text-sm whitespace-pre-wrap">{bookingNotes[selectedBooking.id]}</p>
                    </div>
                  )}
                </div>

                {/* Right: PDF / Empty state */}
                <div className="bg-muted/20 min-h-0 flex flex-col">
                  {selectedBooking.invoices?.file_path ? (
                    pdfLoading ? (
                      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                        Beleg wird geladen…
                      </div>
                    ) : pdfUrl ? (
                      <iframe src={pdfUrl} className="w-full h-full border-0" title="Beleg" />
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                        Beleg konnte nicht geladen werden.
                      </div>
                    )
                  ) : selectedBooking.booking_templates ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                      <div className="text-center max-w-sm">
                        <LayoutTemplate className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                        <p className="font-medium text-sm mb-1">Wiederkehrende Buchung</p>
                        <p className="text-sm text-muted-foreground">
                          Für diese Buchung existiert kein Einzelbeleg. Der Nachweis ergibt sich aus dem hinterlegten Vertrag oder Bescheid.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-8">
                      <div className="text-center max-w-sm">
                        <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                        <p className="font-medium text-sm mb-1">Kein Beleg verknüpft</p>
                        <p className="text-sm text-muted-foreground">
                          Mit dieser Buchung ist weder eine Rechnung noch eine Buchungsvorlage verknüpft.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
