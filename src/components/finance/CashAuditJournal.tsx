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
}

export function CashAuditJournal({ buildingId, fiscalYear, progress, onProgressChange, readOnly }: CashAuditJournalProps) {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: bookings = [] } = useQuery({
    queryKey: ["audit-journal", buildingId, fiscalYear],
    queryFn: async () => {
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

  const openInvoicePdf = async (filePath: string) => {
    const { data } = await supabase.storage.from("invoices").createSignedUrl(filePath, 300);
    if (data?.signedUrl) setPdfUrl(data.signedUrl);
  };

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

      {/* Booking review dialog */}
      <Dialog open={!!selectedBookingId} onOpenChange={(o) => !o && setSelectedBookingId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">Buchungsprüfung</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Booking details */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Buchungsdetails</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Datum</span>
                      <span>{new Date(selectedBooking.booking_date).toLocaleDateString("de-DE")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Betrag</span>
                      <span className="font-mono font-medium">{fmt(selectedBooking.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Beschreibung</span>
                      <span className="text-right max-w-[200px]">{selectedBooking.description || "-"}</span>
                    </div>
                    {selectedBooking.chart_of_accounts && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Konto</span>
                        <span>{selectedBooking.chart_of_accounts.account_number} {selectedBooking.chart_of_accounts.account_name}</span>
                      </div>
                    )}
                    {selectedBooking.receipt_number && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Beleg-Nr.</span>
                        <span>{selectedBooking.receipt_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Source document */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Nachweis</h4>
                  {selectedBooking.invoices ? (
                    <div className="space-y-2">
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
                        {selectedBooking.invoices.file_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 w-full gap-1.5"
                            onClick={() => openInvoicePdf(selectedBooking.invoices.file_path)}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Rechnung anzeigen
                          </Button>
                        )}
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
                        Wiederkehrende Zahlung — kein Einzelbeleg vorhanden. Der Beleg ergibt sich aus dem Vertrag/Bescheid.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border bg-muted/30 text-center text-sm text-muted-foreground">
                      Kein Beleg oder Vorlage verknüpft.
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {!readOnly && (
                <div className="space-y-3 pt-3 border-t mt-3">
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
                    className="text-xs min-h-[60px]"
                    rows={2}
                  />
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {pdfUrl && <PdfViewerModal isOpen={!!pdfUrl} onClose={() => setPdfUrl(null)} documentUrl={pdfUrl} documentName="Rechnung" />}
    </div>
  );
}
