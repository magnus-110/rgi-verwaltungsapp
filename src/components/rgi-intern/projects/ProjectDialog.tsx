import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpsertRgiProject, useUpsertRgiClient, type RgiProject, type RgiClient } from "@/hooks/useRgi";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: RgiProject | null;
  clients: RgiClient[];
}

type Source = "client" | "contact" | "building";

export function ProjectDialog({ open, onOpenChange, project, clients }: Props) {
  const upsert = useUpsertRgiProject();
  const upsertClient = useUpsertRgiClient();
  const [form, setForm] = useState<any>({});
  const [source, setSource] = useState<Source>("client");
  const [contacts, setContacts] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [contactId, setContactId] = useState<string>("");
  const [buildingId, setBuildingId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const prefillBuildingId = (project as any)?.__prefillBuildingId as string | undefined;
      setForm(project ?? { name: "", sparte: "weg", status: "active", default_hourly_rate: 77.35 });
      if (prefillBuildingId) {
        setSource("building");
        setBuildingId(prefillBuildingId);
      } else {
        setSource("client");
        setContactId("");
        setBuildingId("");
      }
      supabase.from("contacts").select("id, name, email").order("name").then(({ data }) => setContacts(data ?? []));
      supabase.from("buildings").select("id, name, address, management_mode").order("name").then(({ data }) => setBuildings(data ?? []));
    }
  }, [open, project]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const canSave = !!form.name && (
    source === "client" ? !!form.client_id :
    source === "contact" ? !!contactId :
    !!buildingId
  );

  const submit = async () => {
    let clientId = form.client_id;
    if (source === "contact" && contactId) {
      const c = contacts.find((x) => x.id === contactId);
      const existing = clients.find((cl) => cl.contact_id === contactId);
      if (existing) clientId = existing.id;
      else {
        const created = await upsertClient.mutateAsync({
          type: "contact", contact_id: contactId, name: c?.name ?? "Kontakt", email: c?.email ?? null,
        } as any);
        clientId = created.id;
      }
    } else if (source === "building" && buildingId) {
      const b = buildings.find((x) => x.id === buildingId);
      const existing = clients.find((cl) => cl.building_id === buildingId);
      if (existing) clientId = existing.id;
      else {
        const created = await upsertClient.mutateAsync({
          type: "building", building_id: buildingId, name: b?.name ?? "Gebäude",
          address_line1: b?.address ?? null,
        } as any);
        clientId = created.id;
      }
    }
    if (!clientId) return;
    await upsert.mutateAsync({ ...form, client_id: clientId });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{project ? "Projekt bearbeiten" : "Neues Projekt"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>

          <div>
            <Label>Adressat *</Label>
            <Select value={source} onValueChange={(v) => setSource(v as Source)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contact">Kontakt</SelectItem>
                <SelectItem value="building">Gebäude</SelectItem>
                <SelectItem value="client">Bestehender Kunde</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {source === "client" && (
            <div>
              <Label>Kunde *</Label>
              <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
                <SelectTrigger><SelectValue placeholder="Kunde wählen…" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {source === "contact" && (
            <div>
              <Label>Kontakt *</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {contactId ? contacts.find((c) => c.id === contactId)?.name : "Kontakt wählen…"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[400px]">
                  <Command><CommandInput placeholder="Suchen…" /><CommandList>
                    <CommandEmpty>Keine Kontakte.</CommandEmpty>
                    <CommandGroup>
                      {contacts.map((c) => (
                        <CommandItem key={c.id} onSelect={() => { setContactId(c.id); setPickerOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", contactId === c.id ? "opacity-100" : "opacity-0")} />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList></Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {source === "building" && (
            <div>
              <Label>Gebäude *</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {buildingId ? buildings.find((b) => b.id === buildingId)?.name : "Gebäude wählen…"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[400px]">
                  <Command><CommandInput placeholder="Suchen…" /><CommandList>
                    <CommandEmpty>Keine Gebäude.</CommandEmpty>
                    <CommandGroup>
                      {buildings.map((b) => (
                        <CommandItem key={b.id} value={`${b.name} ${b.address ?? ""}`} onSelect={() => { setBuildingId(b.id); set("sparte", b.management_mode ?? form.sparte); setPickerOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", buildingId === b.id ? "opacity-100" : "opacity-0")} />
                          <span>{b.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList></Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sparte</Label>
              <Select value={form.sparte} onValueChange={(v) => set("sparte", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weg">WEG</SelectItem>
                  <SelectItem value="rent">Mietverwaltung</SelectItem>
                  <SelectItem value="sales">Verkauf</SelectItem>
                  <SelectItem value="letting">Vermietung</SelectItem>
                  <SelectItem value="other">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="paused">Pausiert</SelectItem>
                  <SelectItem value="closed">Geschlossen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Std-Stundensatz (€ inkl. MwSt.)</Label>
            <Input type="number" step="0.01" value={form.default_hourly_rate ?? ""}
              onChange={(e) => set("default_hourly_rate", e.target.value === "" ? null : Number(e.target.value))} />
            <p className="text-xs text-muted-foreground mt-1">Standard: 77,35 € inkl. MwSt.</p>
          </div>
          <div><Label>Notizen</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!canSave || upsert.isPending || upsertClient.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
