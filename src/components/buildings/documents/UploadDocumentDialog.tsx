import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { VisibilityRole, VISIBILITY_LABELS, DocCategory } from "./types";
import { PersonVisibilityPicker } from "./PersonVisibilityPicker";

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  managementMode: 'weg' | 'rent';
  initialCategoryId?: string | null;
  initialFiles?: File[];
  onUploaded: () => void;
}

export function UploadDocumentDialog({
  open, onOpenChange, buildingId, managementMode,
  initialCategoryId, initialFiles, onUploaded,
}: UploadDocumentDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [visibility, setVisibility] = useState<VisibilityRole>('intern');
  const [validUntil, setValidUntil] = useState<string>("");
  const [fiscalYear, setFiscalYear] = useState<string>("general");
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [owners, setOwners] = useState<Array<{ id: string; first_name?: string | null; last_name?: string | null; company_name?: string | null }>>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setFiles(initialFiles || []);
      setCategoryId(initialCategoryId || "");
      setVisibility('intern');
      setValidUntil("");
      setFiscalYear("general");
      setSelectedContactIds([]);
      supabase
        .from('building_file_categories')
        .select('*')
        .eq('building_id', buildingId)
        .order('sort_order')
        .then(({ data }) => setCategories((data || []) as DocCategory[]));
      supabase
        .from('contact_building_assignments')
        .select('contact_id, contacts(id, user_id, first_name, last_name, company_name)')
        .eq('building_id', buildingId)
        .eq('is_active', true)
        .eq('role_in_building', 'eigentuemer')
        .then(({ data }) => {
          const list = (data || [])
            .map((r: any) => r.contacts)
            .filter(Boolean);
          // Dedupe: prefer user_id (one entry per account), fallback to normalized name
          const seen = new Set<string>();
          const unique = list.filter((c: any) => {
            const nameKey = `${(c.company_name || '').trim().toLowerCase()}|${(c.first_name || '').trim().toLowerCase()}|${(c.last_name || '').trim().toLowerCase()}`;
            const key = c.user_id ? `u:${c.user_id}` : `n:${nameKey}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setOwners(unique);
        });
    }
  }, [open, buildingId, initialCategoryId, initialFiles]);

  const flatCategories = (() => {
    const byParent: Record<string, DocCategory[]> = {};
    categories.forEach(c => {
      const k = c.parent_id || 'root';
      (byParent[k] ||= []).push(c);
    });
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      (byParent[parentId || 'root'] || []).forEach(c => {
        out.push({ id: c.id, label: `${'\u00A0\u00A0'.repeat(depth)}${c.name}` });
        walk(c.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  })();

  const handleUpload = async () => {
    if (files.length === 0) { toast.error("Bitte mindestens eine Datei wählen"); return; }
    if (visibility === 'personen' && selectedContactIds.length === 0) {
      toast.error("Bitte mindestens einen Eigentümer auswählen");
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      // Auto-RAG default from category
      const cat = categories.find(c => c.id === categoryId);
      const autoRag = cat?.auto_rag_enabled || false;

      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name}: max. 50 MB`);
          continue;
        }
        const ext = file.name.split('.').pop();
        const path = `${buildingId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('building-files')
          .upload(path, file);
        if (upErr) throw upErr;

        const { data: inserted, error: insErr } = await (supabase
          .from('building_files') as any)
          .insert({
            display_name: file.name,
            file_path: path,
            file_size: file.size,
            mime_type: file.type,
            category_id: categoryId || null,
            building_id: buildingId,
            uploaded_by: user.id,
            management_mode: managementMode,
            visibility_role: visibility,
            visible_to_users: visibility !== 'intern',
            valid_until: validUntil || null,
            rag_enabled: autoRag,
            source: 'manual',
          })
          .select('id')
          .single();
        if (insErr) throw insErr;

        await supabase.from('building_file_activity').insert({
          file_id: inserted.id,
          user_id: user.id,
          action: 'uploaded',
        });

        // Persist per-person visibility
        if (visibility === 'personen' && selectedContactIds.length > 0) {
          await supabase.from('building_file_visibility').insert(
            selectedContactIds.map(cid => ({ file_id: inserted.id, contact_id: cid }))
          );
        }

        // Trigger OCR for supported types in background
        const ocrTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (ocrTypes.includes(file.type)) {
          supabase.functions.invoke('process-building-file', {
            body: { fileId: inserted.id }
          }).catch(err => console.error('OCR trigger error:', err));
        }
      }

      toast.success(`${files.length} Dokument(e) hochgeladen`);
      onUploaded();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Upload fehlgeschlagen: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Dokumente hochladen ({files.length})</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {files.length === 0 ? (
            <div>
              <Label>Dateien wählen</Label>
              <Input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            </div>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm p-1.5 bg-muted rounded">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div>
            <Label>Ordner</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Ordner wählen" /></SelectTrigger>
              <SelectContent>
                {flatCategories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {visibility === 'personen' && (
            <div>
              <Label>Eigentümer auswählen</Label>
              <PersonVisibilityPicker
                contacts={owners}
                selectedIds={selectedContactIds}
                onToggle={(id) => setSelectedContactIds(s =>
                  s.includes(id) ? s.filter(x => x !== id) : [...s, id]
                )}
              />
            </div>
          )}

          <div>
            <Label>Ablaufdatum (optional)</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Lade...</> : `${files.length} Datei(en) hochladen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
