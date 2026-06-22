import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, User, Sparkles, FolderOpen, Link2, Plus, X, Vote, ListTree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useCreateCase } from "@/hooks/useCases";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface AssignEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: string | null;
  onAssign: (params: {
    emailId: string;
    buildingId: string | null;
    contactId: string | null;
    contactPersonId: string | null;
    caseId: string | null;
    parentEventId: string | null;
    archive: boolean;
    isEtvRelevant: boolean;
    etvMeetingId: string | null;
  }) => void;
  prefilledBuildingId?: string | null;
  prefilledContactId?: string | null;
  prefilledContactPersonId?: string | null;
  prefilledCaseId?: string | null;
  prefilledIsEtvRelevant?: boolean;
  prefilledEtvMeetingId?: string | null;
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  note: "Notiz",
  email: "E-Mail",
  document: "Dokument",
  image: "Bild",
  todo: "Aufgabe",
  booking: "Buchung",
  meeting: "Termin",
  phone: "Telefonat",
  status_change: "Statuswechsel",
  ai_summary: "KI-Zusammenfassung",
  file: "Datei",
};

export const AssignEmailDialog = ({
  open,
  onOpenChange,
  emailId,
  onAssign,
  prefilledBuildingId,
  prefilledContactId,
  prefilledContactPersonId,
  prefilledCaseId,
  prefilledIsEtvRelevant,
  prefilledEtvMeetingId,
}: AssignEmailDialogProps) => {
  const [buildingId, setBuildingId] = useState<string>("none");
  const [contactId, setContactId] = useState<string>("none");
  const [contactPersonId, setContactPersonId] = useState<string>("none");
  const [caseId, setCaseId] = useState<string>("none");
  const [parentEventId, setParentEventId] = useState<string>("none");
  const [archive, setArchive] = useState(false);
  const [isEtvRelevant, setIsEtvRelevant] = useState(false);
  const [etvMeetingId, setEtvMeetingId] = useState<string>("general");
  const [creatingCase, setCreatingCase] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const createCase = useCreateCase();
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setBuildingId(prefilledBuildingId || "none");
      setContactId(prefilledContactId || "none");
      setContactPersonId(prefilledContactPersonId || "none");
      setCaseId(prefilledCaseId || "none");
      setParentEventId("none");
      setArchive(false);
      setIsEtvRelevant(!!prefilledIsEtvRelevant);
      setEtvMeetingId(prefilledEtvMeetingId || "general");
      setCreatingCase(false);
      setNewCaseTitle("");
    }
  }, [open, prefilledBuildingId, prefilledContactId, prefilledContactPersonId, prefilledCaseId, prefilledIsEtvRelevant, prefilledEtvMeetingId]);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, address, management_mode").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts = [], refetch: refetchContacts } = useQuery({
    queryKey: ["contacts-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, first_name, last_name, company_name").order("last_name");
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  // Lade aktuelle E-Mail (für Absender-Matching)
  const { data: currentEmail } = useQuery({
    queryKey: ["assign-email-meta", emailId],
    enabled: !!emailId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id, from_address")
        .eq("id", emailId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Lade alle bekannten Kontakt-E-Mails (contact_emails + contact_persons.email)
  const { data: contactEmailMap = new Map<string, string>(), refetch: refetchEmailMap } = useQuery({
    queryKey: ["contact-email-lookup"],
    queryFn: async () => {
      const map = new Map<string, string>();
      const { data: ce } = await supabase.from("contact_emails").select("contact_id, email");
      (ce || []).forEach((r: any) => {
        if (r.email) map.set(r.email.trim().toLowerCase(), r.contact_id);
      });
      const { data: cp } = await supabase.from("contact_persons").select("contact_id, email").not("email", "is", null);
      (cp || []).forEach((r: any) => {
        if (r.email) {
          const key = r.email.trim().toLowerCase();
          if (!map.has(key)) map.set(key, r.contact_id);
        }
      });
      return map;
    },
    staleTime: 0,
  });

  // Beim Öffnen Kontakte/E-Mail-Map neu laden, damit gerade neu angelegte Kontakte sofort erscheinen
  useEffect(() => {
    if (open) {
      refetchContacts();
      refetchEmailMap();
    }
  }, [open, refetchContacts, refetchEmailMap]);

  // Realtime: neuer Kontakt → Liste sofort aktualisieren
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel("assign-dialog-contacts")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => {
        refetchContacts();
        refetchEmailMap();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_emails" }, () => {
        refetchEmailMap();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_persons" }, () => {
        refetchEmailMap();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, refetchContacts, refetchEmailMap]);


  // Auto-Vorschlag Kontakt anhand Absender-E-Mail (wenn KI noch nichts vorgeschlagen hat)
  const senderMatchedContactId = currentEmail?.from_address
    ? contactEmailMap.get(currentEmail.from_address.trim().toLowerCase()) || null
    : null;

  useEffect(() => {
    if (!open) return;
    if (contactId === "none" && !prefilledContactId && senderMatchedContactId) {
      setContactId(senderMatchedContactId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderMatchedContactId, open]);

  const [contactSearch, setContactSearch] = useState("");
  useEffect(() => { if (open) setContactSearch(""); }, [open]);

  const filteredContacts = (() => {
    const s = contactSearch.trim().toLowerCase();
    if (!s) return contacts;
    return contacts.filter((c: any) => {
      const name = `${c.first_name || ""} ${c.last_name || ""} ${c.company_name || ""}`.toLowerCase();
      return name.includes(s);
    });
  })();

  const { data: cases = [] } = useQuery({
    queryKey: ["cases-for-assign", buildingId],
    queryFn: async () => {
      if (buildingId === "none") return [] as any[];
      const { data, error } = await (supabase as any)
        .from("cases")
        .select("id, title, status, category")
        .eq("building_id", buildingId)
        .in("status", ["open", "in_progress", "waiting_external", "waiting_owner"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: buildingId !== "none",
  });

  // Top-level events of the chosen case — used as optional attach target
  const { data: parentEvents = [] } = useQuery({
    queryKey: ["case-top-events-for-assign", caseId],
    queryFn: async () => {
      if (caseId === "none") return [] as any[];
      const { data, error } = await (supabase as any)
        .from("case_events")
        .select("id, title, body, event_type, occurred_at")
        .eq("case_id", caseId)
        .is("parent_event_id", null)
        .neq("event_type", "ai_summary")
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: caseId !== "none",
  });

  const { data: etvMeetings = [] } = useQuery({
    queryKey: ["etv-meetings-for-assign", buildingId],
    queryFn: async () => {
      if (buildingId === "none") return [];
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("id, title, meeting_date")
        .eq("building_id", buildingId)
        .gte("meeting_date", today)
        .order("meeting_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: buildingId !== "none",
  });

  const handleCreateCase = async () => {
    if (buildingId === "none" || !newCaseTitle.trim()) return;
    const building = buildings.find((b) => b.id === buildingId);
    if (!building) return;
    try {
      const created = await createCase.mutateAsync({
        building_id: buildingId,
        management_mode: building.management_mode as any,
        title: newCaseTitle.trim(),
      });
      await qc.invalidateQueries({ queryKey: ["cases-for-assign", buildingId] });
      setCaseId(created.id);
      setCreatingCase(false);
      setNewCaseTitle("");
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  const handleAssign = () => {
    if (!emailId) return;
    const finalCaseId = caseId !== "none" ? caseId : null;
    const finalBuildingId = buildingId !== "none" ? buildingId : null;
    const finalParentEventId = finalCaseId && parentEventId !== "none" ? parentEventId : null;
    onAssign({
      emailId,
      buildingId: finalBuildingId,
      contactId: contactId !== "none" ? contactId : null,
      caseId: finalCaseId,
      parentEventId: finalParentEventId,
      archive,
      isEtvRelevant: !!finalBuildingId && isEtvRelevant,
      etvMeetingId: !!finalBuildingId && isEtvRelevant && etvMeetingId !== "general" ? etvMeetingId : null,
    });
    onOpenChange(false);
  };

  const getContactName = (c: any) => {
    const parts = [c.first_name, c.last_name].filter(Boolean).join(" ");
    if (parts && c.company_name) return `${parts} (${c.company_name})`;
    return parts || c.company_name || "Unbenannt";
  };

  const eventLabel = (ev: any) => {
    const type = EVENT_TYPE_LABEL[ev.event_type] || ev.event_type;
    const text = ev.title || (ev.body ? ev.body.substring(0, 60) : "");
    const date = ev.occurred_at ? format(new Date(ev.occurred_at), "dd.MM.yyyy", { locale: de }) : "";
    return `${type}: ${text || "(ohne Titel)"} – ${date}`;
  };

  const hasSuggestion = prefilledContactId || prefilledBuildingId || prefilledCaseId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            E-Mail zuordnen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {hasSuggestion && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              Zuordnungen wurden automatisch aus der KI-Erkennung vorgeschlagen.
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              Liegenschaft
              {prefilledBuildingId && buildingId === prefilledBuildingId && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                  <Sparkles className="h-2.5 w-2.5" />
                  Vorschlag
                </Badge>
              )}
            </Label>
            <Select value={buildingId} onValueChange={(v) => { setBuildingId(v); setCaseId("none"); setParentEventId("none"); setCreatingCase(false); }}>
              <SelectTrigger><SelectValue placeholder="Keine Zuordnung" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Zuordnung</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name} – {b.address}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <User className="h-4 w-4" />
              Kontakt
              {prefilledContactId && contactId === prefilledContactId && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                  <Sparkles className="h-2.5 w-2.5" />
                  Vorschlag
                </Badge>
              )}
              {!prefilledContactId && senderMatchedContactId && contactId === senderMatchedContactId && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                  <Sparkles className="h-2.5 w-2.5" />
                  Absender erkannt
                </Badge>
              )}
            </Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger><SelectValue placeholder="Keine Zuordnung" /></SelectTrigger>
              <SelectContent>
                <div className="p-2 sticky top-0 bg-popover z-10 border-b">
                  <Input
                    placeholder="Kontakt suchen…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-8"
                  />
                </div>
                <SelectItem value="none">Keine Zuordnung</SelectItem>
                {filteredContacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{getContactName(c)}</SelectItem>
                ))}
                {filteredContacts.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground text-center">Keine Treffer</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm flex items-center gap-1.5">
                <FolderOpen className="h-4 w-4" />
                Vorgang
                {prefilledCaseId && caseId === prefilledCaseId && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" />
                    Vorschlag
                  </Badge>
                )}
              </Label>
              {buildingId !== "none" && !creatingCase && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setCreatingCase(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Neuer Vorgang
                </Button>
              )}
            </div>
            {creatingCase ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  placeholder="Titel des neuen Vorgangs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateCase();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateCase}
                  disabled={!newCaseTitle.trim() || createCase.isPending}
                >
                  {createCase.isPending ? "..." : "Anlegen"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => { setCreatingCase(false); setNewCaseTitle(""); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Select value={caseId} onValueChange={(v) => { setCaseId(v); setParentEventId("none"); }} disabled={buildingId === "none"}>
                <SelectTrigger>
                  <SelectValue placeholder={buildingId === "none" ? "Erst Liegenschaft wählen" : "Keinem Vorgang"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keinem Vorgang</SelectItem>
                  {cases.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {caseId !== "none" && parentEvents.length > 0 && (
            <div className="space-y-1.5 pl-4 border-l-2 border-primary/30">
              <Label className="text-sm flex items-center gap-1.5">
                <ListTree className="h-4 w-4 text-primary" />
                An Eintrag anhängen (optional)
              </Label>
              <Select value={parentEventId} onValueChange={setParentEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Als eigenständiger Eintrag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Als eigenständiger Eintrag</SelectItem>
                  {parentEvents.map((ev: any) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      <span className="truncate inline-block max-w-[340px]">{eventLabel(ev)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Gruppiert die E-Mail unter diesen bestehenden Eintrag (z. B. eine Notiz mit mehreren E-Mails).
              </p>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="etv-relevant" className="text-sm flex items-center gap-1.5 cursor-pointer">
                <Vote className="h-4 w-4" />
                Relevant für Eigentümerversammlung
              </Label>
              <Switch
                id="etv-relevant"
                checked={isEtvRelevant}
                disabled={buildingId === "none"}
                onCheckedChange={(v) => setIsEtvRelevant(!!v)}
              />
            </div>
            {buildingId === "none" && (
              <p className="text-xs text-muted-foreground pl-6">Erst eine Liegenschaft zuordnen, um diese E-Mail einer Versammlung zuzuordnen.</p>
            )}
            {isEtvRelevant && buildingId !== "none" && (
              <div className="pl-6 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Konkrete Versammlung (optional)</Label>
                <Select value={etvMeetingId} onValueChange={setEtvMeetingId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Allgemein / nächste Versammlung</SelectItem>
                    {etvMeetings.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.title} – {new Date(m.meeting_date).toLocaleDateString("de-DE")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <Checkbox id="archive-too" checked={archive} onCheckedChange={(v) => setArchive(!!v)} />
            <Label htmlFor="archive-too" className="text-sm font-normal cursor-pointer">
              E-Mail zusätzlich archivieren
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleAssign} className="gap-1.5">
            <Link2 className="h-4 w-4" />
            Zuordnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
