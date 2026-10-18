import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Building2, CheckCircle2, Globe, Inbox as InboxIcon, Loader2, Mail, Phone, Plus, Search,
  Smartphone, StickyNote, Trash2, User, UserPlus, X,
} from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { useStaffProfiles, staffName, type StaffProfile } from "@/hooks/useReports";
import { MiniTag, StaffAvatar } from "@/components/reports/reportUi";
import { dateTime, shortDate } from "@/lib/reports";
import { CreateContactDialog } from "@/components/contacts/CreateContactDialog";
import {
  INQUIRY_FOLDER_LABEL, KIND_LABEL, SOURCE_LABEL, inquiryDetails, inquiryOrigin, inquirySummary,
  type InquiryFolder, type InquiryKind,
} from "@/lib/inquiries";
import {
  useAddInquiryNote, useCreateInquiry, useDeleteInquiry, useInquiriesLive, useInquiry, useInquiryEvents,
  useInquiryList, useUpdateInquiry, type Inquiry,
} from "@/hooks/useInquiries";

const HINT: Record<InquiryFolder, string> = {
  neu: "Neu eingegangen, noch niemand dran.",
  in_bearbeitung: "Jemand kümmert sich darum.",
  erledigt: "Abgeschlossen – gewonnen oder verloren.",
};

const SourceIcon = ({ source, className }: { source: string; className?: string }) =>
  source === "nutzer_app" ? <Smartphone className={className} /> : source === "manuell" ? <User className={className} /> : <Globe className={className} />;

interface Props {
  folder: InquiryFolder;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onFolderChange: (folder: InquiryFolder) => void;
}

/** Anfragen im Postfach: Liste links, Anfrage rechts – wie bei Meldungen. */
export function InquiriesPanel({ folder, selectedId, onSelect, onFolderChange }: Props) {
  const { user } = useAuth();
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  useInquiriesLive();

  const { data: staffAll = [] } = useStaffProfiles();
  const admins = useMemo(() => staffAll.filter((s) => s.role === "admin"), [staffAll]);
  const staffMap = useMemo(() => new Map(staffAll.map((s) => [s.user_id, s])), [staffAll]);

  const searching = search.trim().length >= 2;
  const { data: list = [], isLoading, error } = useInquiryList(searching ? null : folder, search);
  const items = useMemo(
    () => (onlyMine && !searching ? list.filter((i) => !i.assigned_to || i.assigned_to === user?.id) : list),
    [list, onlyMine, searching, user?.id],
  );

  // Wandert die gewählte Anfrage durch eine Änderung in einen anderen Ordner, geht die Ansicht mit.
  const { data: selected } = useInquiry(selectedId);
  useEffect(() => {
    if (!selected || searching) return;
    if (selected.status !== folder) onFolderChange(selected.status);
  }, [selected?.status, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanel
          defaultSize={35}
          minSize={20}
          maxSize={60}
          className={cn(selectedId ? "hidden md:block" : "block", "h-full overflow-hidden")}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-2 border-b p-3">
              <div className="flex items-center gap-1">
                <h2 className="flex-1 truncate text-[15px] font-semibold">
                  {searching ? "Suche in allen Anfragen" : `Anfragen · ${INQUIRY_FOLDER_LABEL[folder]}`}
                </h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCreateOpen(true)} title="Anfrage erfassen (z. B. nach einem Anruf)" aria-label="Anfrage erfassen">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, E-Mail, Telefon oder Nummer …"
                  className="h-8 pl-8 pr-8 text-sm"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Suche leeren">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {!searching && (
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-[11.5px] text-muted-foreground">{HINT[folder]}</span>
                  <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox checked={onlyMine} onCheckedChange={(v) => setOnlyMine(!!v)} className="h-3.5 w-3.5" />
                    Nur meine &amp; nicht zugeordnete
                  </label>
                </div>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
                </div>
              ) : error ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Die Anfragen konnten nicht geladen werden.</p>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                  <InboxIcon className="h-8 w-8 opacity-40" />
                  {searching ? "Nichts gefunden." : "Keine Anfragen in diesem Ordner."}
                </div>
              ) : (
                <ul className="divide-y">
                  {items.map((i) => {
                    const sub = inquirySummary(i.kind, i.data);
                    return (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(i.id)}
                          className={cn(
                            "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                            selectedId === i.id && "bg-primary/10",
                          )}
                        >
                          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.is_read ? "bg-transparent" : "bg-primary")} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn("flex-1 truncate text-sm", !i.is_read && "font-semibold")}>{i.name || i.email || "Ohne Namen"}</span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">{shortDate(i.created_at)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <MiniTag tone="info">{KIND_LABEL[i.kind]}</MiniTag>
                              <SourceIcon source={i.source} className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{sub}</span>
                              {i.status === "erledigt" && i.outcome && (
                                <MiniTag tone={i.outcome === "gewonnen" ? "success" : "neutral"}>{i.outcome}</MiniTag>
                              )}
                              <StaffAvatar profile={i.assigned_to ? staffMap.get(i.assigned_to) : null} empty={!i.assigned_to} />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle className="hidden w-1.5 bg-border transition-colors hover:bg-primary/40 md:flex" />
        <ResizablePanel defaultSize={65} className={cn(selectedId ? "block" : "hidden md:block", "h-full min-h-0 overflow-hidden")}>
          {selectedId ? (
            <InquiryDetail id={selectedId} admins={admins} staffMap={staffMap} onBack={() => onSelect(null)} onDeleted={() => onSelect(null)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <InboxIcon className="h-10 w-10 opacity-40" />
              <p className="text-sm">Wähle eine Anfrage aus</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      <CreateInquiryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(i) => {
          onFolderChange("neu");
          onSelect(i.id);
        }}
      />
    </>
  );
}

function InquiryDetail({
  id, admins, staffMap, onBack, onDeleted,
}: {
  id: string;
  admins: StaffProfile[];
  staffMap: Map<string, StaffProfile>;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const { openCompose } = useComposeEmail();
  const { data: inq, isLoading } = useInquiry(id);
  const { data: events = [] } = useInquiryEvents(id);
  const update = useUpdateInquiry();
  const addNote = useAddInquiryNote();
  const del = useDeleteInquiry();
  const [note, setNote] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Beim Öffnen als gelesen markieren.
  useEffect(() => {
    if (inq && !inq.is_read) update.mutate({ id: inq.id, patch: { is_read: true } });
  }, [inq?.id, inq?.is_read]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !inq) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Anfrage nicht gefunden"}
      </div>
    );
  }

  const details = inquiryDetails(inq.data);
  const origin = inquiryOrigin(inq.attribution);
  const [vorname, ...rest] = (inq.name ?? "").split(" ");
  const canLead = inq.kind === "objekt" || inq.kind === "suchauftrag" || inq.kind === "kontakt";

  const setStatus = (status: InquiryFolder) =>
    update.mutate(
      {
        id: inq.id,
        patch: { status, ...(status !== "erledigt" ? { outcome: null } : {}), ...(status !== "neu" && !inq.assigned_to ? { assigned_to: user?.id ?? null } : {}) },
        event: { kind: "status", body: `Stand: ${INQUIRY_FOLDER_LABEL[status]}` },
      },
      { onError: (e) => toast.error((e as Error).message) },
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 md:px-5">
        <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={onBack} aria-label="Zurück zur Liste">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <MiniTag tone="info">{KIND_LABEL[inq.kind]}</MiniTag>
        <span className="text-xs text-muted-foreground">#{inq.nummer} · {dateTime(inq.created_at)} · {SOURCE_LABEL[inq.source] ?? inq.source}</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => setDeleteOpen(true)} aria-label="Anfrage löschen" title="Löschen">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold leading-tight">{inq.name || "Ohne Namen"}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {inq.email && <a href={`mailto:${inq.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Mail className="h-3.5 w-3.5" />{inq.email}</a>}
              {inq.phone && <a href={`tel:${inq.phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{inq.phone}</a>}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {inq.email && (
                <Button
                  size="sm"
                  onClick={() => {
                    openCompose({ prefill: { to: inq.email!, subject: `Ihre Anfrage bei RGI Immobilien`, bodyText: `Guten Tag ${inq.name ?? ""},\n\nvielen Dank für Ihre Anfrage.\n\n` } });
                    if (inq.status === "neu") setStatus("in_bearbeitung");
                  }}
                >
                  <Mail className="mr-1.5 h-4 w-4" /> Antworten
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setContactOpen(true)} disabled={!!inq.contact_id}>
                <User className="mr-1.5 h-4 w-4" /> {inq.contact_id ? "Kontakt angelegt" : "Als Kontakt anlegen"}
              </Button>
              {canLead && (
                <Button size="sm" variant="outline" onClick={() => setLeadOpen(true)} disabled={!!inq.broker_lead_id}>
                  <UserPlus className="mr-1.5 h-4 w-4" /> {inq.broker_lead_id ? "Interessent angelegt" : "Als Interessent übernehmen"}
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Stand</Label>
              <Select value={inq.status} onValueChange={(v) => setStatus(v as InquiryFolder)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="neu">Neu</SelectItem>
                  <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
                  <SelectItem value="erledigt">Erledigt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Zuständig</Label>
              <Select
                value={inq.assigned_to ?? "none"}
                onValueChange={(v) => {
                  const uid = v === "none" ? null : v;
                  update.mutate({
                    id: inq.id,
                    patch: { assigned_to: uid },
                    event: { kind: "zuordnung", body: uid ? `Zugeordnet: ${staffName(staffMap.get(uid))}` : "Zuordnung entfernt" },
                  });
                }}
              >
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Niemand</SelectItem>
                  {admins.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>{staffName(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inq.status === "erledigt" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Ergebnis</Label>
                <div className="flex gap-2">
                  {(["gewonnen", "verloren"] as const).map((o) => (
                    <Button
                      key={o}
                      size="sm"
                      variant={inq.outcome === o ? "default" : "outline"}
                      onClick={() => update.mutate({ id: inq.id, patch: { outcome: o }, event: { kind: "status", body: `Ergebnis: ${o}` } })}
                    >
                      {o === "gewonnen" && <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                      {o === "gewonnen" ? "Gewonnen" : "Verloren"}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Angaben</h2>
            {details.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine weiteren Angaben.</p>
            ) : (
              <dl className="divide-y rounded-xl border bg-card">
                {details.map((d, k) => (
                  <div key={k} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[200px_1fr]">
                    <dt className="text-sm text-muted-foreground">{d.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm">{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {inq.consent_at && <p className="text-xs text-muted-foreground">Datenschutz-Zustimmung am {dateTime(inq.consent_at)}</p>}
          </section>

          {origin.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Herkunft</h2>
              <dl className="divide-y rounded-xl border bg-card">
                {origin.map((d, k) => (
                  <div key={k} className="grid gap-1 px-4 py-2 sm:grid-cols-[200px_1fr]">
                    <dt className="text-sm text-muted-foreground">{d.label}</dt>
                    <dd className="break-all text-sm">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verlauf</h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = note.trim();
                if (!t) return;
                addNote.mutate({ id: inq.id, body: t }, { onSuccess: () => setNote(""), onError: (er) => toast.error((er as Error).message) });
              }}
            >
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Notiz festhalten, z. B. „Angerufen, Angebot folgt“"
                className="min-h-[44px] flex-1 resize-none"
                rows={1}
              />
              <Button type="submit" variant="outline" disabled={!note.trim() || addNote.isPending}>Speichern</Button>
            </form>
            <ul className="space-y-2">
              <li className="flex gap-3 text-sm">
                <SourceIcon source={inq.source} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <div>Eingegangen über {SOURCE_LABEL[inq.source] ?? inq.source}</div>
                  <div className="text-xs text-muted-foreground">{dateTime(inq.created_at)}</div>
                </div>
              </li>
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-3 text-sm">
                  <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="whitespace-pre-wrap">{ev.body}</div>
                    <div className="text-xs text-muted-foreground">
                      {dateTime(ev.created_at)}{ev.created_by ? ` · ${staffName(staffMap.get(ev.created_by))}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </ScrollArea>

      <CreateContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        title="Kontakt aus Anfrage anlegen"
        prefill={{
          contactType: "person",
          firstName: vorname || null,
          lastName: rest.join(" ") || null,
          email: inq.email,
          phone: inq.phone,
          notes: `Aus Anfrage #${inq.nummer} (${KIND_LABEL[inq.kind]})`,
        }}
        onCreated={(cid) => {
          if (cid) update.mutate({ id: inq.id, patch: { contact_id: cid }, event: { kind: "system", body: "Als Kontakt angelegt" } });
        }}
      />
      <LeadDialog inquiry={inq} open={leadOpen} onOpenChange={setLeadOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anfrage löschen?</AlertDialogTitle>
            <AlertDialogDescription>Die Anfrage und ihr Verlauf werden endgültig gelöscht – z. B. bei Spam.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => del.mutate(inq.id, { onSuccess: () => { toast.success("Anfrage gelöscht"); onDeleted(); }, onError: (e) => toast.error((e as Error).message) })}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Anfrage als Interessent bei einem Makler-Objekt übernehmen. */
function LeadDialog({ inquiry, open, onOpenChange }: { inquiry: Inquiry; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const update = useUpdateInquiry();
  const [propertyId, setPropertyId] = useState<string>(inquiry.broker_property_id ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setPropertyId(inquiry.broker_property_id ?? ""), [inquiry.id, inquiry.broker_property_id]);
  const { data: props = [] } = useQuery({
    queryKey: ["broker-properties-pick"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("broker_properties").select("id, title, city, listing_type, is_active").order("title");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = async () => {
    if (!propertyId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("broker_leads")
      .insert({
        property_id: propertyId,
        contact_id: inquiry.contact_id,
        external_name: inquiry.name,
        external_email: inquiry.email,
        external_phone: inquiry.phone,
        status: "neu",
        notes: `Aus Anfrage #${inquiry.nummer} (${KIND_LABEL[inquiry.kind]})`,
        created_by: user?.id ?? null,
      } as any)
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    update.mutate({
      id: inquiry.id,
      patch: { broker_lead_id: data.id, broker_property_id: propertyId, status: inquiry.status === "neu" ? "in_bearbeitung" : inquiry.status },
      event: { kind: "system", body: "Als Interessent im Maklerbereich übernommen" },
    });
    qc.invalidateQueries({ queryKey: ["broker"] });
    toast.success("Interessent angelegt");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Als Interessent übernehmen</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Für welches Objekt?</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Objekt wählen" /></SelectTrigger>
            <SelectContent>
              {props.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{p.title}{p.city ? ` · ${p.city}` : ""}{p.is_active ? "" : " (inaktiv)"}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {props.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Objekte im Maklerbereich.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={!propertyId || saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Übernehmen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Anfrage von Hand erfassen (z. B. nach einem Anruf). */
function CreateInquiryDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (i: Inquiry) => void }) {
  const create = useCreateInquiry();
  const [kind, setKind] = useState<InquiryKind>("verwaltung");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setKind("verwaltung");
      setName("");
      setEmail("");
      setPhone("");
      setNote("");
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anfrage erfassen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Art</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as InquiryKind)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as InquiryKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="inq-name">Name</Label><Input id="inq-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="inq-mail">E-Mail</Label><Input id="inq-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></div>
            <div className="space-y-1.5"><Label htmlFor="inq-tel">Telefon</Label><Input id="inq-tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="inq-note">Worum geht es?</Label><Textarea id="inq-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { kind, name: name.trim(), email: email.trim(), phone: phone.trim(), note: note.trim() },
                { onSuccess: (i) => { onOpenChange(false); onCreated(i); }, onError: (e) => toast.error((e as Error).message) },
              )
            }
          >
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
