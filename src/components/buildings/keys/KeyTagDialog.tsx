import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyTag, KeyStorageLocation, KeyType } from "./types";
import { DropdownWithAdd } from "./DropdownWithAdd";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeStorageKey } from "@/lib/sanitizeStorageKey";
import { compressImageIfNeeded } from "@/lib/compressImage";
import { FileImage, FileText, File as FileIcon, X, Trash2, Eye } from "lucide-react";


interface Props {
  open: boolean;
  onClose: () => void;
  buildingId: string;
  tag?: KeyTag;
}

export const KeyTagDialog = ({ open, onClose, buildingId, tag }: Props) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [storageLocationId, setStorageLocationId] = useState<string | undefined>();
  const [keyTypeId, setKeyTypeId] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStorageLocationId(tag?.storage_location_id);
      setKeyTypeId(tag?.key_type_id);
      setNotes(tag?.notes ?? "");
      setPhotoFile(null);
      setAttachFiles([]);
      setPhotoRemoved(false);
    }
  }, [open, tag]);

  const [photoRemoved, setPhotoRemoved] = useState(false);
  const currentPhotoPath = photoRemoved ? null : tag?.photo_path ?? null;

  const { data: photoUrl } = useQuery({
    queryKey: ["key-tag-photo-url", currentPhotoPath],
    queryFn: async () => {
      if (!currentPhotoPath) return null;
      const { data } = await supabase.storage.from("key-files").createSignedUrl(currentPhotoPath, 600);
      return data?.signedUrl ?? null;
    },
    enabled: !!currentPhotoPath && open,
  });


  // Bereits hochgeladene Dateien des Anhängers
  const { data: tagFiles = [] } = useQuery({
    queryKey: ["key-tag-files", tag?.id],
    queryFn: async () => {
      if (!tag?.id) return [];
      const { data } = await supabase.from("key_tag_files" as any).select("*").eq("tag_id", tag.id).order("created_at");
      return (data || []) as any[];
    },
    enabled: !!tag?.id && open,
  });

  const openTagFile = async (filePath: string) => {
    const { data } = await supabase.storage.from("key-files").createSignedUrl(filePath, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Datei konnte nicht geöffnet werden");
  };

  const deleteTagFile = async (file: any) => {
    if (!confirm(`Datei "${file.file_name}" löschen?`)) return;
    await supabase.storage.from("key-files").remove([file.file_path]);
    const { error } = await supabase.from("key_tag_files" as any).delete().eq("id", file.id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["key-tag-files", tag?.id] });
      toast.success("Datei gelöscht");
    }
  };

  const deletePhoto = async () => {
    if (!tag?.photo_path) { setPhotoRemoved(true); setPhotoFile(null); return; }
    if (!confirm("Foto entfernen?")) return;
    await supabase.storage.from("key-files").remove([tag.photo_path]);
    const { error } = await supabase.from("key_tags").update({ photo_path: null }).eq("id", tag.id);
    if (error) { toast.error(error.message); return; }
    setPhotoRemoved(true);
    setPhotoFile(null);
    qc.invalidateQueries({ queryKey: ["key-tags", buildingId] });
    toast.success("Foto entfernt");
  };


  const { data: locations = [] } = useQuery<KeyStorageLocation[]>({
    queryKey: ["key-storage-locations"],
    queryFn: async () => (await supabase.from("key_storage_locations").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });
  const { data: types = [] } = useQuery<KeyType[]>({
    queryKey: ["key-types"],
    queryFn: async () => (await supabase.from("key_types").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });

  const previewNumber = () => {
    const loc = locations.find(l => l.id === storageLocationId);
    const t = types.find(x => x.id === keyTypeId);
    if (!loc || !t) return "—";
    return `${loc.code}/XXX-NN${t.code_suffix}`;
  };

  const save = async () => {
    if (!storageLocationId || !keyTypeId) { toast.error("Bitte alle Pflichtfelder wählen"); return; }
    setSaving(true);
    try {
      let photoPath = tag?.photo_path ?? null;
      if (photoFile) {
        const path = `${buildingId}/tags/${Date.now()}-${sanitizeStorageKey(photoFile.name)}`;
        const { error } = await supabase.storage.from("key-files").upload(path, photoFile, { upsert: true });
        if (error) throw error;
        photoPath = path;
      }
      let tagId = tag?.id ?? null;
      if (tag) {
        const { error } = await supabase.from("key_tags").update({
          notes, photo_path: photoPath,
        }).eq("id", tag.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from("key_tags").insert({
          building_id: buildingId,
          storage_location_id: storageLocationId,
          key_type_id: keyTypeId,
          sequence_number: 0, // wird vom Trigger gesetzt
          tag_number: "TMP", // wird vom Trigger überschrieben
          notes,
          photo_path: photoPath,
          created_by: user?.id,
        }).select("id").single();
        if (error) throw error;
        tagId = inserted?.id ?? null;
      }

      // Weitere Dateien hochladen (mehrere möglich)
      if (tagId && attachFiles.length > 0) {
        for (const f of attachFiles) {
          const fPath = `${buildingId}/tags/${tagId}/${Date.now()}-${sanitizeStorageKey(f.name)}`;
          const { error: upErr } = await supabase.storage.from("key-files").upload(fPath, f, { upsert: true });
          if (upErr) throw upErr;
          const { error: insErr } = await supabase.from("key_tag_files" as any).insert({
            tag_id: tagId,
            building_id: buildingId,
            file_path: fPath,
            file_name: f.name,
            file_size: f.size,
            mime_type: f.type,
            uploaded_by: user?.id,
          });
          if (insErr) throw insErr;
        }
        qc.invalidateQueries({ queryKey: ["key-tag-files", tagId] });
      }
      qc.invalidateQueries({ queryKey: ["key-tags", buildingId] });
      qc.invalidateQueries({ queryKey: ["key-events", buildingId] });
      toast.success("Anhänger gespeichert");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{tag ? "Anhänger bearbeiten" : "Neuer Anhänger"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Aufbewahrungsort *</Label>
            <DropdownWithAdd
              value={storageLocationId}
              onChange={setStorageLocationId}
              options={locations}
              table="key_storage_locations"
              label="Aufbewahrungsort"
              extraFields={[{ label: "Code (1 Zeichen)", key: "code", required: true, placeholder: "z.B. 1 oder K" }]}
              queryKey={["key-storage-locations"]}
              renderOption={(o: any) => <span>{o.name} <span className="text-muted-foreground">({o.code})</span></span>}
            />
          </div>
          <div>
            <Label>Schlüsselart *</Label>
            <DropdownWithAdd
              value={keyTypeId}
              onChange={setKeyTypeId}
              options={types}
              table="key_types"
              label="Schlüsselart"
              extraFields={[
                { label: "Farbe (Hex)", key: "color_hex", placeholder: "#22c55e" },
                { label: "Code-Suffix", key: "code_suffix", placeholder: "G" },
              ]}
              queryKey={["key-types"]}
              renderOption={(o: any) => (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: o.color_hex ?? "#999" }} />
                  {o.name}
                </span>
              )}
            />
          </div>
          {!tag && (
            <div className="text-xs text-muted-foreground">
              Anhängernummer wird automatisch erzeugt: <span className="font-mono">{previewNumber()}</span>
            </div>
          )}
          {tag && (
            <div className="text-xs">
              Anhängernummer: <span className="font-mono font-semibold">{tag.tag_number}</span>
            </div>
          )}
          <div>
            <Label>Foto</Label>
            <Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label>Weitere Dateien (mehrere möglich)</Label>
            <Input type="file" multiple onChange={(e) => setAttachFiles(Array.from(e.target.files ?? []))} />
            {attachFiles.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{attachFiles.length} Datei(en) ausgewählt</p>
            )}
            {tagFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {tagFiles.map((f: any) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs p-1.5 bg-muted rounded">
                    <button type="button" className="truncate flex-1 text-left text-primary hover:underline" onClick={() => openTagFile(f.file_path)}>
                      {f.file_name}
                    </button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteTagFile(f)}>×</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Notiz</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
