import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Trash2, FileStack, ExternalLink, Info, Star } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { sanitizeStorageKey } from "@/lib/sanitizeStorageKey";

const PLACEHOLDERS: [string, string[]][] = [
  ["Kopf / Stammdaten", [
    "{weg.name}",
    "{weg.adresse}",
    "{weg.verwalter}",
    "{weg.anzahl_einheiten}",
    "{gebaeude.name}",
    "{gebaeude.adresse}",
    "{versammlung.titel}",
    "{versammlung.datum}",
    "{versammlung.ort}",
    "{versammlung.leitung}",
    "{top.nummer}",
    "{top.titel}",
  ]],
  ["Berichtsabschnitte", [
    "{bericht.sachstand}",
    "{bericht.instandhaltung}",
    "{bericht.vermoegen}",
    "{bericht.sonstiges}",
  ]],
  ["Schluss", ["{ort_datum}"]],
];

export function ReportTemplatesTab() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["etv-report-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_report_templates" as any)
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Nur .docx-Dateien erlaubt");
      return;
    }
    setUploading(true);
    try {
      const key = `${Date.now()}-${sanitizeStorageKey(file.name)}`;
      const path = `_etv-report-templates/${key}`;
      const { error: upErr } = await supabase.storage.from("building-files").upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("etv_report_templates" as any).insert({
        name: file.name.replace(/\.[^.]+$/, ""),
        storage_path: path,
        is_default: !(templates && templates.length),
      } as any);
      if (insErr) throw insErr;
      toast.success("Vorlage hochgeladen");
      qc.invalidateQueries({ queryKey: ["etv-report-templates"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openTemplate = async (path: string) => {
    const { data, error } = await supabase.storage.from("building-files").createSignedUrl(path, 300);
    if (error || !data) return toast.error("Vorlage nicht ladbar");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const setDefault = async (id: string) => {
    await supabase.from("etv_report_templates" as any).update({ is_default: false } as any).neq("id", id);
    const { error } = await supabase.from("etv_report_templates" as any).update({ is_default: true } as any).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Standardvorlage gesetzt");
    qc.invalidateQueries({ queryKey: ["etv-report-templates"] });
  };

  const remove = async (t: any) => {
    if (!confirm(`Vorlage "${t.name}" löschen?`)) return;
    await supabase.storage.from("building-files").remove([t.storage_path]);
    const { error } = await supabase.from("etv_report_templates" as any).delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Vorlage gelöscht");
    qc.invalidateQueries({ queryKey: ["etv-report-templates"] });
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2 items-center flex-wrap">
        <input ref={inputRef} type="file" accept=".docx" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5">
          <Upload className="w-4 h-4" /> Word-Vorlage (.docx) hochladen
        </Button>
        <Sheet>
          <SheetTrigger asChild><Button variant="outline" className="gap-1.5"><Info className="w-4 h-4" />Platzhalter-Hilfe</Button></SheetTrigger>
          <SheetContent className="overflow-y-auto sm:max-w-lg">
            <SheetHeader><SheetTitle>Platzhalter für Bericht-Vorlagen</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4 text-sm">
              <p className="text-muted-foreground">Tags in der Word-Vorlage in geschweiften Klammern schreiben.</p>
              {PLACEHOLDERS.map(([title, tags]) => (
                <div key={title}>
                  <h4 className="font-semibold mb-1">{title}</h4>
                  <div className="space-y-1">
                    {tags.map((t) => <code key={t} className="block text-xs bg-muted px-2 py-1 rounded break-all">{t}</code>)}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <Card className="divide-y">
          {(templates ?? []).length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <FileStack className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Noch keine Bericht-Vorlage hochgeladen.
            </div>
          )}
          {templates?.map((t: any) => (
            <div key={t.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{t.name}</span>
                  {t.is_default && <Badge><Star className="w-3 h-3 mr-1" />Standard</Badge>}
                </div>
              </div>
              {!t.is_default && (
                <Button variant="ghost" size="sm" onClick={() => setDefault(t.id)} title="Als Standard">
                  <Star className="w-4 h-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => openTemplate(t.storage_path)}><ExternalLink className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => remove(t)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
