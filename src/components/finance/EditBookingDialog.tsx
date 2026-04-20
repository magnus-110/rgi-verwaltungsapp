import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountSearchSelect } from "./AccountSearchSelect";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle, FileText, LayoutTemplate, Building2, X, AlertTriangle, Flag, Flame, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { VendorHistorySection } from "./VendorHistorySection";
import { Section35aEditor } from "./Section35aEditor";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [show35aDialog, setShow35aDialog] = useState(false);

  // Form state
  const [form, setForm] = useState({
    account_id: "",
    counter_account_id: "",
    booking_date: "",
    amount: "",
    description: "",
    booking_type: "expense",
    receipt_number: "",
    booking_reference: "",
    vat_rate: "19",
    is_35a_relevant: false,
    fiscal_year: "",
    amount_35a: "",
    line_items_detail: null as any[] | null,
    is_fuel_purchase: false,
    fuel_type: "",
    fuel_quantity: "",
    fuel_total_price: "",
    fuel_date: "",
  });

  useEffect(() => {
    if (open && booking) {
      setForm({
        account_id: booking.account_id || "",
        counter_account_id: booking.counter_account_id || "",
        booking_date: booking.booking_date,
        amount: String(Math.abs(booking.amount)),
        description: booking.description || "",
        booking_type: booking.booking_type || "expense",
        receipt_number: booking.receipt_number || "",
        booking_reference: booking.booking_reference || "",
        vat_rate: String(booking.vat_rate ?? 19),
        is_35a_relevant: booking.is_35a_relevant ?? false,
        fiscal_year: String(booking.fiscal_year),
        amount_35a: (booking as any).amount_35a != null ? String((booking as any).amount_35a) : "",
        line_items_detail: (booking as any).line_items_detail || null,
        is_fuel_purchase: false,
        fuel_type: "",
        fuel_quantity: "",
        fuel_total_price: "",
        fuel_date: "",
      });
    }
  }, [open, booking]);

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
        .select("id, file_path, file_name, vendor_name, gross_amount, net_amount, vat_amount, invoice_number, invoice_date, description, line_items")
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
        .select("id, name, vendor_name, expected_amount, amount_tolerance, vat_rate, interval, category, description")
        .eq("id", (booking as any).matched_template_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!(booking as any)?.matched_template_id,
  });

  // Load PDF URL
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

  const computedVat = useMemo(() => {
    const amt = parseFloat(form.amount) || 0;
    const rate = parseFloat(form.vat_rate) || 0;
    return rate > 0 ? (amt - amt / (1 + rate / 100)).toFixed(2) : "0.00";
  }, [form.amount, form.vat_rate]);

  const set = (key: string, value: string | boolean | number) => setForm(p => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!booking) return;
    if (!form.account_id || !form.amount || !form.booking_date) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("bookings").update({
      account_id: form.account_id,
      counter_account_id: form.counter_account_id || null,
      booking_date: form.booking_date,
      amount: parseFloat(form.amount),
      description: form.description || null,
      booking_type: form.booking_type,
      receipt_number: form.receipt_number || null,
      booking_reference: form.booking_reference || null,
      vat_rate: parseFloat(form.vat_rate),
      vat_amount: parseFloat(computedVat),
      is_35a_relevant: form.is_35a_relevant,
      fiscal_year: parseInt(form.fiscal_year),
      amount_35a: form.amount_35a ? parseFloat(form.amount_35a) : null,
      line_items_detail: form.line_items_detail,
    }).eq("id", booking.id);
    setSaving(false);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Buchung gespeichert");
    onOpenChange(false);
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0] as string;
      return key.startsWith("bookings");
    }});
  };

  const invoiceLineItems = useMemo(() => {
    if (!invoiceDetail?.line_items) return [];
    const items = (invoiceDetail as any).line_items;
    if (Array.isArray(items)) return items;
    return [];
  }, [invoiceDetail]);

  if (!booking) return null;

  const hasInvoice = !!invoiceDetail;
  const hasTemplate = !!templateDetail;
  const hasRightPanel = hasInvoice || hasTemplate;
  const counterAccount = accounts.find((a: any) => a.id === form.counter_account_id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "max-h-[94vh] p-0 flex flex-col overflow-hidden [&>button.absolute]:hidden",
            hasRightPanel ? "max-w-[96vw] w-full h-[94vh]" : "max-w-xl"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-semibold text-base">Buchung bearbeiten</h3>
                <p className="text-xs text-muted-foreground">
                  {buildingName} · {booking.fiscal_year}
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

          <div className={cn("flex-1 flex overflow-hidden", !hasRightPanel && "flex-col")}>
            {/* Left: Booking form */}
            <div className={cn("overflow-y-auto", hasRightPanel ? "w-1/2 border-r" : "flex-1")}>
              <div className="p-4 space-y-3">
                {/* AI Warning */}
                {booking.ai_warning && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">{booking.ai_warning}</p>
                  </div>
                )}

                {/* Review flag */}
                {(booking as any).needs_review && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
                    <Flag className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <p className="text-xs font-medium text-orange-800 dark:text-orange-200">Zur Prüfung markiert</p>
                    {(booking as any).review_note && (
                      <p className="text-xs text-orange-700 dark:text-orange-300 ml-1">{(booking as any).review_note}</p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto h-7 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900"
                      onClick={async () => {
                        if (!booking) return;
                        const { error } = await supabase
                          .from("bookings")
                          .update({ needs_review: false })
                          .eq("id", booking.id);
                        if (error) { toast.error("Fehler: " + error.message); return; }
                        toast.success("Prüfung erledigt");
                        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("bookings") });
                        onOpenChange(false);
                      }}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Prüfung erledigt
                    </Button>
                  </div>
                )}

                {/* Konto */}
                <div>
                  <label className="text-xs font-bold text-primary mb-1 block">Konto</label>
                  <AccountSearchSelect
                    value={form.account_id}
                    onChange={v => {
                      set("account_id", v);
                      const acc = accounts.find(a => a.id === v);
                      if (acc?.is_35a_relevant) set("is_35a_relevant", true);
                      if (acc && (acc as any).default_vat_rate != null) set("vat_rate", String((acc as any).default_vat_rate));
                    }}
                    accounts={accounts}
                    excludeCategory="Bankkonto"
                    placeholder="Konto suchen…"
                  />
                </div>

                {/* Amount + type */}
                <div className="flex items-center gap-1">
                  <Input
                    type="text" inputMode="decimal"
                    className={cn(
                      "h-14 flex-1 border-none shadow-none px-0 !text-4xl md:!text-4xl font-bold focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                      form.booking_type === "income" ? "text-green-600" : "text-destructive"
                    )}
                    value={`${form.booking_type === "income" ? "+" : "−"}${form.amount}`}
                    onChange={e => {
                      const digits = e.target.value.replace(/[^0-9.,]/g, "");
                      set("amount", digits);
                    }}
                    onKeyDown={e => {
                      if (e.key === "+" || e.key === "-") {
                        e.preventDefault();
                        set("booking_type", e.key === "+" ? "income" : "expense");
                        return;
                      }
                      const input = e.target as HTMLInputElement;
                      if (e.key === "Backspace" && input.selectionStart !== null && input.selectionStart <= 1 && input.selectionEnd !== null && input.selectionEnd <= 1) {
                        e.preventDefault();
                        return;
                      }
                      if (e.key === "Delete" && input.selectionStart === 0) {
                        e.preventDefault();
                        return;
                      }
                    }}
                    onClick={e => {
                      const input = e.target as HTMLInputElement;
                      if (input.selectionStart !== null && input.selectionStart < 1) {
                        input.setSelectionRange(1, 1);
                      }
                    }}
                  />
                  <Button type="button" size="icon" variant={form.booking_type === "expense" ? "default" : "outline"}
                    className={cn("h-8 w-8 shrink-0 text-sm font-bold", form.booking_type === "expense" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                    onClick={() => set("booking_type", "expense")}>−</Button>
                  <Button type="button" size="icon" variant={form.booking_type === "income" ? "default" : "outline"}
                    className={cn("h-8 w-8 shrink-0 text-sm font-bold", form.booking_type === "income" && "bg-green-600 hover:bg-green-700 text-white")}
                    onClick={() => set("booking_type", "income")}>+</Button>
                </div>
                {parseFloat(computedVat) > 0 && form.vat_rate && (
                  <p className="text-xs text-muted-foreground">davon MwSt: {formatCurrency(parseFloat(computedVat))} ({form.vat_rate}%)</p>
                )}

                {/* Gegenkonto */}
                <div>
                  <label className="text-xs font-bold text-primary mb-1 block">Gegenkonto</label>
                  <AccountSearchSelect
                    value={form.counter_account_id}
                    onChange={v => {
                      set("counter_account_id", v);
                      const acc = accounts.find((a: any) => a.id === v);
                      if (acc?.account_number?.startsWith("4")) set("vat_rate", "");
                    }}
                    accounts={accounts}
                    placeholder="Gegenkonto suchen…"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Buchungstext</label>
                  <Input className="h-9 text-sm" value={form.description} onChange={e => set("description", e.target.value)} />
                </div>

                {/* Compact row */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Belegnummer</label>
                    <Input className="h-8 text-xs font-mono" value={form.booking_reference} onChange={e => set("booking_reference", e.target.value)} placeholder="MM/JJ" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Beleg-Datum</label>
                    <Input type="date" className="h-8 text-xs" value={form.booking_date}
                      onChange={e => {
                        const val = e.target.value;
                        setForm(prev => {
                          const fmt = (d: string) => {
                            if (!d) return "";
                            const dt = new Date(d);
                            if (isNaN(dt.getTime())) return "";
                            return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getFullYear()).slice(-2)}`;
                          };
                          const oldRef = fmt(prev.booking_date);
                          const newRef = fmt(val);
                          const shouldUpdateRef = !prev.booking_reference || prev.booking_reference === oldRef;
                          return {
                            ...prev,
                            booking_date: val,
                            fiscal_year: val ? String(new Date(val).getFullYear()) : prev.fiscal_year,
                            booking_reference: shouldUpdateRef ? newRef : prev.booking_reference,
                          };
                        });
                      }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Wirtschaftsjahr</label>
                    <Input className="h-8 text-xs font-mono" type="number" value={form.fiscal_year} onChange={e => set("fiscal_year", e.target.value)} />
                  </div>
                  <div>
                    {(() => {
                      const isAccrual = counterAccount?.account_number?.startsWith("4");
                      const vatMissing = isAccrual && !form.vat_rate;
                      return (
                        <>
                          <label className={cn("text-xs font-medium mb-1 block", vatMissing ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")}>
                            MwSt % {isAccrual && <span className="text-orange-500">*</span>}
                          </label>
                          <Select value={form.vat_rate} onValueChange={v => set("vat_rate", v)}>
                            <SelectTrigger className={cn("h-8 text-xs", vatMissing && "border-orange-400 ring-1 ring-orange-300")}>
                              <SelectValue placeholder="Wählen…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="7">7%</SelectItem>
                              <SelectItem value="19">19%</SelectItem>
                            </SelectContent>
                          </Select>
                        </>
                      );
                    })()}
                  </div>
                </div>
                {/* §35a & Brennstoff buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShow35aDialog(true)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                      form.is_35a_relevant
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    §35a
                    {form.is_35a_relevant && form.amount_35a && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{form.amount_35a}€</Badge>
                    )}
                  </button>
                </div>

                {/* Save button */}
                <Button onClick={handleSave} disabled={saving || !form.account_id} className="w-full h-9 text-sm">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Speichern
                </Button>

                {/* Vendor History */}
                <VendorHistorySection booking={booking} />
              </div>
            </div>

            {/* Right panel */}
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
                        {invoiceDetail.net_amount != null && <MatchField label="Netto" value={formatCurrency(invoiceDetail.net_amount)} />}
                        {invoiceDetail.invoice_number && <MatchField label="Re-Nr." value={invoiceDetail.invoice_number} />}
                        {invoiceDetail.invoice_date && <MatchField label="Re-Datum" value={format(new Date(invoiceDetail.invoice_date), "dd.MM.yyyy", { locale: de })} />}
                      </div>
                    </div>
                    {pdfUrl ? (
                      <iframe src={pdfUrl} className="flex-1 w-full border-0" title="Rechnung PDF" />
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">PDF wird geladen...</div>
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
                      {templateDetail.vendor_name && <DetailField label="Lieferant" value={templateDetail.vendor_name} />}
                      {templateDetail.expected_amount != null && (
                        <DetailField label="Erwarteter Betrag" value={
                          templateDetail.amount_tolerance
                            ? `${formatCurrency(templateDetail.expected_amount)} ±${formatCurrency(templateDetail.amount_tolerance)}`
                            : formatCurrency(templateDetail.expected_amount)
                        } />
                      )}
                      {templateDetail.vat_rate != null && <DetailField label="MwSt-Satz" value={`${templateDetail.vat_rate}%`} />}
                      {templateDetail.interval && <DetailField label="Intervall" value={templateDetail.interval} />}
                      {templateDetail.category && <DetailField label="Kategorie" value={templateDetail.category} />}
                      {templateDetail.description && <DetailField label="Beschreibung" value={templateDetail.description} />}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* §35a Dialog */}
      <Dialog open={show35aDialog} onOpenChange={setShow35aDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <h3 className="font-semibold text-base shrink-0">§35a – Haushaltsnahe Dienstleistungen</h3>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 w-full min-w-0">
            <Section35aEditor
              is35aRelevant={!!form.is_35a_relevant}
              onIs35aRelevantChange={(v) => set("is_35a_relevant", v)}
              invoiceLineItems={invoiceLineItems}
              lineItemsDetail={Array.isArray(form.line_items_detail) ? (form.line_items_detail as any) : []}
              onLineItemsDetailChange={(items) => setForm(prev => ({ ...prev, line_items_detail: items as any }))}
              onAmount35aChange={(val) => setForm(prev => ({ ...prev, amount_35a: val }))}
              defaultVatRate={parseFloat(form.vat_rate) || 0}
              defaultType35a={(() => {
                const acc: any = (accounts as any[]).find(a => a.id === form.account_id) || counterAccount;
                return (acc?.settlement_35a_type === "handwerker" ? "handwerker" : "dienste");
              })()}
              currentAmount35a={parseFloat(form.amount_35a) || 0}
              toggleIdSuffix="edit"
            />
          </div>
          <Button onClick={() => setShow35aDialog(false)} className="w-full max-w-full shrink-0">Übernehmen</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailField({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0.5 p-2 rounded-md bg-muted/30", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function MatchField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
