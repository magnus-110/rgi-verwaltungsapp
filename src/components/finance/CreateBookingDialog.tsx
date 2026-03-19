import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings: { id: string; name: string; building_code: string }[];
}

export function CreateBookingDialog({ open, onOpenChange, buildings }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    building_id: "",
    account_id: "",
    booking_date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
    fiscal_year: String(new Date().getFullYear()),
    performance_period_from: "",
    performance_period_to: "",
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chart_of_accounts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const handleSave = async () => {
    if (!form.building_id || !form.account_id || !form.amount || !form.booking_date) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    const { error } = await supabase.from("bookings").insert({
      building_id: form.building_id,
      account_id: form.account_id,
      booking_date: form.booking_date,
      amount: parseFloat(form.amount),
      description: form.description || null,
      fiscal_year: parseInt(form.fiscal_year),
      performance_period_from: form.performance_period_from || null,
      performance_period_to: form.performance_period_to || null,
      source: "manual",
      status: "pending",
      created_by: user?.id,
    });
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Buchung angelegt");
    onOpenChange(false);
    setForm({ building_id: "", account_id: "", booking_date: new Date().toISOString().split("T")[0], amount: "", description: "", fiscal_year: String(new Date().getFullYear()), performance_period_from: "", performance_period_to: "" });
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const set = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  const groupedAccounts = accounts.reduce((acc: Record<string, typeof accounts>, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manuelle Buchung erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Liegenschaft *</Label>
              <Select value={form.building_id} onValueChange={v => set("building_id", v)}>
                <SelectTrigger><SelectValue placeholder="Auswählen..." /></SelectTrigger>
                <SelectContent>
                  {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Geschäftsjahr *</Label>
              <Input type="number" value={form.fiscal_year} onChange={e => set("fiscal_year", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Konto *</Label>
            <Select value={form.account_id} onValueChange={v => set("account_id", v)}>
              <SelectTrigger><SelectValue placeholder="Konto auswählen..." /></SelectTrigger>
              <SelectContent>
                {Object.entries(groupedAccounts).map(([cat, accs]) => (
                  <div key={cat}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{cat}</div>
                    {accs.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_number} – {a.account_name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Buchungsdatum *</Label>
              <Input type="date" value={form.booking_date} onChange={e => set("booking_date", e.target.value)} />
            </div>
            <div>
              <Label>Betrag (€) *</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Leistungszeitraum von</Label>
              <Input type="date" value={form.performance_period_from} onChange={e => set("performance_period_from", e.target.value)} />
            </div>
            <div>
              <Label>Leistungszeitraum bis</Label>
              <Input type="date" value={form.performance_period_to} onChange={e => set("performance_period_to", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave}>Buchen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
