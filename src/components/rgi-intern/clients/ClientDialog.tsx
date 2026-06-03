import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpsertRgiClient, type RgiClient } from "@/hooks/useRgi";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client?: RgiClient | null;
}

export function ClientDialog({ open, onOpenChange, client }: Props) {
  const upsert = useUpsertRgiClient();
  const [form, setForm] = useState<any>({ type: "free", name: "", country: "Deutschland" });
  const [contacts, setContacts] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(client ?? { type: "free", name: "", country: "Deutschland", default_payment_terms_days: 14 });
      supabase.from("contacts").select("id, name, email").order("name").then(({ data }) => setContacts(data ?? []));
      supabase.from("buildings").select("id, name, address").order("name").then(({ data }) => setBuildings(data ?? []));
    }
  }, [open, client]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const pickContact = (c: any) => {
    setForm((f: any) => ({ ...f, contact_id: c.id, building_id: null, type: "contact", name: c.name, email: c.email ?? f.email }));
    setContactOpen(false);
  };
  const pickBuilding = (b: any) => {
    setForm((f: any) => ({
      ...f, building_id: b.id, contact_id: null, type: "building",
      name: b.name, address_line1: b.address ?? null,
    }));
    setBuildingOpen(false);
  };

  const submit = async () => {
    if (!form.name) return;
    await upsert.mutateAsync(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{client ? "Kunde bearbeiten" : "Neuer Kunde"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!client && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Aus Kontakt</Label>
                <Popover open={contactOpen} onOpenChange={setContactOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {form.contact_id ? contacts.find((c) => c.id === form.contact_id)?.name : "Wählen…"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[400px]">
                    <Command><CommandInput placeholder="Kontakt suchen…" /><CommandList>
                      <CommandEmpty>Keine Kontakte.</CommandEmpty>
                      <CommandGroup>
                        {contacts.map((c) => (
                          <CommandItem key={c.id} onSelect={() => pickContact(c)}>
                            <Check className={cn("mr-2 h-4 w-4", form.contact_id === c.id ? "opacity-100" : "opacity-0")} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList></Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Aus Gebäude</Label>
                <Popover open={buildingOpen} onOpenChange={setBuildingOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {form.building_id ? buildings.find((b) => b.id === form.building_id)?.name : "Wählen…"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[400px]">
                    <Command><CommandInput placeholder="Gebäude suchen…" /><CommandList>
                      <CommandEmpty>Keine Gebäude.</CommandEmpty>
                      <CommandGroup>
                        {buildings.map((b) => (
                          <CommandItem key={b.id} onSelect={() => pickBuilding(b)}>
                            <Check className={cn("mr-2 h-4 w-4", form.building_id === b.id ? "opacity-100" : "opacity-0")} />
                            {b.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList></Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <div><Label>Kundennr.</Label><Input value={form.customer_no ?? ""} onChange={(e) => set("customer_no", e.target.value)} /></div>
            <div className="col-span-2"><Label>Adresse</Label><Input value={form.address_line1 ?? ""} onChange={(e) => set("address_line1", e.target.value)} /></div>
            <div><Label>PLZ</Label><Input value={form.zip ?? ""} onChange={(e) => set("zip", e.target.value)} /></div>
            <div><Label>Stadt</Label><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></div>
            <div><Label>Land</Label><Input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} /></div>
            <div><Label>E-Mail</Label><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>USt-IdNr.</Label><Input value={form.vat_id ?? ""} onChange={(e) => set("vat_id", e.target.value)} /></div>
            <div><Label>Zahlungsziel (Tage)</Label><Input type="number" value={form.default_payment_terms_days ?? 14} onChange={(e) => set("default_payment_terms_days", Number(e.target.value))} /></div>
            <div><Label>Std-Stundensatz (€)</Label><Input type="number" step="0.01" value={form.default_hourly_rate ?? ""} onChange={(e) => set("default_hourly_rate", e.target.value === "" ? null : Number(e.target.value))} /></div>
            <div className="col-span-2">
              <Label>Typ</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Frei</SelectItem>
                  <SelectItem value="contact">Kontakt</SelectItem>
                  <SelectItem value="building">Gebäude</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!form.name || upsert.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
