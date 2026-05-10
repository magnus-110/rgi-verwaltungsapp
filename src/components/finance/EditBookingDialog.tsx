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
import { CreateAccountInlineDialog } from "./CreateAccountInlineDialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle, FileText, LayoutTemplate, Building2, X, AlertTriangle, Flag, Flame, Loader2, Pencil, Link2, Link2Off, Search
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { VendorHistorySection } from "./VendorHistorySection";
import { Section35aEditor } from "./Section35aEditor";
import { BookingTextTemplateCombobox } from "./BookingTextTemplateCombobox";
import { resolveVendorDisplayName, useVendorAliases } from "./lib/vendorAlias";
import { buildBookingText, rebuildBookingTextIfAuto } from "./lib/bookingTextBuilder";
import { VendorAliasDialog } from "./VendorAliasDialog";
import { parseAmount } from "./lib/parseAmount";

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
  onSaved?: (bookingId: string) => void;
}

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

export function EditBookingDialog({ open, onOpenChange, booking, buildingName, onSaved }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [show35aDialog, setShow35aDialog] = useState(false);
  const [showFuelDialog, setShowFuelDialog] = useState(false);
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [createAccountTarget, setCreateAccountTarget] = useState<"account_id" | "counter_account_id" | null>(null);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [matchedTemplateId, setMatchedTemplateId] = useState<string | null>(null);
  const { data: vendorAliases } = useVendorAliases();

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
    fuel_co2_emissions_kg: "",
    fuel_co2_tax_amount: "",
    fuel_energy_content_kwh: "",
    fuel_heating_unit_id: "",
    fuel_consumption_from: "",
    fuel_consumption_to: "",
    invoice_id: "" as string,
  });
  const [autoTextSignature, setAutoTextSignature] = useState<string>("");

  useEffect(() => {
    if (open && booking) {
      setSaving(false);
      setForm({
        account_id: booking.account_id || "",
        counter_account_id: booking.counter_account_id || "",
        booking_date: booking.booking_date,
        amount: String(Math.abs(booking.amount)),
        description: booking.description || "",
        booking_type: booking.booking_type
          ? booking.booking_type
          : (Number(booking.amount) < 0 ? "income" : "expense"),
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
        fuel_co2_emissions_kg: "",
        fuel_co2_tax_amount: "",
        fuel_energy_content_kwh: "",
        fuel_heating_unit_id: "",
        fuel_consumption_from: "",
        fuel_consumption_to: "",
        invoice_id: booking.invoice_id || "",
      });
      setMatchedTemplateId((booking as any).matched_template_id || null);
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

  // Heating units (for fuel purchase assignment)
  const { data: heatingUnits = [] } = useQuery<any[]>({
    queryKey: ["heating-units-edit", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("heating_units")
        .select("id, name")
        .eq("building_id", buildingId!)
        .order("created_at");
      return data || [];
    },
    enabled: open && !!buildingId,
  });

  // Existing fuel_inventory entry for this invoice
  const { data: existingFuelEntry } = useQuery<any>({
    queryKey: ["fuel-entry-for-invoice", booking?.invoice_id, buildingId],
    queryFn: async () => {
      if (!booking?.invoice_id || !buildingId) return null;
      const { data } = await supabase
        .from("fuel_inventory")
        .select("*")
        .eq("building_id", buildingId)
        .eq("invoice_id", booking.invoice_id)
        .eq("entry_type", "purchase")
        .maybeSingle();
      return data;
    },
    enabled: open && !!booking?.invoice_id && !!buildingId,
  });

  // Billing periods (for fuel matching)
  const { data: billingPeriods = [] } = useQuery<any[]>({
    queryKey: ["billing-periods-edit", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_periods")
        .select("id, fiscal_year, period_from, period_to")
        .eq("building_id", buildingId!)
        .order("fiscal_year", { ascending: false });
      return data || [];
    },
    enabled: open && !!buildingId,
  });

  // When fuel_inventory entry loads, hydrate fuel fields
  useEffect(() => {
    if (!open || !existingFuelEntry) return;
    setForm(p => ({
      ...p,
      is_fuel_purchase: true,
      fuel_type: existingFuelEntry.fuel_type || "",
      fuel_quantity: existingFuelEntry.quantity != null ? String(existingFuelEntry.quantity) : "",
      fuel_total_price: existingFuelEntry.total_price != null ? String(existingFuelEntry.total_price) : "",
      fuel_date: existingFuelEntry.entry_date || "",
      fuel_co2_emissions_kg: existingFuelEntry.co2_emissions_kg != null ? String(existingFuelEntry.co2_emissions_kg) : "",
      fuel_co2_tax_amount: existingFuelEntry.co2_tax_amount != null ? String(existingFuelEntry.co2_tax_amount) : "",
      fuel_energy_content_kwh: existingFuelEntry.energy_content_kwh != null ? String(existingFuelEntry.energy_content_kwh) : "",
      fuel_heating_unit_id: existingFuelEntry.heating_unit_id || "",
      fuel_consumption_from: existingFuelEntry.consumption_period_from || "",
      fuel_consumption_to: existingFuelEntry.consumption_period_to || "",
    }));
  }, [open, existingFuelEntry]);

  const { data: invoiceDetail } = useQuery({
    queryKey: ["edit-booking-invoice", form.invoice_id || booking?.invoice_id],
    queryFn: async () => {
      const id = form.invoice_id || booking?.invoice_id;
      if (!id) return null;
      const { data } = await supabase
        .from("invoices")
        .select("id, file_path, file_name, vendor_name, gross_amount, net_amount, vat_amount, invoice_number, invoice_date, description, line_items")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!(form.invoice_id || booking?.invoice_id),
  });

  // Searchable list of invoices for the same building
  const { data: pickableInvoices = [] } = useQuery({
    queryKey: ["edit-booking-pickable-invoices", buildingId, invoiceSearch],
    queryFn: async () => {
      if (!buildingId) return [];
      let q = supabase
        .from("invoices")
        .select("id, vendor_name, invoice_number, invoice_date, gross_amount")
        .eq("building_id", buildingId)
        .order("invoice_date", { ascending: false })
        .limit(50);
      if (invoiceSearch.trim()) {
        const s = `%${invoiceSearch.trim()}%`;
        q = q.or(`vendor_name.ilike.${s},invoice_number.ilike.${s}`);
      }
      const { data } = await q;
      return data || [];
    },
    enabled: open && invoicePickerOpen && !!buildingId,
  });

  // Load template details
  const { data: templateDetail } = useQuery({
    queryKey: ["edit-booking-template", matchedTemplateId],
    queryFn: async () => {
      if (!matchedTemplateId) return null;
      const { data } = await supabase
        .from("booking_templates")
        .select("id, name, vendor_name, expected_amount, amount_tolerance, vat_rate, interval, category, description")
        .eq("id", matchedTemplateId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!matchedTemplateId,
  });

  // Searchable list of booking templates for the same building
  const { data: pickableTemplates = [] } = useQuery({
    queryKey: ["edit-booking-pickable-templates", buildingId, templateSearch],
    queryFn: async () => {
      let q = supabase
        .from("booking_templates")
        .select("id, name, vendor_name, expected_amount, interval, category")
        .eq("building_id", buildingId!)
        .order("name");
      if (templateSearch.trim()) {
        const s = `%${templateSearch.trim()}%`;
        q = q.or(`name.ilike.${s},vendor_name.ilike.${s},category.ilike.${s}`);
      }
      const { data, error } = await q.limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: open && templatePickerOpen && !!buildingId,
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
    const amt = parseAmount(form.amount);
    const rate = parseAmount(form.vat_rate);
    return rate > 0 ? (amt - amt / (1 + rate / 100)).toFixed(2) : "0.00";
  }, [form.amount, form.vat_rate]);

  const set = (key: string, value: string | boolean | number) => setForm(p => ({ ...p, [key]: value }));

  const formatRef = (d: string) => {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getFullYear()).slice(-2)}`;
  };

  // Re-build Buchungstext on field change, respecting user-edits
  const rebuildAutoText = (overrides: { counter_account_id?: string; receipt_number?: string; booking_date?: string }) => {
    const ca = accounts.find((a: any) => a.id === (overrides.counter_account_id ?? form.counter_account_id));
    const newAuto = buildBookingText({
      period: formatRef(overrides.booking_date ?? form.booking_date),
      invoiceNumber: (overrides.receipt_number ?? form.receipt_number) || (invoiceDetail as any)?.invoice_number || null,
      vendorName: invoiceDetail ? resolveVendorDisplayName((invoiceDetail as any).vendor_name, buildingId, vendorAliases) : null,
      counterAccountName: ca?.account_name || null,
    });
    const result = rebuildBookingTextIfAuto(form.description, autoTextSignature, {
      period: formatRef(overrides.booking_date ?? form.booking_date),
      invoiceNumber: (overrides.receipt_number ?? form.receipt_number) || (invoiceDetail as any)?.invoice_number || null,
      vendorName: invoiceDetail ? resolveVendorDisplayName((invoiceDetail as any).vendor_name, buildingId, vendorAliases) : null,
      counterAccountName: ca?.account_name || null,
    });
    setAutoTextSignature(result.signature || newAuto);
    if (result.changed) {
      setForm(p => ({ ...p, description: result.text }));
    }
  };

  // Beim Öffnen: aktuelle Description als auto-Signatur setzen, wenn sie nach RGI-Schema aussieht
  useEffect(() => {
    if (!open || !booking) return;
    setAutoTextSignature(booking.description || "");
  }, [open, booking?.id]);

  // Persistiert Rechnungs-/Vorlagen-Verknüpfung sofort (für Klick auf
  // "Zuordnung entfernen" oder Auswahl in den Pickern). Aktualisiert auch
  // die verknüpfte Bank-Transaktion, damit beide Seiten konsistent bleiben.
  const persistMatchImmediately = async (
    nextInvoiceId: string | null,
    nextTemplateId: string | null,
  ) => {
    if (!booking) return;
    const { error } = await supabase.from("bookings").update({
      invoice_id: nextInvoiceId,
      matched_template_id: nextTemplateId,
    }).eq("id", booking.id);
    if (error) {
      toast.error("Zuordnung konnte nicht gespeichert werden: " + error.message);
      return;
    }

    const txnId = (booking as any).bank_transaction_id;
    if (txnId) {
      const txnUpdate: any = {
        matched_invoice_id: nextInvoiceId,
        matched_template_id: nextTemplateId,
      };
      if (nextInvoiceId || nextTemplateId) txnUpdate.match_status = "manually_matched";
      else txnUpdate.match_status = "unmatched";
      await supabase.from("bank_transactions").update(txnUpdate).eq("id", txnId);
    }

    if (nextInvoiceId) {
      await supabase.from("invoices").update({
        status: "paid",
        paid_at: new Date(form.booking_date || booking.booking_date).toISOString(),
      }).eq("id", nextInvoiceId).is("paid_at", null);
    }

    toast.success(nextInvoiceId || nextTemplateId ? "Zuordnung gespeichert" : "Zuordnung entfernt");
    onSaved?.(booking.id);
    queryClient.invalidateQueries({ predicate: (q) => {
      const k = q.queryKey[0] as string;
      return k?.startsWith("bookings") || k?.startsWith("bank-transactions") || k?.startsWith("invoices") || k?.startsWith("review-bookings") || k?.startsWith("edit-booking-invoice");
    }});
  };

  const handleSave = async () => {
    if (!booking) return;
    if (!form.account_id || !form.amount || !form.booking_date) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSaving(true);
    try {
    const newInvoiceId = form.invoice_id || null;
    const oldInvoiceId = booking.invoice_id || null;
    const newTemplateId = matchedTemplateId || null;
    const oldTemplateId = (booking as any).matched_template_id || null;
    const { error } = await supabase.from("bookings").update({
      account_id: form.account_id,
      counter_account_id: form.counter_account_id || null,
      booking_date: form.booking_date,
      amount: parseAmount(form.amount),
      description: form.description || null,
      booking_type: form.booking_type,
      receipt_number: form.receipt_number || null,
      booking_reference: form.booking_reference || null,
      vat_rate: parseAmount(form.vat_rate),
      vat_amount: parseAmount(computedVat),
      is_35a_relevant: form.is_35a_relevant,
      fiscal_year: parseInt(form.fiscal_year),
      amount_35a: form.amount_35a ? parseAmount(form.amount_35a) : null,
      line_items_detail: form.line_items_detail,
      invoice_id: newInvoiceId,
      matched_template_id: newTemplateId,
    }).eq("id", booking.id);
    if (error) throw error;

    // Sync linked bank transaction (Kontoauszug) so re-assignment is consistent
    const txnId = (booking as any).bank_transaction_id;
    if (txnId && (newInvoiceId !== oldInvoiceId || newTemplateId !== oldTemplateId)) {
      const txnUpdate: any = {};
      if (newInvoiceId !== oldInvoiceId) {
        txnUpdate.matched_invoice_id = newInvoiceId;
        if (newInvoiceId) txnUpdate.match_status = "manually_matched";
        else if (!newTemplateId) txnUpdate.match_status = null;
      }
      if (newTemplateId !== oldTemplateId) {
        txnUpdate.matched_template_id = newTemplateId;
        if (newTemplateId) txnUpdate.match_status = "manually_matched";
      }
      const { error: txnErr } = await supabase
        .from("bank_transactions")
        .update(txnUpdate)
        .eq("id", txnId);
      if (txnErr) {
        console.error("Failed to sync bank_transaction match:", txnErr);
        toast.warning("Buchung gespeichert, aber Kontoauszug-Zuordnung konnte nicht synchronisiert werden");
      }
    }

    // Mark previously-linked invoice as paid stays consistent: if invoice changed, re-set paid_at on new
    if (newInvoiceId && newInvoiceId !== oldInvoiceId) {
      await supabase.from("invoices").update({
        status: "paid",
        paid_at: new Date(form.booking_date).toISOString(),
      }).eq("id", newInvoiceId).is("paid_at", null);
    }

    // Save / update fuel inventory entry
    if (form.is_fuel_purchase && form.fuel_type && form.fuel_quantity && newInvoiceId) {
      const fuelUnit = form.fuel_type === "oil" ? "l" : form.fuel_type === "pellets" ? "kg" : "kWh";
      const qty = parseFloat(form.fuel_quantity) || 0;
      const total = parseFloat(form.fuel_total_price) || 0;
      const matchingPeriod = billingPeriods.find((bp: any) => {
        const f = new Date(bp.period_from), t = new Date(bp.period_to);
        const d = new Date(form.fuel_date || form.booking_date);
        return d >= f && d <= t;
      });
      const fuelLabel = form.fuel_type === "oil" ? "Heizöl" : form.fuel_type === "pellets" ? "Pellets" : form.fuel_type === "gas" ? "Gas" : "Fernwärme";

      await supabase.from("fuel_inventory")
        .delete()
        .eq("building_id", booking.building_id)
        .eq("invoice_id", newInvoiceId)
        .eq("entry_type", "purchase");

      await supabase.from("fuel_inventory").insert({
        building_id: booking.building_id,
        fuel_type: form.fuel_type,
        entry_type: "purchase",
        entry_date: form.fuel_date || form.booking_date,
        quantity: qty,
        unit: fuelUnit,
        total_price: total,
        unit_price: qty > 0 ? total / qty : null,
        invoice_id: newInvoiceId,
        billing_period_id: matchingPeriod?.id || null,
        heating_unit_id: form.fuel_heating_unit_id || null,
        co2_emissions_kg: form.fuel_co2_emissions_kg ? parseFloat(form.fuel_co2_emissions_kg) : null,
        co2_tax_amount: form.fuel_co2_tax_amount ? parseFloat(form.fuel_co2_tax_amount) : null,
        energy_content_kwh: form.fuel_energy_content_kwh ? parseFloat(form.fuel_energy_content_kwh) : null,
        consumption_period_from: form.fuel_consumption_from || form.fuel_date || form.booking_date,
        consumption_period_to: form.fuel_consumption_to || form.fuel_date || form.booking_date,
        notes: `Brennstoffkauf ${fuelLabel}: ${qty} ${fuelUnit}`,
      } as any);

      queryClient.invalidateQueries({ queryKey: ["fuel-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["fuel-entry-for-invoice"] });
    }

    toast.success("Buchung gespeichert");
    onSaved?.(booking.id);
    setSaving(false);
    onOpenChange(false);
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0] as string;
      return key.startsWith("bookings") || key.startsWith("bank-transactions") || key.startsWith("invoices");
    }});
    } catch (err: any) {
      toast.error("Fehler: " + (err?.message || "Buchung konnte nicht gespeichert werden"));
    } finally {
      setSaving(false);
    }
  };

  // Enter-Navigation: focus next focusable input/combobox
  const focusNext = (currentEl: HTMLElement | null) => {
    if (!currentEl) return;
    const container = currentEl.closest("[data-edit-booking-form]") as HTMLElement | null;
    if (!container) return;
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled]), button[data-edit-booking-save]'
      )
    ).filter(el => el.offsetParent !== null);
    const idx = focusables.indexOf(currentEl);
    const next = focusables[idx + 1];
    if (next) {
      next.focus();
      if (next.getAttribute("role") === "combobox") next.click();
    }
  };
  const handleEnterToNext = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      focusNext(e.target as HTMLElement);
    }
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
  const hasRightPanel = true;
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
              <div className="p-4 space-y-3" data-edit-booking-form>
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
                      if (v === "__create__") { setCreateAccountTarget("account_id"); return; }
                      set("account_id", v);
                      const acc = accounts.find(a => a.id === v);
                      if (acc?.is_35a_relevant) set("is_35a_relevant", true);
                      if (acc && (acc as any).default_vat_rate != null) set("vat_rate", String((acc as any).default_vat_rate));
                    }}
                    onCommit={() => {
                      const amt = document.querySelector<HTMLInputElement>('[data-edit-booking-form] input[inputmode="decimal"]');
                      amt?.focus();
                      amt?.setSelectionRange(amt.value.length, amt.value.length);
                    }}
                    accounts={accounts}
                    excludeCategory="Bankkonto"
                    placeholder="Konto suchen…"
                    showCreateOption
                    onCreateClick={() => setCreateAccountTarget("account_id")}
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
                      if (e.key === "Enter") {
                        e.preventDefault();
                        focusNext(e.target as HTMLElement);
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
                      if (v === "__create__") { setCreateAccountTarget("counter_account_id"); return; }
                      set("counter_account_id", v);
                      const acc = accounts.find((a: any) => a.id === v);
                      if (acc?.account_number?.startsWith("4")) set("vat_rate", "");
                      rebuildAutoText({ counter_account_id: v });
                    }}
                    onCommit={() => {
                      const sc = document.querySelector<HTMLInputElement>('[data-edit-booking-shortcut]');
                      if (sc) { sc.focus(); return; }
                      document.querySelector<HTMLInputElement>('[data-edit-booking-desc]')?.focus();
                    }}
                    accounts={accounts}
                    placeholder="Gegenkonto suchen…"
                    showCreateOption
                    onCreateClick={() => setCreateAccountTarget("counter_account_id")}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Buchungstext</label>
                  <div className="grid grid-cols-[90px_1fr] gap-2">
                    <BookingTextTemplateCombobox
                      inputRef={(el) => { if (el) el.setAttribute("data-edit-booking-shortcut", "true"); }}
                      fiscalYear={form.fiscal_year}
                      invoice={invoiceDetail ? { invoice_number: (invoiceDetail as any).invoice_number, vendor_name: (invoiceDetail as any).vendor_name } : null}
                      counterAccountName={accounts.find((a: any) => a.id === form.counter_account_id)?.account_name || null}
                      existingText={form.description}
                      onApply={(text) => { set("description", text); setAutoTextSignature(text); }}
                      onCommit={() => {
                        document.querySelector<HTMLInputElement>('[data-edit-booking-desc]')?.focus();
                      }}
                      onSkip={() => {
                        document.querySelector<HTMLInputElement>('[data-edit-booking-desc]')?.focus();
                      }}
                    />
                    <Input data-edit-booking-desc className="h-9 text-sm" value={form.description} onChange={e => set("description", e.target.value)} onKeyDown={handleEnterToNext} />
                  </div>
                </div>

                {/* Compact row */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Belegnummer</label>
                    <Input className="h-8 text-xs font-mono" value={form.booking_reference} onChange={e => set("booking_reference", e.target.value)} onKeyDown={handleEnterToNext} placeholder="MM/JJ" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Beleg-Datum</label>
                    <Input type="date" className="h-8 text-xs" value={form.booking_date}
                      onKeyDown={handleEnterToNext}
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
                        setTimeout(() => rebuildAutoText({ booking_date: val }), 0);
                      }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Wirtschaftsjahr</label>
                    <Input className="h-8 text-xs font-mono" type="number" value={form.fiscal_year} onChange={e => set("fiscal_year", e.target.value)} onKeyDown={handleEnterToNext} />
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
                          <Select value={form.vat_rate} onValueChange={v => {
                            set("vat_rate", v);
                            setTimeout(() => {
                              document.querySelector<HTMLButtonElement>('[data-edit-booking-save]')?.focus();
                            }, 50);
                          }}>
                            <SelectTrigger className={cn("h-8 text-xs", vatMissing && "border-orange-400 ring-1 ring-orange-300")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && form.vat_rate) {
                                  e.preventDefault();
                                  document.querySelector<HTMLButtonElement>('[data-edit-booking-save]')?.focus();
                                }
                              }}>
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
                {/* Rechnungs-Zuordnung wird oben im rechten Panel angezeigt */}
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
                  <button
                    type="button"
                    onClick={() => setShowFuelDialog(true)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                      form.is_fuel_purchase
                        ? "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Flame className="h-3.5 w-3.5" />
                    Brennstoff
                    {form.is_fuel_purchase && form.fuel_type && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                        {form.fuel_type === "oil" ? "Öl" : form.fuel_type === "pellets" ? "Pellets" : form.fuel_type === "gas" ? "Gas" : "Fernwärme"}
                      </Badge>
                    )}
                  </button>
                </div>

                {/* Save button */}
                <Button data-edit-booking-save onClick={handleSave} disabled={saving || !form.account_id} className="w-full h-9 text-sm">
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
                {/* Rechnungs-Zuordnung (oben rechts, wie auf Kontoauszug-Seite) */}
                <div className="px-4 py-2 border-b bg-muted/20 shrink-0 space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground block">Rechnungs-Zuordnung</label>
                  <div className="flex items-center gap-2">
                    <Popover open={invoicePickerOpen} onOpenChange={setInvoicePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start font-normal">
                          <Search className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          {invoiceDetail ? (
                            <span className="truncate">
                              {invoiceDetail.vendor_name || "Rechnung"}
                              {invoiceDetail.invoice_number ? ` · ${invoiceDetail.invoice_number}` : ""}
                              {invoiceDetail.gross_amount != null ? ` · ${formatCurrency(invoiceDetail.gross_amount)}` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Rechnung zuordnen…</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="end">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Lieferant oder Re-Nr suchen…"
                            value={invoiceSearch}
                            onValueChange={setInvoiceSearch}
                            className="h-9 text-xs"
                          />
                          <CommandList>
                            <CommandEmpty>Keine Rechnungen gefunden</CommandEmpty>
                            <CommandGroup>
                              {pickableInvoices.map((inv: any) => (
                                <CommandItem
                                  key={inv.id}
                                  value={inv.id}
                                  onSelect={() => {
                                    set("invoice_id", inv.id);
                                    setMatchedTemplateId(null);
                                    setInvoicePickerOpen(false);
                                    void persistMatchImmediately(inv.id, null);
                                  }}
                                  className="text-xs flex flex-col items-start gap-0.5"
                                >
                                  <div className="flex items-center justify-between w-full gap-2">
                                    <span className="font-medium truncate">{inv.vendor_name || "–"}</span>
                                    <span className="font-mono tabular-nums shrink-0">{formatCurrency(inv.gross_amount)}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    {inv.invoice_number && <span className="font-mono">{inv.invoice_number}</span>}
                                    {inv.invoice_date && <span>{format(new Date(inv.invoice_date), "dd.MM.yyyy", { locale: de })}</span>}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {form.invoice_id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => { set("invoice_id", ""); void persistMatchImmediately(null, matchedTemplateId); }}
                        title="Zuordnung entfernen"
                      >
                        <Link2Off className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Vorlagen-Zuordnung */}
                <div className="px-4 py-2 border-b bg-muted/20 shrink-0 space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground block">Vorlagen-Zuordnung</label>
                  <div className="flex items-center gap-2">
                    <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start font-normal">
                          <LayoutTemplate className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          {templateDetail ? (
                            <span className="truncate">
                              {templateDetail.name}
                              {templateDetail.vendor_name ? ` · ${templateDetail.vendor_name}` : ""}
                              {templateDetail.expected_amount != null ? ` · ${formatCurrency(templateDetail.expected_amount)}` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Vorlage zuordnen…</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="end">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Name, Lieferant oder Kategorie suchen…"
                            value={templateSearch}
                            onValueChange={setTemplateSearch}
                            className="h-9 text-xs"
                          />
                          <CommandList>
                            <CommandEmpty>Keine Vorlagen gefunden</CommandEmpty>
                            <CommandGroup>
                              {pickableTemplates.map((tpl: any) => (
                                <CommandItem
                                  key={tpl.id}
                                  value={tpl.id}
                                  onSelect={() => {
                                    setMatchedTemplateId(tpl.id);
                                    set("invoice_id", "");
                                    setTemplatePickerOpen(false);
                                    void persistMatchImmediately(null, tpl.id);
                                  }}
                                  className="text-xs flex flex-col items-start gap-0.5"
                                >
                                  <div className="flex items-center justify-between w-full gap-2">
                                    <span className="font-medium truncate">{tpl.name}</span>
                                    {tpl.expected_amount != null && (
                                      <span className="font-mono tabular-nums shrink-0">{formatCurrency(tpl.expected_amount)}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    {tpl.vendor_name && <span className="truncate">{tpl.vendor_name}</span>}
                                    {tpl.interval && <span>· {tpl.interval}</span>}
                                    {tpl.category && <span>· {tpl.category}</span>}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {matchedTemplateId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setMatchedTemplateId(null)}
                        title="Zuordnung entfernen"
                      >
                        <Link2Off className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {hasInvoice ? (
                  <>
                    <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-2 shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Rechnung</span>
                      {invoiceDetail.vendor_name && (
                        <>
                          <Badge variant="outline" className="text-xs" title={invoiceDetail.vendor_name}>
                            {resolveVendorDisplayName(invoiceDetail.vendor_name, booking?.building_id, vendorAliases)}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            title="Kurzname für diesen Lieferanten festlegen (gilt nur für künftige Buchungen)"
                            onClick={() => setAliasDialogOpen(true)}
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </>
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
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
                    Keine Rechnung zugeordnet. Über das Suchfeld oben kannst du eine Rechnung verknüpfen.
                  </div>
                )}
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

      {/* Brennstoff Dialog */}
      <Dialog open={showFuelDialog} onOpenChange={setShowFuelDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              <h3 className="font-semibold text-base">Brennstoffkauf</h3>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="fuel-edit-dlg" checked={form.is_fuel_purchase} onCheckedChange={v => set("is_fuel_purchase", !!v)} />
              <label htmlFor="fuel-edit-dlg" className="text-sm font-medium">Brennstoffkauf erfassen</label>
            </div>
            {(() => {
              const fuelUnit = form.fuel_type === "oil" ? "l" : form.fuel_type === "pellets" ? "kg" : (form.fuel_type === "gas" || form.fuel_type === "district_heating") ? "kWh" : "l";
              const showCo2 = ["oil", "gas", "district_heating"].includes(form.fuel_type);
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Art</label>
                      <Select value={form.fuel_type} onValueChange={v => set("fuel_type", v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Wählen…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="oil">Heizöl</SelectItem>
                          <SelectItem value="pellets">Pellets</SelectItem>
                          <SelectItem value="gas">Gas</SelectItem>
                          <SelectItem value="district_heating">Fernwärme</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Menge ({fuelUnit})</label>
                      <Input className="h-9 text-sm" type="number" placeholder="0" value={form.fuel_quantity} onChange={e => set("fuel_quantity", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Gesamtpreis (€)</label>
                      <Input className="h-9 text-sm" type="number" step="0.01" placeholder="0,00" value={form.fuel_total_price} onChange={e => set("fuel_total_price", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Lieferdatum</label>
                      <Input className="h-9 text-sm" type="date" value={form.fuel_date} onChange={e => set("fuel_date", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Energieinhalt (kWh)</label>
                      <Input className="h-9 text-sm" type="number" step="0.01" placeholder="0" value={form.fuel_energy_content_kwh} onChange={e => set("fuel_energy_content_kwh", e.target.value)} />
                    </div>
                  </div>
                  {showCo2 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-xs font-medium text-amber-900">CO₂-Daten (BEHG)</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">CO₂-Emissionen (kg)</label>
                          <Input className="h-9 text-sm" type="number" step="0.01" value={form.fuel_co2_emissions_kg} onChange={e => set("fuel_co2_emissions_kg", e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">CO₂-Steueranteil (€)</label>
                          <Input className="h-9 text-sm" type="number" step="0.01" value={form.fuel_co2_tax_amount} onChange={e => set("fuel_co2_tax_amount", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                  {heatingUnits.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Heizkreis</label>
                      <Select value={form.fuel_heating_unit_id || "__none__"} onValueChange={v => set("fuel_heating_unit_id", v === "__none__" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Kein Heizkreis" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Kein Heizkreis</SelectItem>
                          {heatingUnits.map((hu: any) => (<SelectItem key={hu.id} value={hu.id}>{hu.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              );
            })()}
            <Button onClick={() => {
              if (form.fuel_type && form.fuel_quantity) set("is_fuel_purchase", true);
              setShowFuelDialog(false);
            }} className="w-full">Übernehmen</Button>
          </div>
        </DialogContent>
      </Dialog>

      <VendorAliasDialog
        open={aliasDialogOpen}
        onOpenChange={setAliasDialogOpen}
        rawVendorName={(invoiceDetail as any)?.vendor_name || ""}
        buildingId={booking?.building_id || null}
      />

      <CreateAccountInlineDialog
        open={!!createAccountTarget}
        onOpenChange={(o) => { if (!o) setCreateAccountTarget(null); }}
        buildingId={booking?.building_id || null}
        onCreated={(newId) => {
          if (createAccountTarget) set(createAccountTarget, newId);
          setCreateAccountTarget(null);
        }}
      />
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
