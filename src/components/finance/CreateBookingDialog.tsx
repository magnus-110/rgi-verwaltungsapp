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
import { ChevronDown, Search, ArrowDownLeft, ArrowUpRight, X, Sparkles, LayoutTemplate } from "lucide-react";
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

const VAT_RATES = [
  { value: "0", label: "0 %" },
  { value: "7", label: "7 %" },
  { value: "19", label: "19 %" },
];

export function CreateBookingDialog({ open, onOpenChange, buildings, preselectedBuildingId, preselectedYear, prefill, linkedTransactionId, onBookingCreated }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    building_id: "",
    account_id: "",
    counter_account_id: "",
    booking_date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
    fiscal_year: String(new Date().getFullYear()),
    performance_period_from: "",
    performance_period_to: "",
    booking_type: "expense",
    receipt_number: "",
    booking_reference: "",
    vat_rate: "19",
    is_35a_relevant: false,
    matched_template_id: "",
  });
  const [accountSearch, setAccountSearch] = useState("");
  const [counterSearch, setCounterSearch] = useState("");
  const [showPeriod, setShowPeriod] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  // Sync preselected values and prefill when dialog opens
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
  });

  // Fetch booking templates for the selected building
  const { data: bookingTemplates = [] } = useQuery({
    queryKey: ["booking-templates-for-dialog", form.building_id],
    queryFn: async () => {
      if (!form.building_id) return [];
      const { data, error } = await supabase
        .from("booking_templates")
        .select("id, name, vendor_name, expected_amount")
        .eq("building_id", form.building_id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!form.building_id,
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
    if (!form.building_id || !form.account_id || !form.amount || !form.booking_date) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    const { data: insertedData, error } = await supabase.from("bookings").insert({
      building_id: form.building_id,
      account_id: form.account_id,
      counter_account_id: form.counter_account_id || null,
      booking_date: form.booking_date,
      amount: parseFloat(form.amount),
      description: form.description || null,
      fiscal_year: parseInt(form.fiscal_year),
      performance_period_from: form.performance_period_from || null,
      performance_period_to: form.performance_period_to || null,
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
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Buchung angelegt");
    if (insertedData?.id && onBookingCreated) {
      onBookingCreated(insertedData.id);
    }
    onOpenChange(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const resetForm = () => {
    setForm({
      building_id: preselectedBuildingId || "", account_id: "", counter_account_id: "",
      booking_date: new Date().toISOString().split("T")[0],
      amount: "", description: "", fiscal_year: preselectedYear || String(new Date().getFullYear()),
      performance_period_from: "", performance_period_to: "",
      booking_type: "expense", receipt_number: "", booking_reference: "",
      vat_rate: "19", is_35a_relevant: false, matched_template_id: "",
    });
    setAccountSearch("");
    setCounterSearch("");
    setTemplateSearch("");
    setShowPeriod(false);
  };

  const set = (key: string, value: string | boolean) => setForm(p => ({ ...p, [key]: value }));

  const selectedBuildingName = buildings.find(b => b.id === form.building_id)?.name || "–";

  // Account picker component using Popover + searchable list
  const AccountPicker = ({ value, onChange, search, onSearchChange, isOpen, onOpenChange, placeholder }: {
    value: string; onChange: (v: string) => void; search: string;
    onSearchChange: (v: string) => void; isOpen: boolean; onOpenChange: (v: boolean) => void; placeholder: string;
  }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const filtered = filterAccounts(accounts, search);
    const grouped = groupAccounts(filtered);

    return (
      <Popover open={isOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn(
              "w-full h-11 justify-between text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <span className="truncate">
              {value ? getAccountLabel(value) : placeholder}
            </span>
            {value ? (
              <X className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onChange(""); }} />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[460px] p-0" align="start">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Kontonummer oder Name eingeben..."
                className="pl-9 h-10"
                autoFocus
              />
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
                    <button
                      key={a.id}
                      onClick={() => { onChange(a.id); onOpenChange(false); onSearchChange(""); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-md hover:bg-accent transition-colors",
                        value === a.id && "bg-accent"
                      )}
                    >
                      <span className="font-mono text-sm font-medium w-14 shrink-0">{a.account_number}</span>
                      <span className="text-sm truncate">{a.account_name}</span>
                      {a.is_35a_relevant && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100 ml-auto shrink-0">§35a</Badge>
                      )}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Neue Buchung</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {selectedBuildingName} · Wirtschaftsjahr {form.fiscal_year}
          </p>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {prefill && (
            <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary border border-primary/20 rounded-lg px-4 py-3">
              <Sparkles className="h-4 w-4 shrink-0" />
              Felder basierend auf KI-Analyse vorausgefüllt. Bitte prüfen und bei Bedarf anpassen.
            </div>
          )}
          {/* Row 1: Buchung – Konto, Typ, Betrag */}
          <div className="rounded-xl border p-6 space-y-5">
            <p className="text-base font-semibold text-foreground">Buchung</p>

            <div>
              <Label className="text-sm mb-1.5 block">Konto (Soll) *</Label>
              <AccountPicker
                value={form.account_id} onChange={v => {
                  set("account_id", v);
                  const acc = accounts.find(a => a.id === v);
                  if (acc?.is_35a_relevant) set("is_35a_relevant", true);
                }}
                search={accountSearch} onSearchChange={setAccountSearch}
                isOpen={accountOpen} onOpenChange={setAccountOpen}
                placeholder="Konto suchen (Nummer oder Name)..."
              />
            </div>

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label className="text-sm mb-1.5 block">Zugang / Abgang *</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={form.booking_type === "expense" ? "default" : "outline"}
                    className={cn("flex-1 h-11 gap-2", form.booking_type === "expense" && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                    onClick={() => set("booking_type", "expense")}
                  >
                    <ArrowDownLeft className="h-4 w-4" />
                    Abgang
                  </Button>
                  <Button
                    type="button"
                    variant={form.booking_type === "income" ? "default" : "outline"}
                    className={cn("flex-1 h-11 gap-2", form.booking_type === "income" && "bg-green-600 hover:bg-green-700 text-white")}
                    onClick={() => set("booking_type", "income")}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Zugang
                  </Button>
                </div>
              </div>
              <div className="w-[180px]">
                <Label className="text-sm mb-1.5 block">Betrag (€) *</Label>
                <Input
                  type="number" step="0.01" value={form.amount}
                  onChange={e => set("amount", e.target.value)}
                  className="h-11 text-right text-lg font-semibold"
                  placeholder="0,00"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm mb-1.5 block">Gegenkonto (Haben)</Label>
              <AccountPicker
                value={form.counter_account_id} onChange={v => set("counter_account_id", v)}
                search={counterSearch} onSearchChange={setCounterSearch}
                isOpen={counterOpen} onOpenChange={setCounterOpen}
                placeholder="z.B. 1200 Bank, 1000 Kasse..."
              />
            </div>
          </div>

          {/* Row 2: Beleg */}
          <div className="rounded-xl border p-6 space-y-5">
            <p className="text-base font-semibold text-foreground">Beleg</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">Buchungskürzel</Label>
                <Input value={form.booking_reference} onChange={e => set("booking_reference", e.target.value)}
                  className="h-11" placeholder="z.B. HG" />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Beleg-Nr.</Label>
                <Input value={form.receipt_number} onChange={e => set("receipt_number", e.target.value)}
                  className="h-11" placeholder="z.B. RE-2026-001" />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Belegdatum *</Label>
                <Input type="date" value={form.booking_date} onChange={e => set("booking_date", e.target.value)}
                  className="h-11" />
              </div>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Buchungstext</Label>
              <Textarea value={form.description} onChange={e => set("description", e.target.value)}
                rows={2} placeholder="Beschreibung der Buchung..." />
            </div>
          </div>

          {/* Row 3: Steuer & Optionen */}
          <div className="rounded-xl border p-6 space-y-5">
            <p className="text-base font-semibold text-foreground">Steuer & Optionen</p>
            <div className="flex items-end gap-6 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-sm mb-2 block">MwSt-Satz</Label>
                <RadioGroup value={form.vat_rate} onValueChange={v => set("vat_rate", v)}
                  className="flex gap-4">
                  {VAT_RATES.map(r => (
                    <div key={r.value} className="flex items-center gap-2">
                      <RadioGroupItem value={r.value} id={`vat-${r.value}`} className="h-5 w-5" />
                      <Label htmlFor={`vat-${r.value}`} className="text-sm cursor-pointer">{r.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="w-[140px]">
                <Label className="text-sm mb-1.5 block">MwSt-Betrag</Label>
                <Input value={computedVat} readOnly className="h-11 text-right bg-muted font-medium" />
              </div>
              <div className="flex items-center gap-2.5 pb-1">
                <Checkbox
                  id="is_35a"
                  checked={form.is_35a_relevant}
                  onCheckedChange={c => set("is_35a_relevant", !!c)}
                  className="h-5 w-5"
                />
                <Label htmlFor="is_35a" className="text-sm cursor-pointer whitespace-nowrap font-medium">
                  §35a relevant
                </Label>
              </div>
            </div>
          </div>

          {/* Row 3b: Vorlage verknüpfen */}
          {bookingTemplates.length > 0 && (
            <div className="rounded-xl border p-6 space-y-5">
              <p className="text-base font-semibold text-foreground flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4" />
                Vorlage verknüpfen
              </p>
              <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full h-11 justify-between text-left font-normal",
                      !form.matched_template_id && "text-muted-foreground"
                    )}
                  >
                    <span className="truncate">
                      {form.matched_template_id
                        ? (() => {
                            const t = bookingTemplates.find((t: any) => t.id === form.matched_template_id);
                            return t ? `${t.name}${t.vendor_name ? ` – ${t.vendor_name}` : ''}` : "Vorlage wählen…";
                          })()
                        : "Vorlage wählen (optional)…"}
                    </span>
                    {form.matched_template_id ? (
                      <X className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); set("matched_template_id", ""); }} />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[460px] p-0" align="start">
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={templateSearch}
                        onChange={e => setTemplateSearch(e.target.value)}
                        placeholder="Vorlage suchen…"
                        className="pl-9 h-10"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-1">
                    {bookingTemplates
                      .filter((t: any) => {
                        const q = templateSearch.toLowerCase().trim();
                        if (!q) return true;
                        return (t.name || "").toLowerCase().includes(q) || (t.vendor_name || "").toLowerCase().includes(q);
                      })
                      .map((t: any) => (
                        <button
                          key={t.id}
                          onClick={() => { set("matched_template_id", t.id); setTemplateOpen(false); setTemplateSearch(""); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-md hover:bg-accent transition-colors",
                            form.matched_template_id === t.id && "bg-accent"
                          )}
                        >
                          <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {t.vendor_name || "–"}{t.expected_amount ? ` · ${Number(t.expected_amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : ""}
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Row 4: Leistungszeitraum (collapsible) */}
          <Collapsible open={showPeriod} onOpenChange={setShowPeriod}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="text-sm text-muted-foreground gap-2 px-0 h-auto">
                <ChevronDown className={`h-4 w-4 transition-transform ${showPeriod ? "rotate-180" : ""}`} />
                Leistungszeitraum
                {form.performance_period_from && (
                  <Badge variant="secondary" className="text-xs ml-1">gesetzt</Badge>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-1.5 block">Von</Label>
                  <Input type="date" value={form.performance_period_from}
                    onChange={e => set("performance_period_from", e.target.value)} className="h-11" />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Bis</Label>
                  <Input type="date" value={form.performance_period_to}
                    onChange={e => set("performance_period_to", e.target.value)} className="h-11" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter className="pt-4 gap-2">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button size="lg" onClick={handleSave} className="min-w-[140px]">Buchen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
