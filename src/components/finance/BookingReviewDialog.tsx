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
  invoice_id?: string | null;
  split_part?: number | null;
  split_parts_total?: number | null;
  chart_of_accounts?: { account_number: string; account_name: string } | null;
  counter_account?: { account_number: string; account_name: string } | null;
  invoices?: { id: string; vendor_name?: string | null; file_path?: string | null; gross_amount?: number | null; invoice_number?: string | null } | null;
  booking_templates?: { id: string; name: string; expected_amount?: number | null; interval?: string | null; vendor_name?: string | null } | null;
}

interface SplitSibling {
  id: string;
  amount: number;
  booking_type: string | null;
  description: string | null;
  split_part: number | null;
  chart_of_accounts: { account_number: string; account_name: string } | null;
  counter_account: { account_number: string; account_name: string } | null;
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
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<SplitSibling[] | null>(null);
  const [siblingsLoading, setSiblingsLoading] = useState(false);

  const idx = bookings.findIndex((b) => b.id === selectedId);
  const booking = idx >= 0 ? bookings[idx] : null;

  useEffect(() => {
    setPdfUrl(null);
    setPdfError(null);
    if (!booking?.invoices?.file_path) return;
    let cancelled = false;
    setPdfLoading(true);
    (async () => {
      const raw = booking.invoices!.file_path!;
      const cleanPath = raw.startsWith("invoices/")
        ? raw.slice("invoices/".length)
        : raw.replace(/^\/+/, "");
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setPdfError(error?.message || "Signed URL leer");
        console.warn("[BookingReviewDialog] signed URL failed", { cleanPath, error });
      } else {
        setPdfUrl(data.signedUrl);
      }
      setPdfLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedId, booking?.invoices?.file_path]);

  // Lade Geschwister sobald invoice_id existiert (auch ohne split_parts_total),
  // damit Altbestand-Splits erkannt werden.
  useEffect(() => {
    setSiblings(null);
    if (!booking?.invoice_id) return;
    let cancelled = false;
    setSiblingsLoading(true);
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select(`
          id, amount, booking_type, description, split_part,
          chart_of_accounts:account_id(account_number, account_name),
          counter_account:counter_account_id(account_number, account_name)
        `)
        .eq("invoice_id", booking.invoice_id)
        .order("split_part", { ascending: true });
      if (!cancelled) {
        setSiblings((data as any) || []);
        setSiblingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [booking?.id, booking?.invoice_id]);

  const isSplit =
    !!(booking?.split_parts_total && booking.split_parts_total > 1) ||
    (siblings ? siblings.length > 1 : false);


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
                {isSplit && (
                  <div className="px-3 py-2 bg-muted/30 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-foreground">
                        Splitbuchung{" "}
                        {booking.split_part ?? (siblings ? siblings.findIndex(s => s.id === booking.id) + 1 || "?" : "?")}
                        {" von "}
                        {booking.split_parts_total ?? siblings?.length ?? "?"}
                      </span>
                      {siblings && siblings.length > 0 && (
                        <span className="text-muted-foreground">
                          Gesamt: <span className="font-mono font-semibold text-foreground">
                            {fmt(siblings.reduce((s, x) => s + Math.abs(Number(x.amount) || 0), 0))}
                          </span>
                        </span>
                      )}
                    </div>
                    {siblingsLoading && (
                      <div className="text-xs text-muted-foreground italic">Lade Splitteile…</div>
                    )}
                    {siblings && siblings.length > 0 && (
                      <ul className="space-y-0.5">
                        {siblings.map((s) => {
                          const isCurrent = s.id === booking.id;
                          const sIncome = s.booking_type === "income";
                          const acct = s.chart_of_accounts;
                          return (
                            <li
                              key={s.id}
                              className={cn(
                                "flex justify-between items-baseline gap-3 text-xs tabular-nums",
                                isCurrent ? "font-medium text-foreground" : "opacity-[0.38]"
                              )}
                            >
                              <span className="truncate">
                                Teil {s.split_part ?? "?"}
                                {acct ? ` · ${acct.account_number} ${acct.account_name}` : ""}
                              </span>
                              <span className={cn("font-mono whitespace-nowrap", sIncome ? "text-green-700" : "text-red-700")}>
                                {sIncome ? "+" : "−"}{fmt(Math.abs(Number(s.amount) || 0))}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
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
            {(acc?.account_number === "4020" || counter?.account_number === "4020") ? (
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-xl mx-auto space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-6 w-6 text-primary" />
                    <h3 className="text-lg font-semibold">Sollstellung Abrechnungsergebnis (Konto 4020)</h3>
                  </div>
                  <div className="rounded-lg border bg-card p-4 text-sm space-y-3">
                    <p>
                      Dies ist <strong>keine Zahlung</strong>, sondern eine reine <strong>Sollstellung</strong> aus der Jahresabrechnung.
                      Konto 4020 erfasst die <strong>Guthaben bzw. Nachzahlungen</strong> einzelner Eigentümer/Mieter, die sich aus der
                      Abrechnung ergeben.
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><strong>Nachzahlung</strong>: Belastung des Personenkontos – der Eigentümer schuldet noch Geld.</li>
                      <li><strong>Guthaben</strong>: Gutschrift auf dem Personenkonto – der Eigentümer bekommt Geld zurück.</li>
                    </ul>
                    <p className="text-muted-foreground">
                      Es gibt deshalb <strong>keinen Beleg und keine Buchungsvorlage</strong>. Der Nachweis ist die genehmigte Jahresabrechnung
                      des betreffenden Wirtschaftsjahres.
                    </p>
                  </div>
                </div>
              </div>
            ) : booking.invoices?.file_path ? (
              pdfLoading ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Beleg wird geladen…</div>
              ) : pdfUrl ? (
                <iframe src={pdfUrl} className="w-full h-full border-0" title="Beleg" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Beleg konnte nicht geladen werden.</div>
              )
            ) : booking.invoices ? (
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-xl mx-auto space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-6 w-6 text-primary" />
                    <h3 className="text-lg font-semibold">Rechnung</h3>
                  </div>
                  <div className="rounded-lg border bg-card divide-y">
                    <Row label="Lieferant" value={booking.invoices.vendor_name || "–"} />
                    <Row label="Rechnungs-Nr." value={booking.invoices.invoice_number || "–"} />
                    <Row label="Bruttobetrag" value={<span className="font-mono">{fmt(booking.invoices.gross_amount)}</span>} />
                  </div>
                  <p className="text-xs text-muted-foreground italic">Kein PDF-Beleg hinterlegt.</p>
                </div>
              </div>
            ) : booking.booking_templates ? (
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-xl mx-auto space-y-4">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="h-6 w-6 text-primary" />
                    <h3 className="text-lg font-semibold">Zugeordnete Vorlage</h3>
                  </div>
                  <div className="rounded-lg border bg-card divide-y">
                    <Row label="Name" value={booking.booking_templates.name} />
                    <Row label="Lieferant" value={booking.booking_templates.vendor_name || "–"} />
                    <Row label="Erwarteter Betrag" value={<span className="font-mono">{fmt(booking.booking_templates.expected_amount)}</span>} />
                    <Row label="Intervall" value={booking.booking_templates.interval || "–"} />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Wiederkehrende Buchung</p>
                    Für diese Buchung existiert kein Einzelbeleg. Der Nachweis ergibt sich aus dem hinterlegten Vertrag oder Bescheid.
                  </div>
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
