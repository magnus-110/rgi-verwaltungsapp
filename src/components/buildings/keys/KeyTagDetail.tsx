import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Plus, Trash2, Edit } from "lucide-react";
import { KeyTag, KeyItem, KeySubjectType, KeyManufacturer } from "./types";
import { DropdownWithAdd } from "./DropdownWithAdd";
import { toast } from "sonner";

interface Props { tag: KeyTag; onBack: () => void; onEdit: () => void; }

export const KeyTagDetail = ({ tag, onBack, onEdit }: Props) => {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Partial<KeyItem>>({});

  const { data: keys = [] } = useQuery<KeyItem[]>({
    queryKey: ["keys", tag.id],
    queryFn: async () => (await supabase.from("keys").select("*").eq("tag_id", tag.id)).data ?? [],
  });
  const { data: subjectTypes = [] } = useQuery<KeySubjectType[]>({
    queryKey: ["key-subject-types"],
    queryFn: async () => (await supabase.from("key_subject_types").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });
  const { data: manufacturers = [] } = useQuery<KeyManufacturer[]>({
    queryKey: ["key-manufacturers"],
    queryFn: async () => (await supabase.from("key_manufacturers").select("*").eq("is_active", true).order("name")).data ?? [],
  });

  const save = async () => {
    const { error } = await supabase.from("keys").insert({ ...form, tag_id: tag.id });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["keys", tag.id] });
    setForm({}); setShowAdd(false);
  };
  const del = async (id: string) => {
    if (!confirm("Schlüssel löschen?")) return;
    const { error } = await supabase.from("keys").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["keys", tag.id] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" /> Zurück</Button>
        <Button variant="outline" size="sm" onClick={onEdit}><Edit className="h-4 w-4 mr-1" /> Anhänger bearbeiten</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">{tag.tag_number}</CardTitle>
          {tag.notes && <p className="text-sm text-muted-foreground">{tag.notes}</p>}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Schlüssel ({keys.length})</CardTitle>
          <Button size="sm" onClick={() => setShowAdd(s => !s)}><Plus className="h-4 w-4 mr-1" /> Schlüssel</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAdd && (
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <div>
                <Label>Schlüsseltyp</Label>
                <DropdownWithAdd
                  value={form.subject_type_id ?? undefined}
                  onChange={(v) => setForm({ ...form, subject_type_id: v })}
                  options={subjectTypes}
                  table="key_subject_types"
                  label="Schlüsseltyp"
                  extraFields={[{ label: "Icon (lucide name)", key: "icon", placeholder: "key-round" }]}
                  queryKey={["key-subject-types"]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Schlüsselnummer</Label><Input value={form.key_number ?? ""} onChange={(e) => setForm({ ...form, key_number: e.target.value })} /></div>
                <div>
                  <Label>Hersteller</Label>
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
              <div><Label>Notiz</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Abbrechen</Button><Button size="sm" onClick={save}>Hinzufügen</Button></div>
            </div>
          )}
          {keys.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">Noch keine Schlüssel hinterlegt.</div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => {
                const st = subjectTypes.find(s => s.id === k.subject_type_id);
                const mf = manufacturers.find(m => m.id === k.manufacturer_id);
                return (
                  <div key={k.id} className="flex items-center gap-3 p-2 border border-border/60 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{st?.name ?? "Schlüssel"} {k.key_number && <span className="font-mono text-muted-foreground">· {k.key_number}</span>}</div>
                      <div className="text-xs text-muted-foreground">{mf?.name ?? "—"}{k.notes ? ` · ${k.notes}` : ""}</div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del(k.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
