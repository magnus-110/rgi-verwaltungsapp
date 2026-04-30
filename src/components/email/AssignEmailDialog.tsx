import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, User, Sparkles, FolderOpen, Link2, Plus, X, GitBranch, Vote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useCreateCase } from "@/hooks/useCases";
import { toast } from "@/hooks/use-toast";

interface AssignEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: string | null;
  onAssign: (params: {
    emailId: string;
    buildingId: string | null;
    contactId: string | null;
    caseId: string | null;
    archive: boolean;
    isEtvRelevant: boolean;
    etvMeetingId: string | null;
  }) => void;
  prefilledBuildingId?: string | null;
  prefilledContactId?: string | null;
  prefilledCaseId?: string | null;
  prefilledIsEtvRelevant?: boolean;
  prefilledEtvMeetingId?: string | null;
}

export const AssignEmailDialog = ({
  open,
  onOpenChange,
  emailId,
  onAssign,
  prefilledBuildingId,
  prefilledContactId,
  prefilledCaseId,
  prefilledIsEtvRelevant,
  prefilledEtvMeetingId,
}: AssignEmailDialogProps) => {
  const [buildingId, setBuildingId] = useState<string>("none");
  const [contactId, setContactId] = useState<string>("none");
  const [caseId, setCaseId] = useState<string>("none");
  const [subcaseId, setSubcaseId] = useState<string>("none");
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
      setCaseId(prefilledCaseId || "none");
      setSubcaseId("none");
      setArchive(false);
      setIsEtvRelevant(!!prefilledIsEtvRelevant);
      setEtvMeetingId(prefilledEtvMeetingId || "general");
      setCreatingCase(false);
      setNewCaseTitle("");
    }
  }, [open, prefilledBuildingId, prefilledContactId, prefilledCaseId, prefilledIsEtvRelevant, prefilledEtvMeetingId]);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, address, management_mode").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, first_name, last_name, company_name").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: cases = [] } = useQuery({
    queryKey: ["cases-for-assign", buildingId],
    queryFn: async () => {
      if (buildingId === "none") return [];
      const { data, error } = await supabase
        .from("cases")
        .select("id, title, status, category")
        .eq("building_id", buildingId)
        .is("parent_case_id", null)
        .in("status", ["open", "in_progress", "waiting_external", "waiting_owner"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: buildingId !== "none",
  });

  const { data: subcases = [] } = useQuery({
    queryKey: ["subcases-for-assign", caseId],
    queryFn: async () => {
      if (caseId === "none") return [];
      const { data, error } = await supabase
        .from("cases")
        .select("id, title, status")
        .eq("parent_case_id", caseId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
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
    const finalCaseId =
      subcaseId !== "none" ? subcaseId :
      caseId !== "none" ? caseId : null;
    const finalBuildingId = buildingId !== "none" ? buildingId : null;
    onAssign({
      emailId,
      buildingId: finalBuildingId,
      contactId: contactId !== "none" ? contactId : null,
      caseId: finalCaseId,
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
            <Select value={buildingId} onValueChange={(v) => { setBuildingId(v); setCaseId("none"); setSubcaseId("none"); setCreatingCase(false); }}>
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
            </Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger><SelectValue placeholder="Keine Zuordnung" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Zuordnung</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{getContactName(c)}</SelectItem>
                ))}
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
              <Select value={caseId} onValueChange={(v) => { setCaseId(v); setSubcaseId("none"); }} disabled={buildingId === "none"}>
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

          {caseId !== "none" && subcases.length > 0 && (
            <div className="space-y-1.5 pl-4 border-l-2 border-primary/30">
              <Label className="text-sm flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-primary" />
                Teilvorgang (optional)
              </Label>
              <Select value={subcaseId} onValueChange={setSubcaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Hauptvorgang verwenden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Hauptvorgang verwenden</SelectItem>
                  {subcases.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
