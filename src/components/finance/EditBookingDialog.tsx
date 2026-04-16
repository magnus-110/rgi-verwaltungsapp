import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, LayoutTemplate, Building2, X, AlertTriangle, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { VendorHistorySection } from "./VendorHistorySection";

interface Booking {
  id: string;
  building_id: string;
  account_id: string | null;
  counter_account_id: string | null;
  booking_date: string;
  amount: number;
  description: string | null;
  fiscal_year: number;
  performance_period_from: string | null;
  performance_period_to: string | null;
  booking_type: string | null;
  receipt_number: string | null;
  booking_reference: string | null;
  vat_rate: number | null;
  vat_amount: number | null;
  is_35a_relevant: boolean | null;
  status: string;
  source: string;
  ai_warning: string | null;
  invoice_id: string | null;
  invoices?: { id: string; file_path: string | null; file_name: string | null; vendor_name: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
  buildingName: string;
  onInvoiceClick?: (booking: any) => void;
}

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

export function EditBookingDialog({ open, onOpenChange, booking, buildingName }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Load account names
  const buildingId = booking?.building_id;
  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", buildingId],
    queryFn: async () => {
      let query = supabase.from("chart_of_accounts").select("*");
      if (buildingId) {
        query = query.or(`building_id.is.null,building_id.eq.${buildingId}`);
      }
      const { data, error } = await query.order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: open && !!buildingId,
  });

  // Load invoice details
  const { data: invoiceDetail } = useQuery({
    queryKey: ["edit-booking-invoice", booking?.invoice_id],
    queryFn: async () => {
      if (!booking?.invoice_id) return null;
      const { data } = await supabase
        .from("invoices")
        .select("id, file_path, file_name, vendor_name, gross_amount, net_amount, vat_amount, invoice_number, invoice_date, description")
        .eq("id", booking.invoice_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!booking?.invoice_id,
  });

  // Load template details
  const { data: templateDetail } = useQuery({
    queryKey: ["edit-booking-template", (booking as any)?.matched_template_id],
    queryFn: async () => {
      if (!(booking as any)?.matched_template_id) return null;
      const { data } = await supabase
        .from("booking_templates")
        .select("id, name, vendor_name, expected_amount, amount_tolerance, vat_rate, interval, category, description, account_id, is_35a_relevant")
        .eq("id", (booking as any).matched_template_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!(booking as any)?.matched_template_id,
  });

  // Load PDF URL for invoice
  useEffect(() => {
    setPdfUrl(null);
    if (!invoiceDetail?.file_path) return;
    const loadPdf = async () => {
      const cleanPath = invoiceDetail.file_path!.replace(/^\/+/, "").replace(/^invoices\//, "");
      const { data } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    };
    loadPdf();
  }, [invoiceDetail?.file_path]);

  const getAccountLabel = (id: string | null) => {
    if (!id) return "–";
    const a = accounts.find(acc => acc.id === id);
    return a ? `${a.account_number} – ${a.account_name}` : "–";
  };

  if (!booking) return null;

  const hasInvoice = !!invoiceDetail;
  const hasTemplate = !!templateDetail;
  const hasRightPanel = hasInvoice || hasTemplate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[94vh] p-0 flex flex-col overflow-hidden",
          hasRightPanel ? "max-w-[96vw] w-full h-[94vh]" : "max-w-2xl"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-base">Buchungsdetails</h3>
              <p className="text-xs text-muted-foreground">
                {buildingName} · Wirtschaftsjahr {booking.fiscal_year}
                {booking.source !== "manual" && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {booking.source === "ocr" ? "OCR" : booking.source === "bank_import" ? "Kontoauszug" : booking.source}
                  </Badge>
                )}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Main content */}
        <div className={cn("flex-1 flex overflow-hidden", !hasRightPanel && "flex-col")}>
          {/* Left panel - Read-only details */}
          <div className={cn(
            "overflow-y-auto p-6 space-y-4",
            hasRightPanel ? "w-1/2 border-r" : "flex-1"
          )}>
            {/* AI Warning */}
            {booking.ai_warning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2 items-start">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">{booking.ai_warning}</p>
              </div>
            )}

            {/* Review flag */}
            {(booking as any).needs_review && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3 flex gap-3 items-start">
                <Flag className="h-4 w-4 text-orange-500 fill-orange-500 mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-200">Zur Prüfung markiert</p>
                  {(booking as any).review_note && (
                    <p className="text-sm text-orange-700 dark:text-orange-300">{(booking as any).review_note}</p>
                  )}
                </div>
              </div>
            )}

            {/* Booking details grid */}
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Buchungsdatum" value={format(new Date(booking.booking_date), "dd.MM.yyyy", { locale: de })} />
              <DetailField label="Wirtschaftsjahr" value={String(booking.fiscal_year)} />

              <DetailField
                label="Betrag"
                value={
                  <span className={cn("text-lg font-bold", booking.booking_type === "income" ? "text-green-600" : "")}>
                    {booking.booking_type === "income" ? "+" : ""}{formatCurrency(booking.amount)}
                  </span>
                }
              />
              <DetailField
                label="MwSt"
                value={booking.vat_rate ? `${booking.vat_rate}%` + (booking.vat_amount != null ? ` (${formatCurrency(booking.vat_amount)})` : "") : "–"}
              />

              <DetailField
                label="Soll-Konto"
                value={getAccountLabel(booking.account_id)}
                className="col-span-2"
              />
              <DetailField
                label="Gegen-Konto"
                value={getAccountLabel(booking.counter_account_id)}
                className="col-span-2"
              />

              <DetailField label="Buchungstext" value={booking.description || "–"} className="col-span-2" />
              <DetailField label="Beleg-Nr." value={booking.receipt_number || "–"} />
              <DetailField label="Buchungskürzel" value={booking.booking_reference || "–"} />

              <DetailField label="§35a-relevant" value={booking.is_35a_relevant ? "Ja" : "Nein"} />
              {booking.is_35a_relevant && (booking as any).amount_35a != null && (
                <DetailField
                  label="§35a-Anteil"
                  value={<span className="font-bold">{formatCurrency((booking as any).amount_35a)}</span>}
                />
              )}

              <DetailField
                label="Quelle"
                value={booking.source === "manual" ? "Manuell" : booking.source === "bank_import" ? "Kontoauszug" : booking.source === "ocr" ? "OCR" : booking.source}
              />
              <DetailField
                label="Status"
                value={
                  <Badge variant={booking.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                    {booking.status === "confirmed" ? "Bestätigt" : booking.status === "pending" ? "Offen" : booking.status}
                  </Badge>
                }
              />
            </div>

            {booking.performance_period_from && (
              <DetailField
                label="Leistungszeitraum"
                value={`${format(new Date(booking.performance_period_from), "dd.MM.yyyy", { locale: de })} – ${booking.performance_period_to ? format(new Date(booking.performance_period_to), "dd.MM.yyyy", { locale: de }) : "–"}`}
              />
            )}

            {/* Vendor History */}
            <div className="pt-2">
              <VendorHistorySection booking={booking} />
            </div>
          </div>

          {/* Right panel - Invoice PDF or Template details */}
          {hasRightPanel && (
            <div className="w-1/2 flex flex-col overflow-hidden">
              {hasInvoice ? (
                <>
                  <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-2 shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Rechnung</span>
                    {invoiceDetail.vendor_name && (
                      <Badge variant="outline" className="text-xs">{invoiceDetail.vendor_name}</Badge>
                    )}
                  </div>
                  <div className="px-4 py-2 border-b space-y-1 shrink-0">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <MatchField label="Brutto" value={formatCurrency(invoiceDetail.gross_amount)} />
                      {invoiceDetail.net_amount != null && (
                        <MatchField label="Netto" value={formatCurrency(invoiceDetail.net_amount)} />
                      )}
                      {invoiceDetail.invoice_number && (
                        <MatchField label="Re-Nr." value={invoiceDetail.invoice_number} />
                      )}
                      {invoiceDetail.invoice_date && (
                        <MatchField label="Re-Datum" value={format(new Date(invoiceDetail.invoice_date), "dd.MM.yyyy", { locale: de })} />
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
              ) : hasTemplate ? (
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <LayoutTemplate className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Buchungsvorlage</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <DetailField label="Name" value={templateDetail.name} />
                    {templateDetail.vendor_name && (
                      <DetailField label="Lieferant" value={templateDetail.vendor_name} />
                    )}
                    {templateDetail.expected_amount != null && (
                      <DetailField
                        label="Erwarteter Betrag"
                        value={
                          templateDetail.amount_tolerance
                            ? `${formatCurrency(templateDetail.expected_amount)} ±${formatCurrency(templateDetail.amount_tolerance)}`
                            : formatCurrency(templateDetail.expected_amount)
                        }
                      />
                    )}
                    {templateDetail.vat_rate != null && (
                      <DetailField label="MwSt-Satz" value={`${templateDetail.vat_rate}%`} />
                    )}
                    {templateDetail.interval && (
                      <DetailField label="Intervall" value={templateDetail.interval} />
                    )}
                    {templateDetail.category && (
                      <DetailField label="Kategorie" value={templateDetail.category} />
                    )}
                    {templateDetail.description && (
                      <DetailField label="Beschreibung" value={templateDetail.description} />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value, className }: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5 p-2 rounded-md bg-muted/30", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function MatchField({ label, value }: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
