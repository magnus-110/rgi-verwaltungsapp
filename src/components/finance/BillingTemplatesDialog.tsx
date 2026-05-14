import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Upload, FileText, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Scope = "single" | "overall" | "asset_report";

const SCOPE_LABEL: Record<Scope, string> = {
  overall: "Gesamtabrechnung",
  single: "Einzelabrechnung",
  asset_report: "Vermögensbericht",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedSingleId?: string | null;
  selectedOverallId?: string | null;
  selectedAssetReportId?: string | null;
  onSelectSingle?: (id: string) => void;
  onSelectOverall?: (id: string) => void;
  onSelectAssetReport?: (id: string) => void;
  /** Optional Filter, um den Dialog vorgefiltert auf einen Typ zu öffnen */
  scopeFilter?: Scope;
}

export function BillingTemplatesDialog({
  open,
  onOpenChange,
  selectedSingleId,
  selectedOverallId,
  selectedAssetReportId,
  onSelectSingle,
  onSelectOverall,
  onSelectAssetReport,
  scopeFilter,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>(scopeFilter ?? "overall");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["billing-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const upload = async () => {
    if (!file || !name.trim()) {
      toast({ title: "Name und Datei erforderlich", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const safeName = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
      const path = `${crypto.randomUUID()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("billing-templates")
        .upload(path, file, {
          contentType:
            file.type ||
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("billing_templates").insert({
        name: name.trim(),
        storage_path: path,
        scope,
      });
      if (insErr) throw insErr;
      setName(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["billing-templates"] });
      toast({ title: "Vorlage gespeichert" });
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: any) => {
    if (!confirm(`Vorlage "${t.name}" löschen?`)) return;
    await supabase.storage.from("billing-templates").remove([t.storage_path]);
    await supabase.from("billing_templates").delete().eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["billing-templates"] });
  };

  const select = (t: any) => {
    if (t.scope === "overall") onSelectOverall?.(t.id);
    else onSelectSingle?.(t.id);
    toast({ title: "Vorlage aktiviert", description: t.name });
  };

  const isActive = (t: any) =>
    (t.scope === "overall" && selectedOverallId === t.id) ||
    (t.scope === "single" && selectedSingleId === t.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Abrechnungs-Vorlagen</DialogTitle>
          <DialogDescription>
            Lade Word-Vorlagen (.docx) für Jahresabrechnungen hoch und wähle die aktive Vorlage.
            Platzhalter wie <code>{"{empfaenger_name}"}</code> sowie Schleifen{" "}
            <code>{"{#sektionen}…{/sektionen}"}</code> und{" "}
            <code>{"{#zeilen}…{/zeilen}"}</code> werden unterstützt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border rounded-md p-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Standard 2025" />
            </div>
            <div>
              <Label className="text-xs">Typ</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="overall">Gesamtabrechnung</SelectItem>
                  <SelectItem value="single">Einzelabrechnung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Datei (.docx)</Label>
              <Input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <Button onClick={upload} disabled={busy} size="sm">
            <Upload className="h-4 w-4 mr-2" /> Hochladen
          </Button>
        </div>

        <div className="space-y-1 max-h-[400px] overflow-auto">
          {templates.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Noch keine Vorlagen.</div>
          ) : templates.map((t: any) => {
            const active = isActive(t);
            return (
              <div key={t.id} className={`flex items-center justify-between border rounded p-2 ${active ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      {t.name}
                      {active && <Badge variant="default" className="gap-1"><Check className="h-3 w-3" />Aktiv</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t.scope === "overall" ? "Gesamtabrechnung" : "Einzelabrechnung"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!active && (
                    <Button size="sm" variant="outline" onClick={() => select(t)}>
                      Auswählen
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(t)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
