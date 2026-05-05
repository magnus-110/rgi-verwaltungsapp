import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, AlertTriangle, FileText, LayoutTemplate, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AuditBookingRow {
  id: string;
  booking_date: string;
  description: string | null;
  amount: number;
  booking_type: string | null;
  receipt_number: string | null;
  account_id?: string | null;
  counter_account_id?: string | null;
  amount_35a?: number | null;
  is_35a_relevant?: boolean | null;
  chart_of_accounts?: { account_number: string; account_name: string } | null;
  counter_account?: { account_number: string; account_name: string } | null;
  invoices?: { id: string; vendor_name?: string | null; file_path?: string | null; gross_amount?: number | null; invoice_number?: string | null } | null;
  booking_templates?: { id: string; name: string; expected_amount?: number | null; interval?: string | null; vendor_name?: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings: AuditBookingRow[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  flag?: "ok" | "issue" | null;
  setFlag?: (id: string, f: "ok" | "issue" | null) => void;
  note?: string;
  setNote?: (id: string, note: string) => void;
  readOnly?: boolean;
}

const fmt = (n?: number | null) =>
  n == null ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function BookingReviewDialog({
  open, onOpenChange, bookings, selectedId, setSelectedId,
  flag, setFlag, note, setNote, readOnly,
}: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const idx = bookings.findIndex((b) => b.id === selectedId);
  const booking = idx >= 0 ? bookings[idx] : null;

  useEffect(() => {
    setPdfUrl(null);
    if (!booking?.invoices?.file_path) return;
    let cancelled = false;
    setPdfLoading(true);
    (async () => {
      const cleanPath = booking.invoices!.file_path!.replace(/^\/+/, "").replace(/^invoices\//, "");
      const { data } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (!cancelled && data?.signedUrl) setPdfUrl(data.signedUrl);
      if (!cancelled) setPdfLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedId, booking?.invoices?.file_path]);

  const goTo = (i: number) => {
    if (i < 0 || i >= bookings.length) return;
    setSelectedId(bookings[i].id);
  };

  if (!booking) return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent /></Dialog>
  );
  const acc = booking.chart_of_accounts;
  const counter = booking.counter_account;
  const isIncome = booking.booking_type === "income";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen p-0 gap-0 rounded-none border-0 [&>button]:hidden flex flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={idx <= 0} onClick={() => goTo(idx - 1)} aria-label="Vorherige">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">{idx + 1} / {bookings.length}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={idx >= bookings.length - 1} onClick={() => goTo(idx + 1)} aria-label="Nächste">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-sm font-medium truncate">Buchungsprüfung</span>
            {flag === "ok" && <Badge className="bg-green-100 text-green-800 gap-1"><Check className="h-3 w-3" /> Geprüft</Badge>}
            {flag === "issue" && <Badge className="bg-amber-100 text-amber-800 gap-1"><AlertTriangle className="h-3 w-3" /> Auffällig</Badge>}
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onOpenChange(false)} aria-label="Schließen">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0">
          {/* Left: details */}
          <div className="overflow-y-auto p-5 space-y-5 border-r">
            <div>
              <h3 className="text-base font-semibold mb-3">Buchungsdetails</h3>
              <div className="rounded-lg border bg-card divide-y text-sm">
                <Row label="Datum" value={new Date(booking.booking_date).toLocaleDateString("de-DE")} />
                <Row label="Betrag" value={
                  <span className={cn("font-mono font-semibold", isIncome ? "text-green-700" : "text-red-700")}>
                    {isIncome ? "+" : "−"}{fmt(Math.abs(booking.amount))}
                  </span>
                } />
                <Row label="Buchungstext" value={<span className="text-right">{booking.description || "–"}</span>} />
                {acc && <Row label="Konto" value={<span className="text-right">{acc.account_number} {acc.account_name}</span>} />}
                {counter && <Row label="Gegenkonto" value={<span className="text-right">{counter.account_number} {counter.account_name}</span>} />}
                {booking.receipt_number && <Row label="Beleg-Nr." value={booking.receipt_number} />}
                <Row label="Typ" value={isIncome ? "Einnahme" : "Ausgabe"} />
                {booking.is_35a_relevant && (
                  <Row label="§35a Anteil" value={<span className="font-mono text-emerald-700">{fmt(booking.amount_35a ?? 0)}</span>} />
                )}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold mb-3">Nachweis</h3>
              {booking.invoices ? (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Rechnung</span>
                  </div>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <div>Lieferant: {booking.invoices.vendor_name || "–"}</div>
                    <div>Rechnungs-Nr: {booking.invoices.invoice_number || "–"}</div>
                    <div>Bruttobetrag: {fmt(booking.invoices.gross_amount)}</div>
                  </div>
                </div>
              ) : booking.booking_templates ? (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <LayoutTemplate className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Buchungsvorlage</span>
                  </div>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <div>Name: {booking.booking_templates.name}</div>
                    <div>Lieferant: {booking.booking_templates.vendor_name || "–"}</div>
                    <div>Erwartet: {fmt(booking.booking_templates.expected_amount)}</div>
                    <div>Intervall: {booking.booking_templates.interval || "–"}</div>
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

            {!readOnly && setFlag && (
              <div className="space-y-3 pt-3 border-t">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={flag === "ok" ? "default" : "outline"}
                    onClick={() => setFlag(booking.id, flag === "ok" ? null : "ok")}
                    className={cn("gap-1.5", flag === "ok" && "bg-green-600 hover:bg-green-700 text-white")}
                  >
                    <Check className="h-3.5 w-3.5" /> Geprüft
                  </Button>
                  <Button
                    size="sm"
                    variant={flag === "issue" ? "default" : "outline"}
                    onClick={() => setFlag(booking.id, flag === "issue" ? null : "issue")}
                    className={cn("gap-1.5", flag === "issue" && "bg-amber-500 hover:bg-amber-600 text-white")}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Auffällig
                  </Button>
                </div>
                {setNote && (
                  <Textarea
                    value={note || ""}
                    onChange={(e) => setNote(booking.id, e.target.value)}
                    placeholder="Anmerkung zur Buchung..."
                    className="text-sm min-h-[80px]"
                    rows={3}
                  />
                )}
              </div>
            )}
            {readOnly && note && (
              <div className="pt-3 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1">Anmerkung</p>
                <p className="text-sm whitespace-pre-wrap">{note}</p>
              </div>
            )}
          </div>

          {/* Right: PDF / template card */}
          <div className="bg-muted/20 min-h-0 flex flex-col">
            {booking.invoices?.file_path ? (
              pdfLoading ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Beleg wird geladen…</div>
              ) : pdfUrl ? (
                <iframe src={pdfUrl} className="w-full h-full border-0" title="Beleg" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Beleg konnte nicht geladen werden.</div>
              )
            ) : booking.booking_templates ? (
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
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
