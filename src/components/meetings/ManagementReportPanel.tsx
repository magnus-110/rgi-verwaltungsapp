import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { REPORT_SECTIONS, ReportSections } from "@/lib/managementReport";

interface Props {
  itemId: string | null;
  values: ReportSections;
  onChange: (values: ReportSections) => void;
  /** speichert den aktuellen Bearbeitungsstand, bevor gerendert wird */
  onBeforeGenerate?: () => Promise<void> | void;
}

export function ManagementReportPanel({ itemId, values, onChange, onBeforeGenerate }: Props) {
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
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
  });

  const generate = async (format: "pdf" | "docx") => {
    if (!itemId) return;
    setBusy(format);
    try {
      await onBeforeGenerate?.();
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
    <div className="space-y-3">
      {REPORT_SECTIONS.map((s) => (
        <div key={s.key} className="space-y-1">
          <Label className="text-xs">{s.label}</Label>
          <Textarea
            rows={4}
            value={values[s.key] ?? ""}
            onChange={(e) => onChange({ ...values, [s.key]: e.target.value })}
            placeholder={`${s.label} …`}
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className="h-8 w-full sm:w-56 text-xs">
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
        <Button type="button" size="sm" variant="outline" onClick={() => generate("pdf")} disabled={busy !== null} className="h-8 gap-1.5 text-xs">
          {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Bericht als PDF
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => generate("docx")} disabled={busy !== null} className="h-8 gap-1.5 text-xs">
          {busy === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          als Word
        </Button>
      </div>
    </div>
  );
}
