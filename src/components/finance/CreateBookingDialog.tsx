import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountSearchSelect } from "./AccountSearchSelect";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle, Building2, X, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookingPrefill {
  account_id?: string;
  counter_account_id?: string;
  amount?: number;
  description?: string;
  booking_date?: string;
  booking_type?: "income" | "expense";
  receipt_number?: string;
  booking_reference?: string;
  related_template_id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings: { id: string; name: string; building_code: string }[];
  preselectedBuildingId?: string;
  preselectedYear?: string;
  prefill?: BookingPrefill | null;
  linkedTransactionId?: string | null;
  onBookingCreated?: (bookingId: string) => void;
}

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

export function CreateBookingDialog({ open, onOpenChange, buildings, preselectedBuildingId, preselectedYear, prefill, linkedTransactionId, onBookingCreated }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    building_id: "",
    account_id: "",
    counter_account_id: "",
    booking_date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
    fiscal_year: String(new Date().getFullYear()),
    booking_type: "expense",
    receipt_number: "",
    booking_reference: "",
    vat_rate: "19",
    is_35a_relevant: false,
    matched_template_id: "",
  });

  useEffect(() => {
    if (open) {
      setForm(prev => ({
        ...prev,
        building_id: preselectedBuildingId || prev.building_id,
        fiscal_year: preselectedYear || prev.fiscal_year,
        ...(prefill ? {
          account_id: prefill.account_id || prev.account_id,
          counter_account_id: prefill.counter_account_id || prev.counter_account_id,
          amount: prefill.amount != null ? String(prefill.amount) : prev.amount,
          description: prefill.description || prev.description,
          booking_date: prefill.booking_date || prev.booking_date,
          fiscal_year: prefill.booking_date ? String(new Date(prefill.booking_date).getFullYear()) : prev.fiscal_year,
          booking_type: prefill.booking_type || prev.booking_type,
          receipt_number: prefill.receipt_number || prev.receipt_number,
          booking_reference: prefill.booking_reference || prev.booking_reference,
          matched_template_id: prefill.related_template_id || prev.matched_template_id,
        } : {}),
      }));
    }
  }, [open, preselectedBuildingId, preselectedYear, prefill]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts", form.building_id],
    queryFn: async () => {
      let query = supabase.from("chart_of_accounts").select("*");
      if (form.building_id) {
        query = query.or(`building_id.is.null,building_id.eq.${form.building_id}`);
      }
      const { data, error } = await query.order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const computedVat = useMemo(() => {
    const amt = parseFloat(form.amount) || 0;
    const rate = parseFloat(form.vat_rate) || 0;
    return rate > 0 ? (amt - amt / (1 + rate / 100)).toFixed(2) : "0.00";
  }, [form.amount, form.vat_rate]);

  const set = (key: string, value: string | boolean) => setForm(p => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!form.building_id || !form.account_id || !form.amount || !form.booking_date) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSaving(true);
    const { data: insertedData, error } = await supabase.from("bookings").insert({
      building_id: form.building_id,
      account_id: form.account_id,
      counter_account_id: form.counter_account_id || null,
      booking_date: form.booking_date,
      amount: parseFloat(form.amount),
      description: form.description || null,
      fiscal_year: parseInt(form.fiscal_year),
      source: "manual",
      status: "pending",
      created_by: user?.id,
      booking_type: form.booking_type,
      receipt_number: form.receipt_number || null,
      booking_reference: form.booking_reference || null,
      vat_rate: parseFloat(form.vat_rate),
      vat_amount: parseFloat(computedVat),
      is_35a_relevant: form.is_35a_relevant,
      matched_template_id: form.matched_template_id || null,
    } as any).select("id").single();
    setSaving(false);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Buchung angelegt");
    if (insertedData?.id && onBookingCreated) {
      onBookingCreated(insertedData.id);
    }
    onOpenChange(false);
    resetForm();
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0] as string;
      return key.startsWith("bookings");
    }});
  };

  const resetForm = () => {
    setForm({
      building_id: preselectedBuildingId || "",
      account_id: "", counter_account_id: "",
      booking_date: new Date().toISOString().split("T")[0],
      amount: "", description: "",
      fiscal_year: preselectedYear || String(new Date().getFullYear()),
      booking_type: "expense", receipt_number: "", booking_reference: "",
      vat_rate: "19", is_35a_relevant: false, matched_template_id: "",
    });
  };

  const selectedBuildingName = buildings.find(b => b.id === form.building_id)?.name || "–";
  const counterAccount = accounts.find((a: any) => a.id === form.counter_account_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[94vh] p-0 flex flex-col overflow-hidden [&>button.absolute]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-base">Neue Buchung</h3>
              <p className="text-xs text-muted-foreground">
                {form.building_id ? selectedBuildingName : "Liegenschaft wählen"} · {form.fiscal_year}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3">
            {/* Prefill hint */}
            {prefill && (
              <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary border border-primary/20 rounded-lg px-3 py-2">
                <Sparkles className="h-4 w-4 shrink-0" />
                KI-vorausgefüllt – bitte prüfen.
              </div>
            )}

            {/* Building selector */}
            <div>
              <label className="text-xs font-bold text-primary mb-1 block">Liegenschaft *</label>
              <Select value={form.building_id} onValueChange={v => set("building_id", v)}>
                <SelectTrigger className="h-9 text-sm font-semibold border-primary/30 bg-primary/5">
                  <SelectValue placeholder="Liegenschaft wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.building_code && <span className="text-muted-foreground">({b.building_code})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Konto */}
            <div>
              <label className="text-xs font-bold text-primary mb-1 block">Konto *</label>
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
                placeholder="0,00"
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
              <Input className="h-9 text-sm" value={form.description} onChange={e => set("description", e.target.value)} placeholder="Beschreibung der Buchung…" />
            </div>

            {/* Compact row: Kürzel, Beleg-Datum, Beleg-Nr, MwSt */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Belegnummer</label>
                <Input className="h-8 text-xs font-mono" value={form.booking_reference} onChange={e => set("booking_reference", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Beleg-Datum *</label>
                <Input type="date" className="h-8 text-xs" value={form.booking_date}
                  onChange={e => {
                    const val = e.target.value;
                    setForm(prev => ({ ...prev, booking_date: val, fiscal_year: val ? String(new Date(val).getFullYear()) : prev.fiscal_year }));
                  }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Beleg-Nr.</label>
                <Input className="h-8 text-xs" value={form.receipt_number} onChange={e => set("receipt_number", e.target.value)} />
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

            {/* Wirtschaftsjahr */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Wirtschaftsjahr</label>
                <Input className="h-8 text-xs font-mono" type="number" value={form.fiscal_year} onChange={e => set("fiscal_year", e.target.value)} />
              </div>
            </div>

            {/* §35a toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set("is_35a_relevant", !form.is_35a_relevant)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  form.is_35a_relevant
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                §35a
              </button>
            </div>

            {/* Save button */}
            <Button onClick={handleSave} disabled={saving || !form.account_id || !form.building_id} className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
