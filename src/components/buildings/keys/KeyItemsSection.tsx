import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2 } from "lucide-react";
import { DropdownWithAdd } from "./DropdownWithAdd";
import { HouseIcon } from "./IconPicker";
import { KeyItem, KeySubjectType, KeyManufacturer } from "./types";

interface Props {
  tagId: string;
}

/** Verwaltung der einzelnen Schlüssel unterhalb eines Anhängers (anlegen, bearbeiten, löschen). */
export const KeyItemsSection = ({ tagId }: Props) => {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<KeyItem>>({});

  const { data: keys = [] } = useQuery<KeyItem[]>({
    queryKey: ["keys", tagId],
    queryFn: async () => (await supabase.from("keys").select("*").eq("tag_id", tagId)).data ?? [],
  });
  const { data: subjectTypes = [] } = useQuery<KeySubjectType[]>({
    queryKey: ["key-subject-types"],
    queryFn: async () =>
      (await supabase.from("key_subject_types").select("*").eq("is_active", true).order("name")).data ?? [],
  });
  const { data: manufacturers = [] } = useQuery<KeyManufacturer[]>({
    queryKey: ["key-manufacturers"],
    queryFn: async () =>
      (await supabase.from("key_manufacturers").select("*").eq("is_active", true).order("name")).data ?? [],
  });

  const reset = () => {
    setForm({});
    setShowForm(false);
    setEditingKeyId(null);
  };

  const saveKey = async () => {
    const payload = {
      subject_type_id: form.subject_type_id ?? null,
      key_number: form.key_number ?? null,
      manufacturer_id: form.manufacturer_id ?? null,
      notes: form.notes ?? null,
    };
    const { error } = editingKeyId
      ? await supabase.from("keys").update(payload as any).eq("id", editingKeyId)
      : await supabase.from("keys").insert({ ...payload, tag_id: tagId } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["keys", tagId] });
    toast.success(editingKeyId ? "Schlüssel aktualisiert" : "Schlüssel hinzugefügt");
    reset();
  };

  const startEdit = (k: KeyItem) => {
    setForm({
      subject_type_id: k.subject_type_id ?? undefined,
      key_number: k.key_number ?? undefined,
      manufacturer_id: k.manufacturer_id ?? undefined,
      notes: k.notes ?? undefined,
    });
    setEditingKeyId(k.id);
    setShowForm(true);
  };

  const delKey = async (id: string) => {
    if (!confirm("Schlüssel löschen?")) return;
    const { error } = await supabase.from("keys").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      if (editingKeyId === id) reset();
      qc.invalidateQueries({ queryKey: ["keys", tagId] });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Schlüssel ({keys.length})</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setShowForm((s) => !s || !!editingKeyId);
            setEditingKeyId(null);
            setForm({});
          }}
        >
          <Plus className="h-3 w-3 mr-1" /> Schlüssel
        </Button>
      </div>

      {showForm && (
        <div className="border border-border rounded p-3 space-y-2 bg-background">
          <div className="text-xs font-medium">{editingKeyId ? "Schlüssel bearbeiten" : "Neuer Schlüssel"}</div>
          <div>
            <Label className="text-xs">Schlüsseltyp</Label>
            <DropdownWithAdd
              value={form.subject_type_id ?? undefined}
              onChange={(v) => setForm({ ...form, subject_type_id: v })}
              options={subjectTypes}
              table="key_subject_types"
              label="Schlüsseltyp"
              extraFields={[{ label: "Icon", key: "icon", type: "icon" }]}
              renderOption={(o: any) => (
                <span className="flex items-center gap-2">
                  <HouseIcon name={o.icon} className="h-4 w-4 text-muted-foreground" />
                  {o.name}
                </span>
              )}
              queryKey={["key-subject-types"]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Schlüsselnummer</Label>
              <Input value={form.key_number ?? ""} onChange={(e) => setForm({ ...form, key_number: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Hersteller</Label>
              <DropdownWithAdd
                value={form.manufacturer_id ?? undefined}
                onChange={(v) => setForm({ ...form, manufacturer_id: v })}
                options={manufacturers}
                table="key_manufacturers"
                label="Hersteller"
                queryKey={["key-manufacturers"]}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notiz</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Abbrechen
            </Button>
            <Button type="button" size="sm" onClick={saveKey}>
              {editingKeyId ? "Speichern" : "Hinzufügen"}
            </Button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-2">Noch keine Schlüssel hinterlegt.</div>
      ) : (
        <div className="space-y-1">
          {keys.map((k) => {
            const st = subjectTypes.find((s) => s.id === k.subject_type_id);
            const mf = manufacturers.find((m) => m.id === k.manufacturer_id);
            return (
              <div key={k.id} className="flex items-center gap-3 px-2 py-1.5 border border-border/60 rounded bg-background">
                <HouseIcon name={(st as any)?.icon} className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    {st?.name ?? "Schlüssel"}{" "}
                    {k.key_number && <span className="font-mono text-muted-foreground">· {k.key_number}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {mf?.name ?? "—"}
                    {k.notes ? ` · ${k.notes}` : ""}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => startEdit(k)}
                  title="Schlüssel bearbeiten"
                >
                  <Edit className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => delKey(k.id)}
                  title="Schlüssel löschen"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
