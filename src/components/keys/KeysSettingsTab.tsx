import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeStorageKey } from "@/lib/sanitizeStorageKey";
import {
  useKeyGlobalSettings,
  useKeyManufacturers,
  useKeyStorageLocations,
  useKeySubjectTypes,
  useKeyTypes,
} from "./useGlobalKeys";

interface SimpleListProps {
  title: string;
  hint: string;
  table: string;
  queryKey: string;
  items: { id: string; name: string }[];
  withCode?: boolean;
  codeOf?: (item: any) => string | null;
}

const SimpleList = ({ title, hint, table, queryKey, items, withCode, codeOf }: SimpleListProps) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    const payload: any = { name: name.trim(), created_by: user?.id };
    if (withCode) payload.code = code.trim();
    const { error } = await supabase.from(table as any).insert(payload as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setCode("");
    qc.invalidateQueries({ queryKey: [queryKey] });
    toast.success(`${title}: Eintrag angelegt`);
  };

  const deactivate = async (id: string, label: string) => {
    if (!confirm(`"${label}" ausblenden? Bestehende Zuordnungen bleiben erhalten.`)) return;
    const { error } = await supabase.from(table as any).update({ is_active: false } as any).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: [queryKey] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          {items.length === 0 && <div className="text-sm text-muted-foreground">Noch keine Einträge.</div>}
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-sm">
              {withCode && (
                <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{codeOf?.(i) ?? "—"}</span>
              )}
              <span className="flex-1 truncate">{i.name}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deactivate(i.id, i.name)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 border-t border-border/60 pt-3">
          {withCode && (
            <div className="w-20">
              <Label className="text-xs">Kürzel</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
            </div>
          )}
          <div className="flex-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={add} disabled={!name.trim()}>
            Hinzufügen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const KeysSettingsTab = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: types = [] } = useKeyTypes();
  const { data: locations = [] } = useKeyStorageLocations();
  const { data: subjectTypes = [] } = useKeySubjectTypes();
  const { data: manufacturers = [] } = useKeyManufacturers();
  const { data: globalSettings } = useKeyGlobalSettings();

  const uploadTagTemplate = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Bitte eine .docx-Datei hochladen");
      return;
    }
    const path = `_global/tag-template-${Date.now()}-${sanitizeStorageKey(file.name)}`;
    const { error } = await supabase.storage.from("key-files").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    const { error: e2 } = await supabase.from("key_global_settings" as any).upsert({
      id: "singleton",
      tag_template_path: path,
      tag_template_name: file.name,
      tag_template_uploaded_at: new Date().toISOString(),
      tag_template_uploaded_by: user?.id,
    } as any);
    if (e2) toast.error(e2.message);
    else {
      qc.invalidateQueries({ queryKey: ["key-global-settings"] });
      toast.success("Anhänger-Vorlage hochgeladen (gilt für alle Liegenschaften)");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SimpleList
        title="Aufbewahrungsorte"
        hint="Das Kürzel wird zum Präfix der Anhängernummer, z.B. K/036-02."
        table="key_storage_locations"
        queryKey="key-storage-locations"
        items={locations as any}
        withCode
        codeOf={(i) => i.code}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Schlüsselarten (Farben)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Die Farbe steckt im Anhänger, nicht in der Nummer. Neue Farben nur anlegen, wenn es sie physisch gibt.
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {types.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded border border-border/60 px-2 py-1.5 text-sm">
              <span
                className="h-4 w-4 rounded-full border border-black/10"
                style={{ background: t.color_hex ?? "#999" }}
              />
              <span className="flex-1">{t.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{t.color_hex ?? "—"}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <SimpleList
        title="Verwendungszwecke"
        hint="Wofür der einzelne Schlüssel schließt – Haustür, Keller, Heizung …"
        table="key_subject_types"
        queryKey="key-subject-types"
        items={subjectTypes as any}
      />

      <SimpleList
        title="Hersteller"
        hint="Schließsystem-Hersteller für die Nachbestellung."
        table="key_manufacturers"
        queryKey="key-manufacturers"
        items={manufacturers as any}
      />

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Anhänger-Vorlage (Word .docx)</CardTitle>
          <p className="text-xs text-muted-foreground">Gilt für alle Liegenschaften.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => e.target.files?.[0] && uploadTagTemplate(e.target.files[0])}
          />
          <p className="text-xs text-muted-foreground">
            Platzhalter <code className="font-mono">{"{g}"}</code>, <code className="font-mono">{"{o}"}</code> und{" "}
            <code className="font-mono">{"{r}"}</code> werden je nach Farbe der Schlüsselart mit der Nummer gefüllt
            (Format „1 / 0002 - 01“).
            {globalSettings?.tag_template_name && <> · Aktuell: {globalSettings.tag_template_name}</>}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
