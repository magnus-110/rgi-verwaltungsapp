import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

export function CreateInvoiceDialog({ open, onOpenChange, buildings }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    building_id: "",
    invoice_number: "",
    vendor_name: "",
    invoice_date: "",
    due_date: "",
    gross_amount: "",
    net_amount: "",
    vat_amount: "",
    description: "",
  });

  const handleSave = async () => {
    if (!form.building_id || !form.vendor_name) {
      toast.error("Bitte Liegenschaft und Lieferant angeben");
      return;
    }
    const { error } = await supabase.from("invoices").insert({
      building_id: form.building_id,
      invoice_number: form.invoice_number || null,
      vendor_name: form.vendor_name,
      invoice_date: form.invoice_date || null,
      due_date: form.due_date || null,
      gross_amount: form.gross_amount ? parseFloat(form.gross_amount) : null,
      net_amount: form.net_amount ? parseFloat(form.net_amount) : null,
      vat_amount: form.vat_amount ? parseFloat(form.vat_amount) : null,
      description: form.description || null,
      created_by: user?.id,
      status: "open",
    });
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Rechnung angelegt");
    onOpenChange(false);
    setForm({ building_id: "", invoice_number: "", vendor_name: "", invoice_date: "", due_date: "", gross_amount: "", net_amount: "", vat_amount: "", description: "" });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const set = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rechnung manuell anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Liegenschaft *</Label>
            <Select value={form.building_id} onValueChange={v => set("building_id", v)}>
              <SelectTrigger><SelectValue placeholder="Auswählen..." /></SelectTrigger>
              <SelectContent>
                {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Lieferant *</Label>
              <Input value={form.vendor_name} onChange={e => set("vendor_name", e.target.value)} />
            </div>
            <div>
              <Label>Rechnungsnummer</Label>
              <Input value={form.invoice_number} onChange={e => set("invoice_number", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Rechnungsdatum</Label>
              <Input type="date" value={form.invoice_date} onChange={e => set("invoice_date", e.target.value)} />
            </div>
            <div>
              <Label>Fälligkeitsdatum</Label>
              <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Brutto (€)</Label>
              <Input type="number" step="0.01" value={form.gross_amount} onChange={e => set("gross_amount", e.target.value)} />
            </div>
            <div>
              <Label>Netto (€)</Label>
              <Input type="number" step="0.01" value={form.net_amount} onChange={e => set("net_amount", e.target.value)} />
            </div>
            <div>
              <Label>MwSt. (€)</Label>
              <Input type="number" step="0.01" value={form.vat_amount} onChange={e => set("vat_amount", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
