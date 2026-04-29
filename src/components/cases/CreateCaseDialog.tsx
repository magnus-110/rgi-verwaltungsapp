import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { GitBranch } from "lucide-react";
import { useCreateCase, useActiveCasesForBuilding, CASE_CATEGORY_LABEL, CASE_PRIORITY_LABEL, CaseCategory, CasePriority, CaseRow, ManagementMode } from "@/hooks/useCases";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildingId: string;
  managementMode: ManagementMode;
  onCreated?: (caseRow: CaseRow) => void;
  defaults?: { title?: string; description?: string; category?: CaseCategory; parent_case_id?: string | null };
  /** When provided, dialog is locked to creating a sub-case of this parent. */
  forcedParentId?: string | null;
}

export const CreateCaseDialog = ({ open, onOpenChange, buildingId, managementMode, onCreated, defaults, forcedParentId }: Props) => {
  const [title, setTitle] = useState(defaults?.title || "");
  const [description, setDescription] = useState(defaults?.description || "");
  const [category, setCategory] = useState<CaseCategory>(defaults?.category || "sonstiges");
  const [priority, setPriority] = useState<CasePriority>("medium");
  const [parentId, setParentId] = useState<string>(forcedParentId || defaults?.parent_case_id || "none");
  const create = useCreateCase();
  const { data: activeParents = [] } = useActiveCasesForBuilding(forcedParentId ? null : buildingId);

  const submit = async () => {
    if (!title.trim()) return;
    const finalParent = forcedParentId ?? (parentId !== "none" ? parentId : null);
    const c = await create.mutateAsync({
      building_id: buildingId,
      management_mode: managementMode,
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      priority,
      parent_case_id: finalParent,
    });
    onCreated?.(c);
    onOpenChange(false);
    setTitle(""); setDescription(""); setCategory("sonstiges"); setPriority("medium"); setParentId("none");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{forcedParentId ? "Neuer Teilvorgang" : "Neuer Vorgang"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
          {!forcedParentId && activeParents.length > 0 && (
            <div>
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                Optional: Als Teilvorgang von…
              </Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Eigenständiger Vorgang</SelectItem>
                  {activeParents.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
