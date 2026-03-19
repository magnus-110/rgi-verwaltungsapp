import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings: { id: string; name: string; building_code: string }[];
}

const VAT_RATES = [
  { value: "0", label: "0 %" },
  { value: "7", label: "7 %" },
  { value: "19", label: "19 %" },
];

export function CreateBookingDialog({ open, onOpenChange, buildings }: Props) {
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
  });
  const [accountSearch, setAccountSearch] = useState("");
  const [counterSearch, setCounterSearch] = useState("");
  const [showPeriod, setShowPeriod] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chart_of_accounts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.toLowerCase();
    return q ? accounts.filter(a => a.account_number.includes(q) || a.account_name.toLowerCase().includes(q)) : accounts;
  }, [accounts, accountSearch]);

  const filteredCounterAccounts = useMemo(() => {
    const q = counterSearch.toLowerCase();
    return q ? accounts.filter(a => a.account_number.includes(q) || a.account_name.toLowerCase().includes(q)) : accounts;
  }, [accounts, counterSearch]);

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
    const a = accounts.find(a => a.id === id);
    return a ? `${a.account_number} – ${a.account_name}` : "";
  };

  const handleSave = async () => {
    if (!form.building_id || !form.account_id || !form.amount || !form.booking_date) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    const { error } = await supabase.from("bookings").insert({
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
    } as any);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Buchung angelegt");
    onOpenChange(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const resetForm = () => {
    setForm({
      building_id: "", account_id: "", counter_account_id: "",
      booking_date: new Date().toISOString().split("T")[0],
      amount: "", description: "", fiscal_year: String(new Date().getFullYear()),
      performance_period_from: "", performance_period_to: "",
      booking_type: "expense", receipt_number: "", booking_reference: "",
      vat_rate: "19", is_35a_relevant: false,
    });
    setAccountSearch("");
    setCounterSearch("");
    setShowPeriod(false);
  };

  const set = (key: string, value: string | boolean) => setForm(p => ({ ...p, [key]: value }));

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const AccountSelect = ({ value, onChange, search, onSearchChange, filtered, placeholder }: {
    value: string; onChange: (v: string) => void; search: string;
    onSearchChange: (v: string) => void; filtered: typeof accounts; placeholder: string;
  }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder={placeholder}>
          {value ? <span className="truncate">{getAccountLabel(value)}</span> : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <div className="p-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Suchen..."
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        {Object.entries(groupAccounts(filtered)).map(([cat, accs]) => (
          <div key={cat}>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{cat}</div>
            {accs.map(a => (
              <SelectItem key={a.id} value={a.id} className="text-xs">
                <span className="font-mono">{a.account_number}</span> – {a.account_name}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manuelle Buchung erstellen</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Row 1: Liegenschaft & Geschäftsjahr */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium">Liegenschaft *</Label>
              <Select value={form.building_id} onValueChange={v => set("building_id", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Auswählen..." /></SelectTrigger>
                <SelectContent>
                  {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Geschäftsjahr *</Label>
              <Select value={form.fiscal_year} onValueChange={v => set("fiscal_year", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Konto & Betrag */}
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buchung</p>
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
              <div>
                <Label className="text-xs">Konto (Soll) *</Label>
                <AccountSelect
                  value={form.account_id} onChange={v => set("account_id", v)}
                  search={accountSearch} onSearchChange={setAccountSearch}
                  filtered={filteredAccounts} placeholder="Konto suchen..."
                />
              </div>
              <div>
                <Label className="text-xs">Typ</Label>
                <Select value={form.booking_type} onValueChange={v => set("booking_type", v)}>
                  <SelectTrigger className="h-9 w-[120px] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Abgang</SelectItem>
                    <SelectItem value="income">Zugang</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Betrag (€) *</Label>
                <Input
                  type="number" step="0.01" value={form.amount}
                  onChange={e => set("amount", e.target.value)}
                  className="h-9 w-[130px] text-sm text-right font-medium"
                  placeholder="0,00"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Gegenkonto (Haben)</Label>
              <AccountSelect
                value={form.counter_account_id} onChange={v => set("counter_account_id", v)}
                search={counterSearch} onSearchChange={setCounterSearch}
                filtered={filteredCounterAccounts} placeholder="z.B. Bank, Kasse..."
              />
            </div>
          </div>

          {/* Row 3: Beleg */}
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Beleg</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Buchungskürzel</Label>
                <Input value={form.booking_reference} onChange={e => set("booking_reference", e.target.value)}
                  className="h-9 text-sm" placeholder="z.B. HG" />
              </div>
              <div>
                <Label className="text-xs">Beleg-Nr.</Label>
                <Input value={form.receipt_number} onChange={e => set("receipt_number", e.target.value)}
                  className="h-9 text-sm" placeholder="z.B. RE-2026-001" />
              </div>
              <div>
                <Label className="text-xs">Belegdatum *</Label>
                <Input type="date" value={form.booking_date} onChange={e => set("booking_date", e.target.value)}
                  className="h-9 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Buchungstext</Label>
              <Textarea value={form.description} onChange={e => set("description", e.target.value)}
                rows={2} className="text-sm" placeholder="Beschreibung der Buchung..." />
            </div>
          </div>

          {/* Row 4: Steuer & Optionen */}
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Steuer & Optionen</p>
            <div className="flex items-end gap-6">
              <div className="flex-1">
                <Label className="text-xs mb-2 block">MwSt-Satz</Label>
                <RadioGroup value={form.vat_rate} onValueChange={v => set("vat_rate", v)}
                  className="flex gap-3">
                  {VAT_RATES.map(r => (
                    <div key={r.value} className="flex items-center gap-1.5">
                      <RadioGroupItem value={r.value} id={`vat-${r.value}`} />
                      <Label htmlFor={`vat-${r.value}`} className="text-xs cursor-pointer">{r.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="w-[120px]">
                <Label className="text-xs">MwSt-Betrag</Label>
                <Input value={computedVat} readOnly className="h-9 text-sm text-right bg-muted" />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  id="is_35a"
                  checked={form.is_35a_relevant}
                  onCheckedChange={c => set("is_35a_relevant", !!c)}
                />
                <Label htmlFor="is_35a" className="text-xs cursor-pointer whitespace-nowrap">
                  §35a relevant
                </Label>
              </div>
            </div>
          </div>

          {/* Row 5: Leistungszeitraum (collapsible) */}
          <Collapsible open={showPeriod} onOpenChange={setShowPeriod}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 px-0">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPeriod ? "rotate-180" : ""}`} />
                Leistungszeitraum {form.performance_period_from && (
                  <Badge variant="secondary" className="text-[10px] ml-1">gesetzt</Badge>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Von</Label>
                  <Input type="date" value={form.performance_period_from}
                    onChange={e => set("performance_period_from", e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Bis</Label>
                  <Input type="date" value={form.performance_period_to}
                    onChange={e => set("performance_period_to", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave}>Buchen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
