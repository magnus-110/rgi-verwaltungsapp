import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, Building2, User, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ArchiveEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: string | null;
  onArchive: (emailId: string, buildingId: string | null, contactId: string | null) => void;
  /** Pre-detected contact from AI classification */
  prefilledContactId?: string | null;
  /** Pre-detected building from AI classification */
  prefilledBuildingId?: string | null;
}

export const ArchiveEmailDialog = ({ open, onOpenChange, emailId, onArchive, prefilledContactId, prefilledBuildingId }: ArchiveEmailDialogProps) => {
  const [buildingId, setBuildingId] = useState<string>("none");
  const [contactId, setContactId] = useState<string>("none");

  // Pre-fill when dialog opens with detected values
  useEffect(() => {
    if (open) {
      setBuildingId(prefilledBuildingId || "none");
      setContactId(prefilledContactId || "none");
    }
  }, [open, prefilledBuildingId, prefilledContactId]);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-for-archive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-for-archive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_name")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const handleArchive = () => {
    if (!emailId) return;
    onArchive(
      emailId,
      buildingId !== "none" ? buildingId : null,
      contactId !== "none" ? contactId : null
    );
    setBuildingId("none");
    setContactId("none");
    onOpenChange(false);
  };

  const getContactName = (c: any) => {
    const parts = [c.first_name, c.last_name].filter(Boolean).join(" ");
    if (parts && c.company_name) return `${parts} (${c.company_name})`;
    return parts || c.company_name || "Unbenannt";
  };

  const hasSuggestion = prefilledContactId || prefilledBuildingId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            E-Mail archivieren
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
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger>
                <SelectValue placeholder="Keine Zuordnung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Zuordnung</SelectItem>
                {buildings.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} – {b.address}
                  </SelectItem>
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
              <SelectTrigger>
                <SelectValue placeholder="Keine Zuordnung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Zuordnung</SelectItem>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {getContactName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleArchive} className="gap-1.5">
            <Archive className="h-4 w-4" />
            Archivieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
