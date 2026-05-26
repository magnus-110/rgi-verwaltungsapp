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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStorageLocationId(tag?.storage_location_id);
      setKeyTypeId(tag?.key_type_id);
      setNotes(tag?.notes ?? "");
      setPhotoFile(null);
    }
  }, [open, tag]);

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
      if (tag) {
        const { error } = await supabase.from("key_tags").update({
          notes, photo_path: photoPath,
        }).eq("id", tag.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("key_tags").insert({
          building_id: buildingId,
          storage_location_id: storageLocationId,
          key_type_id: keyTypeId,
          sequence_number: 0, // wird vom Trigger gesetzt
          tag_number: "TMP", // wird vom Trigger überschrieben
          notes,
          photo_path: photoPath,
          created_by: user?.id,
        });
        if (error) throw error;
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
