import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { VisibilityRole, VISIBILITY_LABELS, DocCategory } from "@/components/buildings/documents/types";

interface FileToFile {
  name: string;
  path: string;
  size: number | null;
  mimeType: string | null;
}

interface SaveAttachmentToBuildingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachments: FileToFile[];
  emailId: string;
  defaultBuildingId?: string | null;
  onDone?: () => void;
}

export function SaveAttachmentToBuildingDialog({
  open, onOpenChange, attachments, emailId, defaultBuildingId, onDone,
}: SaveAttachmentToBuildingDialogProps) {
  const [buildingId, setBuildingId] = useState<string>(defaultBuildingId || "");
  const [categoryId, setCategoryId] = useState<string>("");
  const [visibility, setVisibility] = useState<VisibilityRole>('intern');
  const [fiscalYear, setFiscalYear] = useState<string>("general");
  const [buildings, setBuildings] = useState<{ id: string; name: string; management_mode: string }[]>([]);
  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string>("__root__");
  const [savingFolder, setSavingFolder] = useState(false);

  useEffect(() => {
    if (open) {
      supabase.from('buildings').select('id, name, management_mode').order('name')
        .then(({ data }) => setBuildings(data || []));
      setBuildingId(defaultBuildingId || "");
      setCategoryId("");
      setVisibility('intern');
      setFiscalYear("general");
    }
  }, [open, defaultBuildingId]);

  useEffect(() => {
    if (!buildingId) { setCategories([]); return; }
    (async () => {
      await supabase.rpc('ensure_stammakte_categories', { p_building_id: buildingId });
      const { data } = await supabase.from('building_file_categories')
        .select('*').eq('building_id', buildingId).order('sort_order');
      setCategories((data || []) as DocCategory[]);
    })();
  }, [buildingId]);

  const flatCategories = (() => {
    const byParent: Record<string, DocCategory[]> = {};
    categories.forEach(c => { (byParent[c.parent_id || 'root'] ||= []).push(c); });
    const out: { id: string; label: string }[] = [];
    const walk = (pid: string | null, d: number) => {
      (byParent[pid || 'root'] || []).forEach(c => {
        out.push({ id: c.id, label: `${'\u00A0\u00A0'.repeat(d)}${c.name}` });
        walk(c.id, d + 1);
      });
    };
    walk(null, 0);
    return out;
  })();

  const reloadCategories = async () => {
    if (!buildingId) return;
    const { data } = await supabase.from('building_file_categories')
      .select('*').eq('building_id', buildingId).order('sort_order');
    setCategories((data || []) as DocCategory[]);
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) { toast.error("Name erforderlich"); return; }
    if (!buildingId) return;
    setSavingFolder(true);
    try {
      const building = buildings.find(b => b.id === buildingId);
      const mgmt = building?.management_mode || 'weg';
      const parent = newFolderParentId === "__root__" ? null : newFolderParentId;
      const siblings = categories.filter(c => (c.parent_id || null) === parent);
      const nextSort = (siblings.reduce((m, c) => Math.max(m, c.sort_order || 0), 0) || 0) + 10;
      const { data: inserted, error } = await (supabase
        .from('building_file_categories') as any)
        .insert({
          name,
          parent_id: parent,
          building_id: buildingId,
          management_mode: mgmt,
          sort_order: nextSort,
          is_recommended: false,
          auto_rag_enabled: false,
        })
        .select('id')
        .single();
      if (error) throw error;
      toast.success("Ordner angelegt");
      await reloadCategories();
      setCategoryId(inserted.id);
      setNewFolderName("");
      setCreatingFolder(false);
    } catch (e: any) {
      toast.error("Anlegen fehlgeschlagen: " + e.message);
    } finally {
      setSavingFolder(false);
    }
  };

  const handleSave = async () => {
    if (!buildingId) { toast.error("Gebäude wählen"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");
      const building = buildings.find(b => b.id === buildingId);
      if (!building) throw new Error("Gebäude nicht gefunden");

      const cat = categories.find(c => c.id === categoryId);
      const autoRag = cat?.auto_rag_enabled || false;

      for (const att of attachments) {
        // Download from email-attachments bucket
        const { data: signed, error: sErr } = await supabase.storage
          .from('email-attachments').createSignedUrl(att.path, 300);
        if (sErr || !signed) throw new Error("Anhang nicht lesbar");

        const blob = await (await fetch(signed.signedUrl)).blob();
        const ext = att.name.split('.').pop();
        const newPath = `${buildingId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('building-files').upload(newPath, blob, { contentType: att.mimeType || undefined });
        if (upErr) throw upErr;

        const { data: inserted, error: insErr } = await (supabase
          .from('building_files') as any)
          .insert({
            display_name: att.name,
            file_path: newPath,
            file_size: att.size || 0,
            mime_type: att.mimeType,
            category_id: categoryId || null,
            building_id: buildingId,
            uploaded_by: user.id,
            management_mode: building.management_mode,
            visibility_role: visibility,
            visible_to_users: visibility !== 'intern',
            rag_enabled: autoRag,
            source: 'email',
            source_email_id: emailId,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;

        await supabase.from('building_file_activity').insert({
          file_id: inserted.id,
          user_id: user.id,
          action: 'imported_from_email',
          details: { email_id: emailId },
        });

        const ocrTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (att.mimeType && ocrTypes.includes(att.mimeType)) {
          supabase.functions.invoke('process-building-file', { body: { fileId: inserted.id } })
            .catch(err => console.error('OCR error:', err));
        }
      }

      toast.success(`${attachments.length} Datei(en) in Stammakte abgelegt`);
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Fehler: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>In Stammakte ablegen ({attachments.length})</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Gebäude</Label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger><SelectValue placeholder="Gebäude wählen" /></SelectTrigger>
              <SelectContent>
                {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Ordner</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!buildingId}
                onClick={() => {
                  setNewFolderParentId(categoryId || "__root__");
                  setCreatingFolder(v => !v);
                }}
                className="h-7 px-2 text-xs gap-1"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                {creatingFolder ? "Abbrechen" : "Neuer Ordner"}
              </Button>
            </div>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={!buildingId}>
              <SelectTrigger><SelectValue placeholder="Ordner wählen" /></SelectTrigger>
              <SelectContent>
                {flatCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {creatingFolder && (
              <div className="mt-2 p-3 border rounded-md bg-muted/30 space-y-2">
                <div>
                  <Label className="text-xs">Übergeordneter Ordner</Label>
                  <Select value={newFolderParentId} onValueChange={setNewFolderParentId}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__root__">— Hauptebene —</SelectItem>
                      {flatCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Name</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="z.B. Rechnungen 2026"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createFolder(); } }}
                      autoFocus
                    />
                    <Button onClick={createFolder} disabled={savingFolder || !newFolderName.trim()}>
                      {savingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anlegen"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <Label>Sichtbarkeit</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as VisibilityRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(VISIBILITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || !buildingId}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Speichere...</> : "Ablegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
