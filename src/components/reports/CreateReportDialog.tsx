import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  BuildingContact,
  REPORT_CHANNEL_LABEL,
  ROLE_LABEL,
  ReportChannel,
  useBuildingContacts,
  useCreateReport,
} from "@/hooks/useReports";
import { MiniTag } from "./reportUi";
import { errorMessage } from "@/lib/reports";

export interface ReportPrefill {
  title?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  buildingId?: string | null;
  sourceEmailId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Gesetzt, wenn die Meldung aus einer E-Mail übernommen wird. */
  prefill?: ReportPrefill | null;
  onCreated?: (report: { id: string; report_number: string; status: string }) => void;
}

const MANUAL_CHANNELS: ReportChannel[] = ["phone", "letter", "in_person", "email"];

/**
 * Meldung von Hand erfassen (Anruf, Brief) oder aus einer E-Mail übernehmen.
 *
 * Erst das Gebäude, dann die Melder aus den Kontakten dieses Gebäudes. Wer
 * ein App-Konto hat, sieht die Meldung danach im Portal — mit Stand und
 * Nachrichten, als hätte er sie selbst abgegeben. Ist der Melder kein Kontakt
 * (z. B. ein Nachbar am Telefon), trägt man Name und Erreichbarkeit von Hand ein.
 */
export function CreateReportDialog({ open, onOpenChange, prefill, onCreated }: Props) {
  const fromEmail = !!prefill?.sourceEmailId;
  const create = useCreateReport();
  const [buildingId, setBuildingId] = useState("");
  const [channel, setChannel] = useState<ReportChannel>("phone");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-for-reports"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, management_mode")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contacts = [], isLoading: contactsLoading } = useBuildingContacts(open && buildingId ? buildingId : null);

  useEffect(() => {
    if (!open) return;
    setBuildingId(prefill?.buildingId || "");
    setChannel(fromEmail ? "email" : "phone");
    setTitle(prefill?.title || "");
    setDescription(prefill?.description || "");
    setSelected([]);
    setContactSearch("");
    setName(prefill?.contactName || "");
    setEmail(prefill?.contactEmail || "");
    setPhone("");
    // Nur beim Öffnen übernehmen — sonst würde jede Eingabe wieder überschrieben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Anderes Gebäude: bisherige Auswahl passt nicht mehr.
  useEffect(() => {
    setSelected([]);
    setContactSearch("");
  }, [buildingId]);

  // Aus einer E-Mail: den Absender gleich auswählen, wenn er Kontakt des Gebäudes ist.
  useEffect(() => {
    const address = prefill?.contactEmail?.trim().toLowerCase();
    if (!open || !address || contacts.length === 0) return;
    const hit = contacts.find((c) => c.email?.toLowerCase() === address);
    if (hit) setSelected((prev) => (prev.length ? prev : [hit.contact_id]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, open]);

  const chosen = useMemo(
    () => selected.map((id) => contacts.find((c) => c.contact_id === id)).filter(Boolean) as BuildingContact[],
    [selected, contacts],
  );
  const q = contactSearch.trim().toLowerCase();
  const visibleContacts = contacts.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.unit_number || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q),
  );
  const withAccount = chosen.filter((c) => c.user_id);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    const building = buildings.find((b) => b.id === buildingId);
    if (!building || !title.trim()) {
      toast.error("Bitte Gebäude und Betreff angeben");
      return;
    }
    try {
      const first = chosen[0];
      const created = await create.mutateAsync({
        buildingId,
        managementMode: building.management_mode as "weg" | "rent",
        title,
        description,
        contactName: chosen.length ? chosen.map((c) => c.name).join(", ") : name,
        contactEmail: chosen.length ? first?.email || "" : email,
        contactPhone: chosen.length ? first?.phone || "" : phone,
        channel,
        sourceEmailId: prefill?.sourceEmailId ?? null,
        contacts: chosen,
      });
      toast.success(
        withAccount.length
          ? `Meldung ${created.report_number} angelegt — im Portal sichtbar`
          : `Meldung ${created.report_number} angelegt`,
      );
      onOpenChange(false);
      onCreated?.(created);
    } catch (e) {
      toast.error(errorMessage(e, "Meldung konnte nicht angelegt werden"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fromEmail ? "Als Meldung übernehmen" : "Meldung erfassen"}</DialogTitle>
          <DialogDescription>
            {fromEmail
              ? "Die E-Mail bleibt im Postfach und ist mit der Meldung verknüpft."
              : "Zum Beispiel nach einem Anruf oder Brief."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Gebäude *</p>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Gebäude wählen" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {b.management_mode === "rent" ? " (Miete)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Eingang über</p>
              <Select value={channel} onValueChange={(v) => setChannel(v as ReportChannel)} disabled={fromEmail}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {REPORT_CHANNEL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Melder */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Melder</p>
            {!buildingId ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Erst das Gebäude wählen, dann die Melder aus dessen Kontakten.
              </p>
            ) : (
              <div className="rounded-lg border">
                {chosen.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-b p-2">
                    {chosen.map((c) => (
                      <span
                        key={c.contact_id}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs text-primary"
                      >
                        {c.name}
                        <button
                          type="button"
                          onClick={() => toggle(c.contact_id)}
                          className="rounded-full p-0.5 hover:bg-primary/15"
                          aria-label={`${c.name} entfernen`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative border-b">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Name, Einheit oder E-Mail …"
                    className="h-9 w-full bg-transparent pl-8 pr-3 text-sm outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {contactsLoading ? (
                    <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Laden …
                    </div>
                  ) : visibleContacts.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      {contacts.length === 0 ? "Für dieses Gebäude sind keine Kontakte hinterlegt." : "Kein Treffer."}
                    </p>
                  ) : (
                    visibleContacts.map((c) => (
                      <label
                        key={c.contact_id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/50",
                          selected.includes(c.contact_id) && "bg-primary/[0.04]",
                        )}
                      >
                        <Checkbox checked={selected.includes(c.contact_id)} onCheckedChange={() => toggle(c.contact_id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{c.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {[ROLE_LABEL[c.role] || c.role, c.unit_number ? `Einheit ${c.unit_number}` : null, c.email]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {c.user_id ? <MiniTag tone="info">App</MiniTag> : null}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
            {chosen.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {withAccount.length === chosen.length
                  ? chosen.length === 1
                    ? "Sieht die Meldung im Portal und bekommt dort Stände und Nachrichten."
                    : "Alle sehen die Meldung im Portal und bekommen dort Stände und Nachrichten."
                  : withAccount.length > 0
                    ? `Im Portal sichtbar für: ${withAccount.map((c) => c.name).join(", ")}. Die anderen haben kein App-Konto — Nachrichten an sie gehen per E-Mail.`
                    : "Kein App-Konto — Nachrichten gehen per E-Mail."}
              </p>
            )}
          </div>

          {buildingId && chosen.length === 0 && (
            <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Melder ist kein Kontakt? Dann hier eintragen (ohne Portalzugang, Nachrichten gehen per E-Mail).
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="new-report-name">
                  Name
                </label>
                <Input id="new-report-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="new-report-mail">
                  E-Mail
                </label>
                <Input id="new-report-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="new-report-phone">
                  Telefon
                </label>
                <Input id="new-report-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="new-report-title">
              Betreff *
            </label>
            <Input
              id="new-report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Haustür schließt nicht mehr"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="new-report-text">
              {fromEmail ? "Text" : "Beschreibung"}
            </label>
            <Textarea id="new-report-text" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
            {withAccount.length > 0 && (
              <p className="text-xs text-muted-foreground">Der Melder sieht diesen Text im Portal als seine Meldung.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Meldung anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
