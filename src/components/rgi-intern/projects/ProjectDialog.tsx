import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronDown, Search } from "lucide-react";
import { useUpsertRgiProject, useUpsertRgiClient, type RgiProject, type RgiClient } from "@/hooks/useRgi";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: RgiProject | null;
  clients: RgiClient[];
}

type Source = "building" | "contact" | "client";

const SOURCE_LABEL: Record<Source, string> = {
  building: "Ein Objekt",
  contact: "Eine Person oder Firma",
  client: "Ein bestehender Kunde",
};

const SPARTE_LABEL: Record<string, string> = {
  weg: "WEG-Verwaltung",
  rent: "Mietverwaltung",
  sales: "Verkauf",
  letting: "Vermietung",
  other: "Sonstiges",
};

const DEFAULT_RATE = 77.35;

export function ProjectDialog({ open, onOpenChange, project, clients }: Props) {
  const upsert = useUpsertRgiProject();
  const upsertClient = useUpsertRgiClient();

  const [form, setForm] = useState<any>({});
  const [source, setSource] = useState<Source>("building");
  const [contacts, setContacts] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [contactId, setContactId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [search, setSearch] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prefillBuildingId = (project as any)?.__prefillBuildingId as string | undefined;
    setForm(project ?? { name: "", sparte: "weg", status: "active", default_hourly_rate: DEFAULT_RATE });
    setSearch("");
    setMoreOpen(false);
    if (prefillBuildingId) {
      setSource("building");
      setBuildingId(prefillBuildingId);
    } else if (project?.client_id) {
      setSource("client");
      setContactId("");
      setBuildingId("");
    } else {
      setSource("building");
      setContactId("");
      setBuildingId("");
    }
    (supabase as any).from("contacts").select("id, name, email").order("name")
      .then(({ data }: any) => setContacts(data ?? []));
    (supabase as any).from("buildings").select("id, name, address, city, management_mode").order("name")
      .then(({ data }: any) => setBuildings(data ?? []));
  }, [open, project]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = source === "building" ? buildings : contacts;
    if (!q) return src.slice(0, 60);
    return src
      .filter((x: any) =>
        (x.name ?? "").toLowerCase().includes(q) ||
        (x.city ?? "").toLowerCase().includes(q) ||
        (x.address ?? "").toLowerCase().includes(q) ||
        (x.email ?? "").toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [search, source, buildings, contacts]);

  const canSave =
    !!(form.name ?? "").trim() &&
    (source === "client" ? !!form.client_id : source === "contact" ? !!contactId : !!buildingId);

  const pick = (id: string) => {
    if (source === "building") {
      setBuildingId(id);
      const b = buildings.find((x) => x.id === id);
      if (b?.management_mode) set("sparte", b.management_mode);
      if (!(form.name ?? "").trim() && b?.name) set("name", b.name);
    } else {
      setContactId(id);
      const c = contacts.find((x) => x.id === id);
      if (!(form.name ?? "").trim() && c?.name) set("name", c.name);
    }
  };

  const submit = async () => {
    let clientId = form.client_id;
    if (source === "contact" && contactId) {
      const c = contacts.find((x) => x.id === contactId);
      const existing = clients.find((cl) => cl.contact_id === contactId);
      clientId = existing
        ? existing.id
        : (await upsertClient.mutateAsync({
            type: "contact", contact_id: contactId, name: c?.name ?? "Kontakt", email: c?.email ?? null,
          } as any)).id;
    } else if (source === "building" && buildingId) {
      const b = buildings.find((x) => x.id === buildingId);
      const existing = clients.find((cl) => cl.building_id === buildingId);
      clientId = existing
        ? existing.id
        : (await upsertClient.mutateAsync({
            type: "building", building_id: buildingId, name: b?.name ?? "Gebäude",
            address_line1: b?.address ?? null,
          } as any)).id;
    }
    if (!clientId) return;
    await upsert.mutateAsync({
      ...form,
      client_id: clientId,
      // Objektbezug direkt am Projekt, damit sich auswerten lässt,
      // was ein Objekt jenseits des Grundhonorars einbringt.
      building_id: source === "building" ? buildingId || null : form.building_id ?? null,
    });
    onOpenChange(false);
  };

  const selectedName =
    source === "building"
      ? buildings.find((b) => b.id === buildingId)?.name
      : source === "contact"
      ? contacts.find((c) => c.id === contactId)?.name
      : clients.find((c) => c.id === form.client_id)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Projekt bearbeiten" : "Neues Projekt"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="text-base">Für wen ist das Projekt?</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {(["building", "contact", "client"] as Source[]).map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={source === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSource(s); setSearch(""); }}
                >
                  {SOURCE_LABEL[s]}
                </Button>
              ))}
            </div>
          </div>

          {source === "client" ? (
            <div>
              <Label>Kunde</Label>
              <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Kunde wählen…" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>{source === "building" ? "Welches Objekt?" : "Wer genau?"}</Label>
              <div className="relative mt-1.5">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="border rounded-md divide-y mt-2 max-h-52 overflow-y-auto">
                {list.map((x: any) => {
                  const active = source === "building" ? buildingId === x.id : contactId === x.id;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => pick(x.id)}
                      className={
                        active
                          ? "w-full text-left px-3 py-2 flex items-center gap-2 bg-primary/10"
                          : "w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted transition-colors"
                      }
                    >
                      <span className="flex-1 min-w-0 truncate text-sm">{x.name}</span>
                      {source === "building" && x.management_mode && (
                        <Badge variant="outline" className="shrink-0 text-[11px]">
                          {x.management_mode === "weg" ? "WEG" : "Miete"}
                        </Badge>
                      )}
                      {active && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
                {list.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nichts gefunden.</div>
                )}
              </div>
            </div>
          )}

          <div>
            <Label className="text-base">Wie soll das Projekt heißen?</Label>
            <Input
              className="mt-1.5"
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder={selectedName ? `z. B. Sanierung Dach ${selectedName}` : "z. B. Sanierung Dach"}
            />
          </div>

          <div>
            <Label className="text-base">Stundensatz</Label>
            <div className="relative mt-1.5 max-w-[180px]">
              <Input
                inputMode="decimal"
                className="pr-7"
                value={form.default_hourly_rate ?? ""}
                onChange={(e) =>
                  set("default_hourly_rate", e.target.value === "" ? null : Number(e.target.value.replace(",", ".")))
                }
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Gilt für alle Stunden in diesem Projekt. Unser Standard ist 77,35 € inkl. MwSt.
            </p>
          </div>

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                <ChevronDown className={`w-4 h-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                Weitere Angaben
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Bereich</Label>
                  <Select value={form.sparte ?? "weg"} onValueChange={(v) => set("sparte", v)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SPARTE_LABEL).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Wird beim Objekt automatisch gesetzt.</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status ?? "active"} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Läuft</SelectItem>
                      <SelectItem value="paused">Pausiert</SelectItem>
                      <SelectItem value="closed">Abgeschlossen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notizen</Label>
                <Textarea className="mt-1.5" rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!canSave || upsert.isPending || upsertClient.isPending}>
            {upsert.isPending || upsertClient.isPending ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
