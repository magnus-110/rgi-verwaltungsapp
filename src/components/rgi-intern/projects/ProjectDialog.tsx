// Projekt anlegen und bearbeiten.
//
// Beim Anlegen sind es drei Fragen: wozu gehört es, wie heißt es,
// welcher Stundensatz. Bereich und Status ergeben sich von selbst —
// ein neues Projekt läuft, und der Bereich kommt vom Objekt.
//
// Beim Bearbeiten fällt die erste Frage weg (der Kunde eines Projekts
// wechselt nicht), dafür gibt es Status, Notizen und das Löschen.

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Search, Trash2, Building2, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useUpsertRgiProject, useUpsertRgiClient, useDeleteRgiProject,
  type RgiProject, type RgiClient,
} from "@/hooks/useRgi";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: RgiProject | null;
  clients: RgiClient[];
  onCreated?: (projectId: string) => void;
}

type Source = "building" | "contact";

const STATUS: { key: string; label: string }[] = [
  { key: "active", label: "Läuft" },
  { key: "paused", label: "Pausiert" },
  { key: "closed", label: "Abgeschlossen" },
];

const DEFAULT_RATE = 77.35;

export function ProjectDialog({ open, onOpenChange, project, clients, onCreated }: Props) {
  const upsert = useUpsertRgiProject();
  const upsertClient = useUpsertRgiClient();
  const del = useDeleteRgiProject();

  const isEdit = !!project?.id;

  const [name, setName] = useState("");
  const [rate, setRate] = useState(String(DEFAULT_RATE).replace(".", ","));
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<Source>("building");
  const [pickedId, setPickedId] = useState("");
  const [search, setSearch] = useState("");
  const [buildings, setBuildings] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [askDelete, setAskDelete] = useState(false);
  // Wie viele Stunden am Projekt hängen — abgerechnete blockieren das
  // Löschen, weil sie auf einer Rechnung stehen.
  const [hanging, setHanging] = useState<{ total: number; billed: number } | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setRate(
      project?.default_hourly_rate != null
        ? String(project.default_hourly_rate).replace(".", ",")
        : String(DEFAULT_RATE).replace(".", ","),
    );
    setStatus(project?.status ?? "active");
    setNotes((project as any)?.notes ?? "");
    setSearch("");
    setAskDelete(false);
    const prefill = (project as any)?.__prefillBuildingId as string | undefined;
    setSource("building");
    setPickedId(prefill ?? "");
    if (isEdit && !prefill) return; // Auswahllisten braucht nur das Anlegen
    (supabase as any).from("buildings").select("id, name, address, city, management_mode").order("name")
      .then(({ data }: any) => setBuildings(data ?? []));
    (supabase as any).from("contacts").select("id, name, email").order("name")
      .then(({ data }: any) => setContacts(data ?? []));
  }, [open, project, isEdit]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = source === "building" ? buildings : contacts;
    const hit = (x: any) =>
      !q ||
      (x.name ?? "").toLowerCase().includes(q) ||
      (x.city ?? "").toLowerCase().includes(q) ||
      (x.address ?? "").toLowerCase().includes(q) ||
      (x.email ?? "").toLowerCase().includes(q);
    return src.filter(hit).slice(0, 60);
  }, [search, source, buildings, contacts]);

  const pickedName = useMemo(() => {
    const src = source === "building" ? buildings : contacts;
    return src.find((x) => x.id === pickedId)?.name ?? "";
  }, [pickedId, source, buildings, contacts]);

  const parsedRate = rate.trim() === "" ? null : Number(rate.replace(",", "."));
  const canSave = !!name.trim() && (isEdit || !!pickedId) && (parsedRate === null || !isNaN(parsedRate));
  const busy = upsert.isPending || upsertClient.isPending;

  const pick = (id: string) => {
    setPickedId(id);
    if (name.trim()) return;
    const src = source === "building" ? buildings : contacts;
    const found = src.find((x) => x.id === id);
    if (found?.name && source === "contact") setName(found.name);
  };

  const submit = async () => {
    if (!canSave) return;

    if (isEdit) {
      const client = clients.find((c) => c.id === project!.client_id);
      const saved = await upsert.mutateAsync({
        id: project!.id,
        client_id: project!.client_id,
        name: name.trim(),
        default_hourly_rate: parsedRate,
        status,
        notes: notes.trim() || null,
        // Objektbezug nachziehen: viele ältere Projekte hängen nur über
        // den Kunden am Objekt, was Auswertungen je Liegenschaft erschwert.
        building_id: (project as any).building_id ?? client?.building_id ?? null,
      } as any);
      onOpenChange(false);
      if (saved) onCreated?.(saved.id);
      return;
    }

    // Neu: passenden Kunden finden oder anlegen.
    let clientId: string | undefined;
    let buildingId: string | null = null;
    let sparte = "weg";

    if (source === "building") {
      const b = buildings.find((x) => x.id === pickedId);
      buildingId = pickedId;
      if (b?.management_mode) sparte = b.management_mode;
      const existing = clients.find((c) => c.building_id === pickedId);
      clientId = existing
        ? existing.id
        : (await upsertClient.mutateAsync({
            type: "building", building_id: pickedId,
            name: b?.name ?? "Objekt", address_line1: b?.address ?? null,
          } as any)).id;
    } else {
      const c = contacts.find((x) => x.id === pickedId);
      const existing = clients.find((cl) => cl.contact_id === pickedId);
      sparte = "other";
      clientId = existing
        ? existing.id
        : (await upsertClient.mutateAsync({
            type: "contact", contact_id: pickedId,
            name: c?.name ?? "Kontakt", email: c?.email ?? null,
          } as any)).id;
    }
    if (!clientId) return;

    const saved = await upsert.mutateAsync({
      client_id: clientId,
      building_id: buildingId,
      name: name.trim(),
      default_hourly_rate: parsedRate,
      sparte,
      status: "active",
    } as any);
    onOpenChange(false);
    if (saved) onCreated?.(saved.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Projekt bearbeiten" : "Neues Projekt"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {!isEdit && (
            <div>
              <Label className="text-sm font-semibold">Wozu gehört das Projekt?</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button" size="sm" className="rounded-full gap-1.5"
                  variant={source === "building" ? "default" : "outline"}
                  onClick={() => { setSource("building"); setPickedId(""); setSearch(""); }}
                >
                  <Building2 className="w-3.5 h-3.5" />Ein Objekt
                </Button>
                <Button
                  type="button" size="sm" className="rounded-full gap-1.5"
                  variant={source === "contact" ? "default" : "outline"}
                  onClick={() => { setSource("contact"); setPickedId(""); setSearch(""); }}
                >
                  <User className="w-3.5 h-3.5" />Person oder Firma
                </Button>
              </div>

              <div className="relative mt-2.5">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="border rounded-md divide-y mt-2 max-h-48 overflow-y-auto">
                {list.map((x: any) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => pick(x.id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                      pickedId === x.id ? "bg-primary/10 font-medium" : "hover:bg-muted"
                    }`}
                  >
                    <span className="flex-1 min-w-0 truncate">{x.name}</span>
                    {source === "building" && x.management_mode && (
                      <Badge variant="outline" className="shrink-0 h-4 px-1.5 text-[10px] font-normal">
                        {x.management_mode === "weg" ? "WEG" : "Miete"}
                      </Badge>
                    )}
                    {pickedId === x.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
                {list.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nichts gefunden.</div>
                )}
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-semibold">Wie soll es heißen?</Label>
            <Input
              className="mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Eingangsplattform"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              {pickedName
                ? `„${pickedName}“ steht schon dabei — nenn hier nur die Arbeit.`
                : "Kurz und konkret — der Name steht später auf der Rechnung."}
            </p>
          </div>

          <div>
            <Label className="text-sm font-semibold">Stundensatz</Label>
            <div className="relative mt-2 max-w-[170px]">
              <Input
                inputMode="decimal"
                className="pr-7 tabular-nums"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Unser Standard ist 77,35 € inkl. MwSt. Gilt für alle Stunden in diesem Projekt.
            </p>
          </div>

          {isEdit && (
            <>
              <div>
                <Label className="text-sm font-semibold">Status</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {STATUS.map((s) => (
                    <Button
                      key={s.key}
                      type="button" size="sm" className="rounded-full"
                      variant={status === s.key ? "default" : "outline"}
                      onClick={() => setStatus(s.key)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold">Notizen</Label>
                <Textarea className="mt-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isEdit && (
            <Button
              variant="ghost"
              className="mr-auto gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={async () => {
                setHanging(null);
                setAskDelete(true);
                const { data } = await supabase
                  .from("rgi_time_entries")
                  .select("id, invoice_item_id")
                  .eq("project_id", project!.id);
                setHanging({
                  total: (data ?? []).length,
                  billed: (data ?? []).filter((r: any) => r.invoice_item_id).length,
                });
              }}
            >
              <Trash2 className="w-4 h-4" />Projekt löschen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!canSave || busy}>
            {busy ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hanging && hanging.billed > 0 ? "Geht nicht mehr" : "Projekt löschen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hanging === null ? (
                "Einen Moment — ich schaue nach, was am Projekt hängt."
              ) : hanging.billed > 0 ? (
                <>
                  An „{project?.name}“ hängen {hanging.billed} bereits abgerechnete
                  {hanging.billed === 1 ? " Stunde" : " Stunden"}. Die stehen auf einer
                  Rechnung und dürfen nicht verschwinden. Setz das Projekt stattdessen
                  auf „Abgeschlossen“ — dann ist es aus der Liste, bleibt aber
                  nachvollziehbar.
                </>
              ) : hanging.total > 0 ? (
                <>
                  „{project?.name}“ wird gelöscht, zusammen mit
                  {hanging.total === 1 ? " einem erfassten Eintrag" : ` ${hanging.total} erfassten Einträgen`}.
                  Das lässt sich nicht rückgängig machen. Willst du es nur aus der Liste
                  haben, setz es besser auf „Abgeschlossen“.
                </>
              ) : (
                <>„{project?.name}“ wird gelöscht. Erfasste Stunden gibt es keine.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{hanging && hanging.billed > 0 ? "Zurück" : "Abbrechen"}</AlertDialogCancel>
            {!(hanging && hanging.billed > 0) && (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={hanging === null}
                onClick={async () => {
                  if (!project?.id) return;
                  try {
                    if ((hanging?.total ?? 0) > 0) {
                      const { error } = await supabase
                        .from("rgi_time_entries").delete().eq("project_id", project.id);
                      if (error) throw error;
                      qc.invalidateQueries({ queryKey: ["rgi", "time"] });
                    }
                    await del.mutateAsync(project.id);
                    setAskDelete(false);
                    onOpenChange(false);
                  } catch (e: any) {
                    toast.error(e.message ?? String(e));
                  }
                }}
              >
                Endgültig löschen
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
