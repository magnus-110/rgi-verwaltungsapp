import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Upload, FileText, Check, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Scope = "single" | "overall" | "asset_report" | "paragraph_35a" | "economic_plan" | "combined_report";

const SCOPE_LABEL: Record<Scope, string> = {
  overall: "Gesamtabrechnung",
  single: "Einzelabrechnung",
  asset_report: "Vermögensbericht",
  paragraph_35a: "§35a Bescheinigung",
  economic_plan: "Wirtschaftsplan",
  combined_report: "Sammel-Jahresbericht (Deckblatt + alle)",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedSingleId?: string | null;
  selectedOverallId?: string | null;
  selectedAssetReportId?: string | null;
  selectedParagraph35aId?: string | null;
  selectedEconomicPlanId?: string | null;
  onSelectSingle?: (id: string) => void;
  onSelectOverall?: (id: string) => void;
  onSelectAssetReport?: (id: string) => void;
  onSelectParagraph35a?: (id: string) => void;
  onSelectEconomicPlan?: (id: string) => void;
  /** Optional Filter, um den Dialog vorgefiltert auf einen Typ zu öffnen */
  scopeFilter?: Scope;
}

export function BillingTemplatesDialog({
  open,
  onOpenChange,
  selectedSingleId,
  selectedOverallId,
  selectedAssetReportId,
  selectedParagraph35aId,
  selectedEconomicPlanId,
  onSelectSingle,
  onSelectOverall,
  onSelectAssetReport,
  onSelectParagraph35a,
  onSelectEconomicPlan,
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
        .order("is_default", { ascending: false })
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
      // Erste Vorlage in einem Scope automatisch als Standard markieren.
      const existingForScope = (templates as any[]).filter((t) => t.scope === scope);
      const makeDefault = existingForScope.length === 0;
      const { error: insErr } = await supabase.from("billing_templates").insert({
        name: name.trim(),
        storage_path: path,
        scope,
        is_default: makeDefault,
      } as any);
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

  const setAsDefault = async (t: any) => {
    const { error } = await supabase
      .from("billing_templates")
      .update({ is_default: true } as any)
      .eq("id", t.id);
    if (error) {
      toast({ title: "Konnte nicht als Standard setzen", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["billing-templates"] });
    toast({ title: "Als Standard gesetzt", description: `${SCOPE_LABEL[t.scope as Scope] || t.scope}: ${t.name}` });
  };

  const select = (t: any) => {
    if (t.scope === "overall") onSelectOverall?.(t.id);
    else if (t.scope === "asset_report") onSelectAssetReport?.(t.id);
    else if (t.scope === "paragraph_35a") onSelectParagraph35a?.(t.id);
    else if (t.scope === "economic_plan") onSelectEconomicPlan?.(t.id);
    else onSelectSingle?.(t.id);
    toast({ title: "Vorlage aktiviert", description: t.name });
  };

  const isActive = (t: any) =>
    (t.scope === "overall" && selectedOverallId === t.id) ||
    (t.scope === "single" && selectedSingleId === t.id) ||
    (t.scope === "asset_report" && selectedAssetReportId === t.id) ||
    (t.scope === "paragraph_35a" && selectedParagraph35aId === t.id) ||
    (t.scope === "economic_plan" && selectedEconomicPlanId === t.id);

  const filteredTemplates = scopeFilter
    ? templates.filter((t: any) => t.scope === scopeFilter)
    : templates;

  // Nach Scope gruppieren — schöner Überblick, eine Sektion pro Dokumentart.
  const SCOPE_ORDER: Scope[] = ["combined_report", "overall", "single", "economic_plan", "asset_report", "paragraph_35a"];
  const grouped: Record<Scope, any[]> = {
    combined_report: [], overall: [], single: [], economic_plan: [], asset_report: [], paragraph_35a: [],
  };
  for (const t of filteredTemplates as any[]) {
    if (grouped[t.scope as Scope]) grouped[t.scope as Scope].push(t);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dokumenten-Vorlagen</DialogTitle>
          <DialogDescription>
            Lade Word-Vorlagen (.docx) hoch und markiere pro Dokumentart eine als{" "}
            <Star className="inline h-3.5 w-3.5 fill-amber-400 text-amber-500" /> <strong>Standard</strong>.
            Die Standard-Vorlage wird automatisch beim Download über den globalen „Dokumente"-Button benutzt.
            <br />
            Platzhalter wie <code>{"{empfaenger_name}"}</code> sowie Schleifen{" "}
            <code>{"{#sektionen}…{/sektionen}"}</code> und <code>{"{#zeilen}…{/zeilen}"}</code> werden unterstützt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border rounded-md p-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Standard 2025" />
            </div>
            <div>
              <Label className="text-xs">Dokumentart</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="overall">Gesamtabrechnung</SelectItem>
                  <SelectItem value="single">Einzelabrechnung</SelectItem>
                  <SelectItem value="economic_plan">Wirtschaftsplan</SelectItem>
                  <SelectItem value="combined_report">Sammel-Jahresbericht (Deckblatt + alle)</SelectItem>
                  <SelectItem value="asset_report">Vermögensbericht</SelectItem>
                  <SelectItem value="paragraph_35a">§35a Bescheinigung</SelectItem>
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

        <div className="space-y-4 max-h-[400px] overflow-auto">
          {SCOPE_ORDER.filter((s) => !scopeFilter || s === scopeFilter).map((s) => {
            const list = grouped[s];
            return (
              <div key={s} className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  {SCOPE_LABEL[s]}
                </div>
                {list.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic px-2 py-1">
                    Noch keine Vorlage hochgeladen.
                  </div>
                ) : list.map((t: any) => {
                  const active = isActive(t);
                  return (
                    <div key={t.id} className={`flex items-center justify-between border rounded p-2 ${t.is_default ? "border-amber-300 bg-amber-50/50" : active ? "border-primary bg-primary/5" : ""}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-2">
                            {t.name}
                            {t.is_default && (
                              <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> Standard
                              </Badge>
                            )}
                            {active && !t.is_default && (
                              <Badge variant="default" className="gap-1"><Check className="h-3 w-3" />Aktiv</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!t.is_default && (
                          <Button size="sm" variant="ghost" onClick={() => setAsDefault(t)} title="Als Standard markieren">
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        {!active && onSelectSingle && (
                          <Button size="sm" variant="outline" onClick={() => select(t)}>
                            Auswählen
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => remove(t)} title="Löschen">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
