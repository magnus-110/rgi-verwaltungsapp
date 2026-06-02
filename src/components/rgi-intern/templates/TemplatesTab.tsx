import { useRef, useState } from "react";
import { useRgiTemplates, useDeleteRgiTemplate, rgiSignedUrl } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, FileStack, ExternalLink, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const PLACEHOLDERS = [
  ["Firma", ["{firma.name}", "{firma.adresse}", "{firma.zip}", "{firma.stadt}", "{firma.iban}", "{firma.bic}", "{firma.bank}", "{firma.steuernr}", "{firma.ustid}", "{firma.email}", "{firma.telefon}", "{firma.website}", "{firma.ceo}", "{firma.hrb}"]],
  ["Kunde", ["{kunde.name}", "{kunde.adresse}", "{kunde.zip}", "{kunde.stadt}", "{kunde.land}", "{kunde.email}", "{kunde.ustid}", "{kunde.kundennr}"]],
  ["Rechnung", ["{rechnung.nummer}", "{rechnung.datum}", "{rechnung.faellig}", "{rechnung.leistungszeitraum}", "{rechnung.intro}", "{rechnung.footer}"]],
  ["Positionen-Loop", ["{#positionen}{nr}{/positionen}", "{#positionen}{beschreibung}{/positionen}", "{#positionen}{menge}{/positionen}", "{#positionen}{einheit}{/positionen}", "{#positionen}{einzelpreis}{/positionen}", "{#positionen}{ust}{/positionen}", "{#positionen}{summe}{/positionen}"]],
  ["Summen", ["{summe.netto}", "{summe.ust19}", "{summe.ust7}", "{summe.ust0}", "{summe.brutto}"]],
];

export function TemplatesTab() {
  const { data: templates, isLoading } = useRgiTemplates();
  const del = useDeleteRgiTemplate();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("rgi-invoice-templates").upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("rgi_invoice_templates").insert({
        name: file.name.replace(/\.[^.]+$/, ""),
        storage_path: path,
        template_kind: "invoice",
      } as any);
      if (insErr) throw insErr;
      // Fire-and-forget placeholder parse
      supabase.functions.invoke("rgi-parse-template-placeholders", { body: { storage_path: path } }).catch(() => {});
      toast.success("Vorlage hochgeladen");
      qc.invalidateQueries({ queryKey: ["rgi", "templates"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openTemplate = async (path: string) => {
    const url = await rgiSignedUrl("rgi-invoice-templates", path);
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2 items-center">
        <input ref={inputRef} type="file" accept=".docx" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5"><Upload className="w-4 h-4" />Vorlage (.docx) hochladen</Button>
        <Sheet>
          <SheetTrigger asChild><Button variant="outline" className="gap-1.5"><Info className="w-4 h-4" />Platzhalter-Hilfe</Button></SheetTrigger>
          <SheetContent className="overflow-y-auto">
            <SheetHeader><SheetTitle>Verfügbare Platzhalter</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4 text-sm">
              <p className="text-muted-foreground">Verwende diese Tags in deiner Word-Vorlage. Loops mit <code>{`{#positionen}…{/positionen}`}</code> in einer Tabellenzeile.</p>
              {PLACEHOLDERS.map(([title, tags]) => (
                <div key={title as string}>
                  <h4 className="font-semibold mb-1">{title}</h4>
                  <div className="space-y-1">
                    {(tags as string[]).map((t) => <code key={t} className="block text-xs bg-muted px-2 py-1 rounded">{t}</code>)}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {isLoading ? <Skeleton className="h-64" /> : (
        <Card className="divide-y">
          {(templates ?? []).length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <FileStack className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Noch keine Word-Vorlagen hochgeladen.
            </div>
          )}
          {templates?.map((t) => {
            const schema = (t.placeholder_schema as any) ?? {};
            const tagCount = Array.isArray(schema.tags) ? schema.tags.length : 0;
            return (
              <div key={t.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{t.name}</span>
                    {t.is_default && <Badge>Standard</Badge>}
                    {t.sparte && <Badge variant="outline">{t.sparte}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tagCount > 0 ? `${tagCount} Platzhalter erkannt` : "Platzhalter werden im Hintergrund extrahiert…"}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openTemplate(t.storage_path)}><ExternalLink className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Vorlage "${t.name}" löschen?`)) del.mutate(t); }}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
