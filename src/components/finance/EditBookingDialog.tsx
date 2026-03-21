import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, Search, ArrowDownLeft, ArrowUpRight, X, CheckCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

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

const VAT_RATES = [
  { value: "0", label: "0 %" },
  { value: "7", label: "7 %" },
  { value: "19", label: "19 %" },
];

export function EditBookingDialog({ open, onOpenChange, booking, buildingName, onInvoiceClick }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    account_id: "",
    counter_account_id: "",
    booking_date: "",
    amount: "",
    description: "",
    performance_period_from: "",
    performance_period_to: "",
    booking_type: "expense",
    receipt_number: "",
    booking_reference: "",
    vat_rate: "19",
    is_35a_relevant: false,
  });
  const [accountSearch, setAccountSearch] = useState("");
  const [counterSearch, setCounterSearch] = useState("");
  const [showPeriod, setShowPeriod] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);

  useEffect(() => {
    if (open && booking) {
      setForm({
        account_id: booking.account_id || "",
        counter_account_id: booking.counter_account_id || "",
        booking_date: booking.booking_date,
        amount: String(booking.amount),
        description: booking.description || "",
        performance_period_from: booking.performance_period_from || "",
        performance_period_to: booking.performance_period_to || "",
        booking_type: booking.booking_type || "expense",
        receipt_number: booking.receipt_number || "",
        booking_reference: booking.booking_reference || "",
        vat_rate: String(booking.vat_rate ?? 19),
        is_35a_relevant: booking.is_35a_relevant ?? false,
      });
      setShowPeriod(!!(booking.performance_period_from || booking.performance_period_to));
    }
  }, [open, booking]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chart_of_accounts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const filterAccounts = (list: typeof accounts, query: string) => {
    const q = query.toLowerCase().trim();
    return q ? list.filter(a => a.account_number.includes(q) || a.account_name.toLowerCase().includes(q)) : list;
  };

  const groupAccounts = (list: typeof accounts) => {
    return list.reduce((acc: Record<string, typeof accounts>, a) => {
      (acc[a.category] = acc[a.category] || []).push(a);
      return acc;
    }, {});
  };

  const computedVat = useMemo(() => {
    const amt = parseFloat(form.amount) || 0;
    const rate = parseFloat(form.vat_rate) || 0;
    return rate > 0 ? (amt - amt / (1 + rate / 100)).toFixed(2) : "0.00";
  }, [form.amount, form.vat_rate]);

  const getAccountLabel = (id: string) => {
    const a = accounts.find(acc => acc.id === id);
    return a ? `${a.account_number} – ${a.account_name}` : "";
  };

  const handleSave = async () => {
    if (!booking) return;
    if (!form.account_id || !form.amount || !form.booking_date) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    const { error } = await supabase.from("bookings").update({
      account_id: form.account_id,
      counter_account_id: form.counter_account_id || null,
      booking_date: form.booking_date,
      amount: parseFloat(form.amount),
      description: form.description || null,
      performance_period_from: form.performance_period_from || null,
      performance_period_to: form.performance_period_to || null,
      booking_type: form.booking_type,
      receipt_number: form.receipt_number || null,
      booking_reference: form.booking_reference || null,
      vat_rate: parseFloat(form.vat_rate),
      vat_amount: parseFloat(computedVat),
      is_35a_relevant: form.is_35a_relevant,
    }).eq("id", booking.id);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Buchung gespeichert");
    onOpenChange(false);
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0] as string;
      return key.startsWith("bookings");
    }});
  };

  const handleConfirm = async () => {
    if (!booking) return;
    // Save first, then confirm
    if (!form.account_id || !form.amount || !form.booking_date) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    const { error } = await supabase.from("bookings").update({
      account_id: form.account_id,
      counter_account_id: form.counter_account_id || null,
      booking_date: form.booking_date,
      amount: parseFloat(form.amount),
      description: form.description || null,
      performance_period_from: form.performance_period_from || null,
      performance_period_to: form.performance_period_to || null,
      booking_type: form.booking_type,
      receipt_number: form.receipt_number || null,
      booking_reference: form.booking_reference || null,
      vat_rate: parseFloat(form.vat_rate),
      vat_amount: parseFloat(computedVat),
      is_35a_relevant: form.is_35a_relevant,
      status: "confirmed",
      confirmed_by: user?.id,
      confirmed_at: new Date().toISOString(),
    }).eq("id", booking.id);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Buchung bestätigt");
    onOpenChange(false);
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const set = (key: string, value: string | boolean) => setForm(p => ({ ...p, [key]: value }));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (booking?.status === "pending") {
        handleConfirm();
      } else {
        handleSave();
      }
    }
  };

  const AccountPicker = ({ value, onChange, search, onSearchChange, isOpen, onOpenChange: setOpen, placeholder }: {
    value: string; onChange: (v: string) => void; search: string;
    onSearchChange: (v: string) => void; isOpen: boolean; onOpenChange: (v: boolean) => void; placeholder: string;
  }) => {
    const filtered = filterAccounts(accounts, search);
    const grouped = groupAccounts(filtered);
    return (
      <Popover open={isOpen} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className={cn("w-full h-11 justify-between text-left font-normal", !value && "text-muted-foreground")}>
            <span className="truncate">{value ? getAccountLabel(value) : placeholder}</span>
            {value ? (
              <X className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onChange(""); }} />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[460px] p-0" align="start">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Kontonummer oder Name eingeben..." className="pl-9 h-10" autoFocus />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1">
            {Object.keys(grouped).length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">Kein Konto gefunden</div>
            ) : (
              Object.entries(grouped).map(([cat, accs]) => (
                <div key={cat}>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat}</div>
                  {accs.map(a => (
                    <button key={a.id} onClick={() => { onChange(a.id); setOpen(false); onSearchChange(""); }}
                      className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-md hover:bg-accent transition-colors", value === a.id && "bg-accent")}>
                      <span className="font-mono text-sm font-medium w-14 shrink-0">{a.account_number}</span>
                      <span className="text-sm truncate">{a.account_name}</span>
                      {a.is_35a_relevant && <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100 ml-auto shrink-0">§35a</Badge>}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="text-xl">Buchung bearbeiten</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {buildingName} · Wirtschaftsjahr {booking.fiscal_year}
            {booking.source !== "manual" && (
              <Badge variant="outline" className="ml-2 text-[10px]">
                {booking.source === "ocr" ? "OCR" : booking.source === "bank_import" ? "Bank" : booking.source}
              </Badge>
            )}
          </p>
        </DialogHeader>

        {/* AI Warning */}
        {booking.ai_warning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2 items-start">
            <span className="text-amber-600 mt-0.5 text-sm">⚠️</span>
            <p className="text-sm text-amber-800 dark:text-amber-200">{booking.ai_warning}</p>
          </div>
        )}

        {/* Invoice link */}
        {booking.invoice_id && booking.invoices && (
          <div className="rounded-lg border p-3 flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium">Zugeordnete Rechnung:</span>{" "}
              <span className="text-muted-foreground">{booking.invoices.vendor_name || booking.invoices.file_name || "–"}</span>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onInvoiceClick?.(booking)}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Anzeigen
            </Button>
          </div>
        )}

        <div className="space-y-6 py-2">
          {/* Buchung section */}
          <div className="rounded-xl border p-6 space-y-5">
            <p className="text-base font-semibold text-foreground">Buchung</p>
            <div>
              <Label className="text-sm mb-1.5 block">Konto (Soll) *</Label>
              <AccountPicker value={form.account_id} onChange={v => {
                set("account_id", v);
                const acc = accounts.find(a => a.id === v);
                if (acc?.is_35a_relevant) set("is_35a_relevant", true);
              }} search={accountSearch} onSearchChange={setAccountSearch}
                isOpen={accountOpen} onOpenChange={setAccountOpen} placeholder="Konto suchen..." />
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label className="text-sm mb-1.5 block">Zugang / Abgang *</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={form.booking_type === "expense" ? "default" : "outline"}
                    className={cn("flex-1 h-11 gap-2", form.booking_type === "expense" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                    onClick={() => set("booking_type", "expense")}>
                    <ArrowDownLeft className="h-4 w-4" /> Abgang
                  </Button>
                  <Button type="button" variant={form.booking_type === "income" ? "default" : "outline"}
                    className={cn("flex-1 h-11 gap-2", form.booking_type === "income" && "bg-green-600 hover:bg-green-700 text-white")}
                    onClick={() => set("booking_type", "income")}>
                    <ArrowUpRight className="h-4 w-4" /> Zugang
                  </Button>
                </div>
              </div>
              <div className="w-[180px]">
                <Label className="text-sm mb-1.5 block">Betrag (€) *</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)}
                  className="h-11 text-right text-lg font-semibold" placeholder="0,00" />
              </div>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Gegenkonto (Haben)</Label>
              <AccountPicker value={form.counter_account_id} onChange={v => set("counter_account_id", v)}
                search={counterSearch} onSearchChange={setCounterSearch}
                isOpen={counterOpen} onOpenChange={setCounterOpen} placeholder="z.B. 1200 Bank, 1000 Kasse..." />
            </div>
          </div>

          {/* Beleg section */}
          <div className="rounded-xl border p-6 space-y-5">
            <p className="text-base font-semibold text-foreground">Beleg</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">Buchungskürzel</Label>
                <Input value={form.booking_reference} onChange={e => set("booking_reference", e.target.value)} className="h-11" placeholder="z.B. HG" />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Beleg-Nr.</Label>
                <Input value={form.receipt_number} onChange={e => set("receipt_number", e.target.value)} className="h-11" placeholder="z.B. RE-2026-001" />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Belegdatum *</Label>
                <Input type="date" value={form.booking_date} onChange={e => set("booking_date", e.target.value)} className="h-11" />
              </div>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Buchungstext</Label>
              <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="Beschreibung der Buchung..." />
            </div>
          </div>

          {/* Steuer section */}
          <div className="rounded-xl border p-6 space-y-5">
            <p className="text-base font-semibold text-foreground">Steuer & Optionen</p>
            <div className="flex items-end gap-6 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-sm mb-2 block">MwSt-Satz</Label>
                <RadioGroup value={form.vat_rate} onValueChange={v => set("vat_rate", v)} className="flex gap-4">
                  {VAT_RATES.map(r => (
                    <div key={r.value} className="flex items-center gap-2">
                      <RadioGroupItem value={r.value} id={`edit-vat-${r.value}`} className="h-5 w-5" />
                      <Label htmlFor={`edit-vat-${r.value}`} className="text-sm cursor-pointer">{r.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="w-[140px]">
                <Label className="text-sm mb-1.5 block">MwSt-Betrag</Label>
                <Input value={computedVat} readOnly className="h-11 text-right bg-muted font-medium" />
              </div>
              <div className="flex items-center gap-2.5 pb-1">
                <Checkbox id="edit_is_35a" checked={form.is_35a_relevant} onCheckedChange={c => set("is_35a_relevant", !!c)} className="h-5 w-5" />
                <Label htmlFor="edit_is_35a" className="text-sm cursor-pointer whitespace-nowrap font-medium">§35a relevant</Label>
              </div>
            </div>
          </div>

          {/* Leistungszeitraum */}
          <Collapsible open={showPeriod} onOpenChange={setShowPeriod}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="text-sm text-muted-foreground gap-2 px-0 h-auto">
                <ChevronDown className={`h-4 w-4 transition-transform ${showPeriod ? "rotate-180" : ""}`} />
                Leistungszeitraum
                {form.performance_period_from && <Badge variant="secondary" className="text-xs ml-1">gesetzt</Badge>}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-1.5 block">Von</Label>
                  <Input type="date" value={form.performance_period_from} onChange={e => set("performance_period_from", e.target.value)} className="h-11" />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Bis</Label>
                  <Input type="date" value={form.performance_period_to} onChange={e => set("performance_period_to", e.target.value)} className="h-11" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter className="pt-4 gap-2">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          {booking.status === "pending" && (
            <Button size="lg" variant="default" onClick={handleConfirm} className="min-w-[180px] gap-2 bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle className="h-4 w-4" /> Bestätigen & Speichern
            </Button>
          )}
          <Button size="lg" onClick={handleSave} className="min-w-[140px]">Speichern</Button>
        </DialogFooter>

        <p className="text-xs text-muted-foreground text-center">
          {booking.status === "pending" ? "Ctrl+Enter = Bestätigen & Speichern" : "Ctrl+Enter = Speichern"}
        </p>
      </DialogContent>
    </Dialog>
  );
}
