import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { HelpCircle, Loader2, Download, FileText, FolderArchive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { TemplateList } from "./TemplateList";
import { RecipientPicker, RecipientFilterValue } from "./RecipientPicker";
import { VariableHelpSheet } from "./VariableHelpSheet";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  meetingId?: string;
  titlePrefix?: string;
}

export const LetterCampaignWizard = ({ open, onOpenChange, buildingId, meetingId, titlePrefix }: Props) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<any>(null);
  const [filter, setFilter] = useState<RecipientFilterValue>({ roles: meetingId ? ["eigentuemer"] : [], contact_ids: [], assignment_ids: [], require_email: false });
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"docx" | "pdf">("docx");
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [resultStats, setResultStats] = useState<{ ok: number; failed: number } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const reset = () => {
    setStep(1); setName(""); setTemplate(null);
    setFilter({ roles: [], contact_ids: [], assignment_ids: [], require_email: false });
    setOutputFormat("docx");
    setResultPath(null); setResultStats(null);
  };

  const handleGenerate = async () => {
    if (!template) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const recipientIds = filter.contact_ids.includes("__none__") ? [] : filter.contact_ids;

      const { data: campaign, error: cErr } = await supabase.from("comm_campaigns").insert({
        name: name.trim() || `Serienbrief ${template.name}`,
        type: "letter",
        template_id: template.id,
        building_id: buildingId,
        recipient_filter: { roles: filter.roles, contact_ids: recipientIds },
        status: "draft",
        created_by: userId,
      }).select().single();
      if (cErr) throw cErr;

      const { data: result, error: rErr } = await supabase.functions.invoke("comm-render-letters", {
        body: { campaign_id: campaign.id, output_format: outputFormat },
      });
      if (rErr) throw rErr;
      const r = result as any;
      if (r?.error) throw new Error(r.error);

      setResultPath(r.zip_path);
      setResultStats({ ok: r.ok, failed: r.failed });
      setStep(4);
      qc.invalidateQueries({ queryKey: ["comm-campaigns", buildingId] });
      toast({ title: "Briefe erstellt", description: `${r.ok} erfolgreich, ${r.failed} fehlgeschlagen` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Fehlgeschlagen", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!resultPath) return;
    const { data, error } = await supabase.storage.from("comm-assets").createSignedUrl(resultPath, 600);
    if (error || !data?.signedUrl) { toast({ title: "Download-Fehler", variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Neuer Serienbrief</DialogTitle>
          <DialogDescription>Schritt {step} von 3 — Vorlage wählen, Empfänger filtern, Briefe generieren.</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Vorlage wählen</h3>
              <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
                <HelpCircle className="h-4 w-4 mr-1" /> Platzhalter-Hilfe
              </Button>
            </div>
            <TemplateList buildingId={buildingId} type="letter" onUse={(t) => { setTemplate(t); setName(`Serienbrief: ${t.name}`); setStep(2); }} />
          </div>
        )}

        {step === 2 && template && (
          <div className="space-y-4">
            <Card className="p-3 bg-muted/40">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{template.name}</span>
                {Array.isArray(template.variables) && template.variables.length > 0 && (
                  <span className="text-muted-foreground ml-auto text-xs">{template.variables.length} Platzhalter</span>
                )}
              </div>
            </Card>

            <div>
              <Label>Kampagnenname</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <Label className="mb-2 block">Empfänger</Label>
              <RecipientPicker buildingId={buildingId} requireEmail={false} value={filter} onChange={setFilter} />
            </div>

            <div>
              <Label className="mb-2 block">Ausgabeformat</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={outputFormat === "docx" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOutputFormat("docx")}
                >
                  DOCX (Word)
                </Button>
                <Button
                  type="button"
                  variant={outputFormat === "pdf" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOutputFormat("pdf")}
                >
                  PDF (via CloudConvert)
                </Button>
              </div>
              {outputFormat === "pdf" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Konvertierung kann je nach Empfängeranzahl etwas dauern.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-8 space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Briefe erstellt</h3>
              {resultStats && (
                <p className="text-sm text-muted-foreground">
                  {resultStats.ok} erfolgreich, {resultStats.failed} fehlgeschlagen
                </p>
              )}
            </div>
            <div className="mx-auto max-w-sm rounded-md border bg-muted/40 p-3 text-left text-xs flex items-start gap-2">
              <FolderArchive className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span>
                Das ZIP-Bundle wurde automatisch im <strong>Dokumentenarchiv (Serienbriefe)</strong> der Liegenschaft abgelegt.
              </span>
            </div>
            <Button onClick={handleDownload} size="lg">
              <Download className="h-4 w-4 mr-2" /> ZIP herunterladen
            </Button>
          </div>
        )}

        <DialogFooter>
          {step === 2 && <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>Zurück</Button>}
          {step === 2 && (
            <Button onClick={handleGenerate} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Briefe erstellen
            </Button>
          )}
          {step === 4 && <Button onClick={() => onOpenChange(false)}>Schließen</Button>}
        </DialogFooter>

        <VariableHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
      </DialogContent>
    </Dialog>
  );
};
