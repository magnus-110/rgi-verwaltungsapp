import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WegBuilding } from "./useEtvData";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildings: WegBuilding[];
  defaultBuildingId?: string;
}

/** Eigenes Thema erfassen (z. B. mündliches Anliegen, Punkt aus der Objektbegehung). */
export const NewTopicDialog = ({ open, onOpenChange, buildings, defaultBuildingId }: Props) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [buildingId, setBuildingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setBuildingId(defaultBuildingId && defaultBuildingId !== "all" ? defaultBuildingId : "");
      setTitle("");
      setDescription("");
    }
  }, [open, defaultBuildingId]);

  const save = async () => {
    setBusy(true);
    const { error } = await (supabase as any).from("etv_manual_notes").insert({
      building_id: buildingId, title: title.trim(), description: description.trim() || null, created_by: profile?.user_id,
    });
    setBusy(false);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Thema erfasst" });
    qc.invalidateQueries({ queryKey: ["etv-topics"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thema erfassen</DialogTitle>
          <DialogDescription>Zum Beispiel ein mündliches Anliegen oder ein Punkt aus der Objektbegehung.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Liegenschaft</Label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger><SelectValue placeholder="Liegenschaft wählen …" /></SelectTrigger>
              <SelectContent>
                {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nt-title">Titel</Label>
            <Input id="nt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Balkone streichen" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nt-desc">Beschreibung</Label>
            <Textarea id="nt-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={busy || !buildingId || !title.trim()}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
