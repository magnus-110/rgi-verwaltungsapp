import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSignature, Loader2, Download, FileText } from "lucide-react";
import { toast } from "sonner";

const SECTIONS: { key: string; label: string }[] = [
  { key: "sachstand", label: "Sachstandsbericht" },
  { key: "instandhaltung", label: "Instandhaltungsbericht" },
  { key: "vermoegen", label: "Vermögensbericht" },
  { key: "sonstiges", label: "Sonstiges" },
];

interface Props {
  itemId: string;
  meetingId: string;
  isReport: boolean;
  sections: Record<string, string>;
}

export function ManagementReportPanel({ itemId, meetingId, isReport, sections }: Props) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(isReport);
  const [values, setValues] = useState<Record<string, string>>({
    sachstand: sections?.sachstand ?? "",
    instandhaltung: sections?.instandhaltung ?? "",
    vermoegen: sections?.vermoegen ?? "",
    sonstiges: sections?.sonstiges ?? "",
  });
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ["etv-report-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_report_templates" as any)
        .select("id, name, is_default")
        .order("is_default", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled,
  });

  const toggle = async (v: boolean) => {
    setEnabled(v);
    const { error } = await supabase
      .from("etv_agenda_items")
      .update({ is_management_report: v } as any)
      .eq("id", itemId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("etv_agenda_items")
      .update({ report_sections: values } as any)
      .eq("id", itemId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bericht gespeichert");
    qc.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
  };

  const generate = async (format: "pdf" | "docx") => {
    setBusy(format);
    try {
      const { error } = await supabase
        .from("etv_agenda_items")
        .update({ report_sections: values } as any)
        .eq("id", itemId);
      if (error) throw error;

      const { data, error: fnErr } = await supabase.functions.invoke("etv-render-report", {
        body: { agenda_item_id: itemId, template_id: templateId, output_format: format },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.signed_url;
      if (!url) throw new Error("Keine Datei erhalten");
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Bericht erstellt");
    } catch (e: any) {
      toast.error(e?.message || "Bericht konnte nicht erstellt werden");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border bg-muted/10 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <FileSignature className="h-3.5 w-3.5" /> Bericht der Verwaltung
        </Label>
        <Switch checked={enabled} onCheckedChange={toggle} />
      </div>

      {enabled && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Diese vier Abschnitte werden in die Word-Vorlage übernommen und als Bericht zur Einladung erzeugt.
          </p>
          {SECTIONS.map((s) => (
            <div key={s.key} className="space-y-1">
              <Label className="text-xs">{s.label}</Label>
              <Textarea
                rows={4}
                value={values[s.key] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [s.key]: e.target.value }))}
                placeholder={`${s.label} …`}
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="h-9 w-full sm:w-64">
                <SelectValue placeholder={templates.length ? "Standardvorlage" : "Keine Vorlage vorhanden"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.is_default ? " (Standard)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Speichern"}
            </Button>
            <Button size="sm" onClick={() => generate("pdf")} disabled={busy !== null} className="gap-1.5">
              {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Bericht als PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => generate("docx")} disabled={busy !== null} className="gap-1.5">
              {busy === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              als Word
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
