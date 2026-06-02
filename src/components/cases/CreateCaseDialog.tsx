import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useCreateCase, CASE_CATEGORY_LABEL, CASE_PRIORITY_LABEL, CaseCategory, CasePriority, CaseRow, ManagementMode } from "@/hooks/useCases";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildingId?: string;
  managementMode: ManagementMode;
  onCreated?: (caseRow: CaseRow) => void;
  defaults?: { title?: string; description?: string; category?: CaseCategory };
  lockBuilding?: boolean;
}

export const CreateCaseDialog = ({ open, onOpenChange, buildingId, managementMode, onCreated, defaults, lockBuilding }: Props) => {
  const [title, setTitle] = useState(defaults?.title || "");
  const [description, setDescription] = useState(defaults?.description || "");
  const [category, setCategory] = useState<CaseCategory>(defaults?.category || "sonstiges");
  const [priority, setPriority] = useState<CasePriority>("medium");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(buildingId || "");
  const create = useCreateCase();

  useEffect(() => {
    if (open) setSelectedBuildingId(buildingId || "");
  }, [open, buildingId]);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-case-create", managementMode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name")
        .eq("management_mode", managementMode)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const submit = async () => {
    if (!title.trim() || !selectedBuildingId) return;
    const c = await create.mutateAsync({
      building_id: selectedBuildingId,
      management_mode: managementMode,
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      priority,
    });
    onCreated?.(c);
    onOpenChange(false);
    setTitle(""); setDescription(""); setCategory("sonstiges"); setPriority("medium");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuer Vorgang</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Liegenschaft *</Label>
            <Select value={selectedBuildingId} onValueChange={setSelectedBuildingId} disabled={lockBuilding}>
              <SelectTrigger><SelectValue placeholder="Liegenschaft wählen…" /></SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Titel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Wasserschaden Whg. 3" autoFocus />
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Kategorie</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CaseCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CASE_CATEGORY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priorität</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as CasePriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CASE_PRIORITY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!title.trim() || !selectedBuildingId || create.isPending}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
