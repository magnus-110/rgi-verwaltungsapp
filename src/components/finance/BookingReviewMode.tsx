import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft, ArrowRight, CheckCircle, SkipForward, Edit, X,
  FileText, LayoutTemplate, AlertTriangle, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EditBookingDialog } from "./EditBookingDialog";
import { VendorHistorySection } from "./VendorHistorySection";
import { useMobileSplitView, MobileViewSwitcher, MobileBackToListButton } from "@/components/shared/MobileSplitView";

interface BookingReviewModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fiscalYear: string;
  buildingId?: string;
}

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

export function BookingReviewMode({ open, onOpenChange, fiscalYear, buildingId }: BookingReviewModeProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [editBooking, setEditBooking] = useState<any>(null);
  const split = useMobileSplitView();

  const { data: bookings = [], isLoading, refetch } = useQuery({
    queryKey: ["review-bookings", fiscalYear, buildingId],
    queryFn: async () => {
      let query = supabase.from("bookings")
        .select(`
          *,
          buildings(id, name, building_code),
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices!bookings_invoice_id_fkey(id, file_path, file_name, vendor_name, gross_amount, net_amount, vat_amount, invoice_number, invoice_date, description),
          booking_templates!bookings_matched_template_id_fkey(id, name, vendor_name, expected_amount, vat_rate, interval, category, description)
        `)
        .eq("fiscal_year", parseInt(fiscalYear))
        .eq("status", "pending")
        .order("building_id")
        .order("booking_date", { ascending: false });

      if (buildingId) {
        query = query.eq("building_id", buildingId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const currentBooking = bookings[currentIndex] as any;

  useEffect(() => {
    setPdfUrl(null);
    if (!currentBooking?.invoices?.file_path) return;

    const loadPdf = async () => {
      const filePath = currentBooking.invoices.file_path;
      const cleanPath = filePath.replace(/^\/+/, "").replace(/^invoices\//, "");
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    };
    loadPdf();
  }, [currentBooking?.id]);

  const handleConfirm = useCallback(async () => {
    if (!currentBooking || !user) return;
    const { error } = await supabase.from("bookings").update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
    }).eq("id", currentBooking.id);

    if (error) {
      toast.error("Fehler beim Bestätigen");
      return;
    }

    setConfirmedCount(c => c + 1);
    toast.success("Buchung bestätigt", { duration: 1500 });
    queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
    

    if (currentIndex < bookings.length - 1) {
      await refetch();
      if (currentIndex >= bookings.length - 1) {
        setCurrentIndex(Math.max(0, bookings.length - 2));
      }
    } else {
      await refetch();
      setCurrentIndex(Math.max(0, currentIndex - 1));
    }
  }, [currentBooking, user, currentIndex, bookings.length, refetch, queryClient]);

  const handleNext = useCallback(() => {
    if (currentIndex < bookings.length - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, bookings.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  useEffect(() => {
    if (!open || editBooking) return;

    let shiftOnly = false;
    const keyDownTrack = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftOnly = true;
      else if (e.shiftKey) shiftOnly = false;
      if (e.key === "ArrowRight") { e.preventDefault(); handleNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); handlePrev(); }
      if (!e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        if (currentBooking) setEditBooking(currentBooking);
      }
    };
    const keyUpTrack = (e: KeyboardEvent) => {
      if (e.key === "Shift" && shiftOnly) {
        e.preventDefault();
        handleConfirm();
      }
      shiftOnly = false;
    };

    window.addEventListener("keydown", keyDownTrack);
    window.addEventListener("keyup", keyUpTrack);
    return () => {
      window.removeEventListener("keydown", keyDownTrack);
      window.removeEventListener("keyup", keyUpTrack);
    };
  }, [open, editBooking, handleConfirm, handleNext, handlePrev, currentBooking]);

  const matches = useMemo(() => {
    if (!currentBooking) return {};
    const inv = currentBooking.invoices;
    const tmpl = currentBooking.booking_templates;
    const result: Record<string, boolean> = {};

    if (inv) {
      if (inv.gross_amount != null) result.amount = Math.abs(currentBooking.amount) === Math.abs(inv.gross_amount);
      if (inv.vendor_name && currentBooking.description) {
        result.vendor = currentBooking.description.toLowerCase().includes(inv.vendor_name.toLowerCase());
      }
    }
    if (tmpl) {
      if (tmpl.expected_amount != null) {
        const tolerance = tmpl.amount_tolerance || 0;
        const diff = Math.abs(Math.abs(currentBooking.amount) - Math.abs(tmpl.expected_amount));
        result.amount = diff <= tolerance;
      }
      if (tmpl.vat_rate != null && currentBooking.vat_rate != null) result.vat = currentBooking.vat_rate === tmpl.vat_rate;
      if (tmpl.vendor_name && currentBooking.description) {
        result.vendor = currentBooking.description.toLowerCase().includes(tmpl.vendor_name.toLowerCase());
      }
    }
    return result;
  }, [currentBooking]);

  const progressPercent = bookings.length > 0
    ? ((confirmedCount) / (confirmedCount + bookings.length)) * 100
    : 100;

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[96vw] max-h-[94vh] w-full h-[94vh] p-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">Shift</kbd>
                <span className="text-[11px]">Bestätigen</span>
                <span className="mx-1 text-border">|</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">←</kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">→</kbd>
                <span className="text-[11px]">Nav</span>
                <span className="mx-1 text-border">|</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">E</kbd>
                <span className="text-[11px]">Bearb.</span>
              </div>
              <Separator orientation="vertical" className="h-6" />
              <span className="text-sm font-medium">
                Buchung {bookings.length > 0 ? currentIndex + 1 : 0} / {bookings.length}
              </span>
              {confirmedCount > 0 && (
                <Badge variant="default" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {confirmedCount} bestätigt
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Progress value={progressPercent} className="w-40 h-2" />
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">Lade Buchungen...</div>
          ) : bookings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <CheckCircle className="h-16 w-16 opacity-30" />
              <p className="text-lg font-medium">Alle Buchungen geprüft!</p>
              <p className="text-sm">{confirmedCount} Buchungen wurden bestätigt.</p>
              <Button onClick={() => onOpenChange(false)}>Schließen</Button>
            </div>
          ) : currentBooking ? (
            <>
              <MobileViewSwitcher
                mobileView={split.mobileView}
                onChange={split.setMobileView}
                listLabel="Daten"
                detailLabel="Beleg"
              />
              <div
                className="flex-1 flex overflow-hidden"
                onTouchStart={split.touchHandlers.onTouchStart}
                onTouchEnd={split.touchHandlers.onTouchEnd}
              >
              {split.showList && (
              <div className={cn("border-r overflow-y-auto p-6 space-y-4", split.isMobile ? "w-full" : "w-1/2")}>
                {split.isMobile && (
                  <MobileBackToListButton onClick={split.openDetail} label="Zum Beleg" />
                )}
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-lg">
                    {currentBooking.buildings?.name || "Ohne Zuordnung"}
                  </h3>
                  {currentBooking.buildings?.building_code && (
                    <Badge variant="outline" className="text-xs">{currentBooking.buildings.building_code}</Badge>
                  )}
                </div>

                {currentBooking.ai_warning && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">{currentBooking.ai_warning}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Buchungsdatum" value={format(new Date(currentBooking.booking_date), "dd.MM.yyyy", { locale: de })} />
                  <DetailField label="Wirtschaftsjahr" value={String(currentBooking.fiscal_year)} />

                  <DetailField
                    label="Betrag"
                    value={
                      <span className={cn("text-3xl font-bold", currentBooking.booking_type === "income" ? "text-green-600" : "text-destructive")}>
                        {currentBooking.booking_type === "income" ? "+" : ""}{formatCurrency(currentBooking.amount)}
                      </span>
                    }
                    highlight={matches.amount}
                  />
                  <DetailField
                    label="MwSt"
                    value={currentBooking.vat_rate ? `${currentBooking.vat_rate}%` + (currentBooking.vat_amount != null ? ` (${formatCurrency(currentBooking.vat_amount)})` : "") : "–"}
                    highlight={matches.vat}
                  />

                  <DetailField
                    label="Soll-Konto"
                    value={currentBooking.chart_of_accounts ? `${currentBooking.chart_of_accounts.account_number} – ${currentBooking.chart_of_accounts.account_name}` : "–"}
                    className="col-span-2"
                  />
                  <DetailField
                    label="Gegen-Konto"
                    value={currentBooking.counter_account ? `${currentBooking.counter_account.account_number} – ${currentBooking.counter_account.account_name}` : "–"}
                    className="col-span-2"
                  />
                  <DetailField label="Buchungstext" value={currentBooking.description || "–"} className="col-span-2" highlight={matches.vendor} />
                  <DetailField label="Beleg-Nr." value={currentBooking.receipt_number || "–"} />
                  <DetailField label="Belegnummer" value={currentBooking.booking_reference || "–"} />
                  <DetailField label="§35a-relevant" value={currentBooking.is_35a_relevant ? "Ja" : "Nein"} />
                  {currentBooking.is_35a_relevant && currentBooking.amount_35a != null && (
                    <DetailField
                      label="§35a-Anteil"
                      value={<span className="font-bold">{formatCurrency(currentBooking.amount_35a)}</span>}
                    />
                  )}
                  <DetailField label="Quelle" value={currentBooking.source === "manual" ? "Manuell" : currentBooking.source === "bank_import" ? "Kontoauszug" : currentBooking.source} />
                </div>

                {currentBooking.performance_period_from && (
                  <DetailField
                    label="Leistungszeitraum"
                    value={`${format(new Date(currentBooking.performance_period_from), "dd.MM.yyyy", { locale: de })} – ${currentBooking.performance_period_to ? format(new Date(currentBooking.performance_period_to), "dd.MM.yyyy", { locale: de }) : "–"}`}
                  />
                )}

                <div className="pt-4 space-y-4">
                  <Button variant="outline" size="sm" onClick={() => setEditBooking(currentBooking)}>
                    <Edit className="h-4 w-4 mr-2" /> Bearbeiten (E)
                  </Button>
                  <VendorHistorySection booking={currentBooking} />
                </div>
              </div>
              )}

              {split.showDetail && (
              <div className={cn("flex flex-col overflow-hidden", split.isMobile ? "w-full" : "w-1/2")}>
                {split.isMobile && (
                  <div className="px-3 py-2 border-b">
                    <MobileBackToListButton onClick={split.openList} label="Zu den Daten" />
                  </div>
                )}
                {currentBooking.invoice_id && currentBooking.invoices ? (
                  <>
                    <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-2 shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Rechnung</span>
                      {currentBooking.invoices.vendor_name && (
                        <Badge variant="outline" className="text-xs">{currentBooking.invoices.vendor_name}</Badge>
                      )}
                    </div>
                    <div className="px-4 py-2 border-b space-y-1 shrink-0">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <MatchField label="Brutto" value={formatCurrency(currentBooking.invoices.gross_amount)} matched={matches.amount} />
                        {currentBooking.invoices.net_amount != null && (
                          <MatchField label="Netto" value={formatCurrency(currentBooking.invoices.net_amount)} />
                        )}
                        {currentBooking.invoices.invoice_number && (
                          <MatchField label="Re-Nr." value={currentBooking.invoices.invoice_number} />
                        )}
                        {currentBooking.invoices.invoice_date && (
                          <MatchField label="Re-Datum" value={format(new Date(currentBooking.invoices.invoice_date), "dd.MM.yyyy", { locale: de })} />
                        )}
                      </div>
                    </div>
                    {pdfUrl ? (
                      <iframe src={pdfUrl} className="flex-1 w-full border-0" title="Rechnung PDF" />
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                        PDF wird geladen...
                      </div>
                    )}
                  </>
                ) : currentBooking.matched_template_id && currentBooking.booking_templates ? (
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <LayoutTemplate className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">Buchungsvorlage</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <DetailField label="Name" value={currentBooking.booking_templates.name} />
                      {currentBooking.booking_templates.vendor_name && (
                        <DetailField label="Lieferant" value={currentBooking.booking_templates.vendor_name} highlight={matches.vendor} />
                      )}
                      {currentBooking.booking_templates.expected_amount != null && (
                        <DetailField 
                          label="Erwarteter Betrag" 
                          value={
                            currentBooking.booking_templates.amount_tolerance 
                              ? `${formatCurrency(currentBooking.booking_templates.expected_amount)} ±${formatCurrency(currentBooking.booking_templates.amount_tolerance)}`
                              : formatCurrency(currentBooking.booking_templates.expected_amount)
                          } 
                          highlight={matches.amount} 
                        />
                      )}
                      {currentBooking.booking_templates.vat_rate != null && (
                        <DetailField label="MwSt-Satz" value={`${currentBooking.booking_templates.vat_rate}%`} highlight={matches.vat} />
                      )}
                      {currentBooking.booking_templates.interval && (
                        <DetailField label="Intervall" value={currentBooking.booking_templates.interval} />
                      )}
                      {currentBooking.booking_templates.category && (
                        <DetailField label="Kategorie" value={currentBooking.booking_templates.category} />
                      )}
                      {currentBooking.booking_templates.description && (
                        <DetailField label="Beschreibung" value={currentBooking.booking_templates.description} />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <FileText className="h-12 w-12 opacity-20" />
                    <p className="text-sm">Keine Rechnung oder Vorlage verknüpft</p>
                  </div>
                )}
              </div>
              )}
              </div>
            </>
          ) : null}

          {bookings.length > 0 && currentBooking && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentIndex === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={currentIndex >= bookings.length - 1}
                >
                  <SkipForward className="h-4 w-4 mr-1" /> Überspringen
                </Button>
                <Button
                  onClick={handleConfirm}
                  className="min-w-[200px]"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Bestätigen & Weiter
                  <Badge variant="secondary" className="ml-2 text-xs bg-primary-foreground/20">Shift</Badge>
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={currentIndex >= bookings.length - 1}
              >
                Weiter <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditBookingDialog
        open={!!editBooking}
        onOpenChange={(open) => {
          if (!open) {
            setEditBooking(null);
            refetch();
          }
        }}
        booking={editBooking}
        buildingName={editBooking?.buildings?.name || ""}
      />
    </>
  );
}

function DetailField({ label, value, highlight, className }: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(
      "space-y-0.5 p-2 rounded-md",
      highlight === true && "bg-green-50 dark:bg-green-950/20 ring-1 ring-green-300 dark:ring-green-700",
      highlight === false && "bg-red-50 dark:bg-red-950/20 ring-1 ring-red-300 dark:ring-red-700",
      className
    )}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div>{value}</div>
    </div>
  );
}

function MatchField({ label, value, matched }: {
  label: string;
  value: React.ReactNode;
  matched?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between px-2 py-1 rounded",
      matched === true && "bg-green-50 dark:bg-green-950/20",
      matched === false && "bg-red-50 dark:bg-red-950/20",
    )}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium flex items-center gap-1">
        {value}
        {matched === true && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
      </span>
    </div>
  );
}
