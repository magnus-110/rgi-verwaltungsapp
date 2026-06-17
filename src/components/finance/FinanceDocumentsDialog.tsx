/**
 * FinanceDocumentsDialog
 *
 * Cleaner, einheitlicher Dialog für ALLE Finanz-Dokumente.
 * 6 Slots — pro Slot genau EINE Standard-Vorlage (Upload via Drag-and-Drop oder Klick).
 * Pro Slot DOCX/PDF-Download. Erkennt fehlende Vorlagen und disabled die Download-Buttons.
 *
 * Downloads werden via CustomEvent `finance:request-download` an die jeweiligen
 * Tab-Komponenten (BillingSettlement / ManualEconomicPlanEditor) dispatcht, die
 * die schwere Payload-Erstellung übernehmen.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  FileType,
  Upload,
  Trash2,
  CheckCircle2,
  CloudUpload,
  Loader2,
  FolderUp,
} from "lucide-react";
import { toast } from "sonner";

type Format = "docx" | "pdf" | "dms";

type Scope =
  | "overall"
  | "single"
  | "economic_plan_overall"
  | "economic_plan_single"
  | "asset_report"
  | "paragraph_35a"
  | "combined_report"
  | "service_nebenkosten"
  | "service_anlage_v"
  | "service_mietvertrag";

const SLOTS: { scope: Scope; title: string; desc: string }[] = [
  { scope: "overall", title: "Gesamtabrechnung", desc: "Eine Datei für die gesamte Liegenschaft" },
  { scope: "single", title: "Einzelabrechnung", desc: "Eine Datei pro Eigentümer (ZIP-Export)" },
  { scope: "economic_plan_overall", title: "Gesamtwirtschaftsplan", desc: "Plan für die gesamte Liegenschaft" },
  { scope: "economic_plan_single", title: "Einzelwirtschaftsplan", desc: "Pro Eigentümer (ZIP-Export)" },
  { scope: "asset_report", title: "Vermögensbericht", desc: "Gemäß §28 WEG" },
  { scope: "paragraph_35a", title: "§35a Bescheinigung", desc: "Haushaltsnahe Dienstleistungen (ZIP)" },
  { scope: "combined_report", title: "Sammelbericht", desc: "Alle Berichte (Abrechnung + Wirtschaftsplan + Vermögen + §35a) pro Eigentümer (ZIP)" },
];

const SERVICE_SLOTS: { scope: Scope; title: string; desc: string }[] = [
  { scope: "service_nebenkosten", title: "Nebenkostenabrechnung (Mieter)", desc: "Vorlage für den Service-Hub der Eigentümer" },
  { scope: "service_anlage_v", title: "Anlage V (Steuererklärung)", desc: "Vorlage für den Service-Hub der Eigentümer" },
  { scope: "service_mietvertrag", title: "Mietvertrag", desc: "Vorlage für den Service-Hub der Eigentümer" },
];

const SCOPE_TO_TARGET: Record<Scope, string> = {
  overall: "overall",
  single: "all",
  economic_plan_overall: "economic_plan_overall",
  economic_plan_single: "economic_plan_single",
  asset_report: "asset_report",
  paragraph_35a: "paragraph_35a",
  combined_report: "combined_report",
  service_nebenkosten: "service_nebenkosten",
  service_anlage_v: "service_anlage_v",
  service_mietvertrag: "service_mietvertrag",
};

const SERVICE_SCOPES: Scope[] = ["service_nebenkosten", "service_anlage_v", "service_mietvertrag"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedBuildingId: string | null;
  selectedPeriodId: string | null;
}

export function FinanceDocumentsDialog({
  open,
  onOpenChange,
  selectedBuildingId,
  selectedPeriodId,
}: Props) {
  const qc = useQueryClient();

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

  /** Pro Scope: aktuelle Standard-Vorlage (oder die neueste, falls keine Standard markiert). */
  const defaultBy = useMemo(() => {
    const m: Partial<Record<Scope, any>> = {};
    for (const t of templates as any[]) {
      const s = t.scope as Scope;
      if (!m[s] || (t.is_default && !m[s]!.is_default)) m[s] = t;
    }
    return m;
  }, [templates]);

  const requestDownload = (scope: Scope, format: Format) => {
    if (!selectedBuildingId) {
      toast.error("Bitte zuerst eine Liegenschaft auswählen.");
      return;
    }
    if (!selectedPeriodId) {
      toast.error("Bitte zuerst eine Abrechnungsperiode auswählen.");
      return;
    }
    const tpl = defaultBy[scope];
    if (!tpl) {
      toast.error("Für diese Dokumentart ist keine Vorlage hinterlegt.");
      return;
    }

    // Wirtschaftsplan: erst auf den richtigen Tab umschalten, damit der Editor
    // gemountet ist und den Download-Event empfangen kann.
    const needsWp = scope === "economic_plan_overall" || scope === "economic_plan_single" || scope === "combined_report";
    if (needsWp) {
      window.dispatchEvent(
        new CustomEvent("finance:switch-settlement-tab", { detail: { tab: "wirtschaftsplan" } }),
      );
    }

    const dispatch = () =>
      window.dispatchEvent(
        new CustomEvent("finance:request-download", {
          detail: { target: SCOPE_TO_TARGET[scope], format, template_id: tpl.id },
        }),
      );
    if (needsWp) {
      setTimeout(dispatch, 1500);
    } else {
      dispatch();
    }
    toast.message(format === "dms" ? "Wird ins DMS abgelegt…" : "Download wird vorbereitet…");
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dokumente</DialogTitle>
          <DialogDescription>
            Eine Word-Vorlage pro Dokumentart. Hochladen per Drag-and-Drop oder Klick.
            Anschließend DOCX oder PDF herunterladen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {SLOTS.map((s) => (
            <SlotCard
              key={s.scope}
              scope={s.scope}
              title={s.title}
              description={s.desc}
              template={defaultBy[s.scope] as any}
              onChanged={() => qc.invalidateQueries({ queryKey: ["billing-templates"] })}
              onDownload={(fmt) => requestDownload(s.scope, fmt)}
            />
          ))}

          <div className="pt-4 pb-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Service-Hub (Eigentümer-Dokumente)
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Diese .docx-Vorlagen werden verwendet, wenn ein Eigentümer im Service-Hub eines
              dieser Dokumente bestellt. Globale Vorlage — gilt für alle Liegenschaften.
            </p>
          </div>
          {SERVICE_SLOTS.map((s) => (
            <SlotCard
              key={s.scope}
              scope={s.scope}
              title={s.title}
              description={s.desc}
              template={defaultBy[s.scope] as any}
              onChanged={() => qc.invalidateQueries({ queryKey: ["billing-templates"] })}
              onDownload={(fmt) => requestDownload(s.scope, fmt)}
              uploadOnly
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- Slot Card ---------------- */

function SlotCard({
  scope,
  title,
  description,
  template,
  onChanged,
  onDownload,
  uploadOnly = false,
}: {
  scope: Scope;
  title: string;
  description: string;
  template?: { id: string; name: string; storage_path: string } | null;
  onChanged: () => void;
  onDownload: (fmt: Format) => void;
  uploadOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".docx")) {
        toast.error("Nur .docx-Dateien werden unterstützt.");
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

        // Alte Vorlage(n) dieses Scopes ersetzen — wir wollen genau eine pro Slot.
        const { data: existing } = await supabase
          .from("billing_templates")
          .select("id, storage_path")
          .eq("scope", scope);
        if (existing && existing.length > 0) {
          const paths = (existing as any[]).map((e) => e.storage_path).filter(Boolean);
          if (paths.length > 0) {
            await supabase.storage.from("billing-templates").remove(paths);
          }
          await supabase
            .from("billing_templates")
            .delete()
            .in(
              "id",
              (existing as any[]).map((e) => e.id),
            );
        }

        const { error: insErr } = await supabase.from("billing_templates").insert({
          name: file.name.replace(/\.docx$/i, ""),
          storage_path: path,
          scope,
          is_default: true,
        } as any);
        if (insErr) throw insErr;

        onChanged();
        toast.success("Vorlage gespeichert");
      } catch (e: any) {
        toast.error("Upload fehlgeschlagen", { description: e?.message });
      } finally {
        setBusy(false);
      }
    },
    [scope, onChanged],
  );

  const remove = async () => {
    if (!template) return;
    if (!confirm(`Vorlage "${template.name}" entfernen?`)) return;
    setBusy(true);
    try {
      await supabase.storage.from("billing-templates").remove([template.storage_path]);
      await supabase.from("billing_templates").delete().eq("id", template.id);
      onChanged();
      toast.success("Vorlage entfernt");
    } catch (e: any) {
      toast.error("Entfernen fehlgeschlagen", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border rounded-lg p-3 transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{title}</span>
            {template ? (
              <Badge variant="outline" className="gap-1 border-emerald-400 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Vorlage aktiv
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">keine Vorlage</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          {template && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate flex items-center gap-1">
              <FileText className="h-3 w-3 shrink-0" />
              {template.name}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            title={template ? "Vorlage ersetzen" : "Vorlage hochladen"}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : template ? (
              <Upload className="h-4 w-4" />
            ) : (
              <CloudUpload className="h-4 w-4" />
            )}
          </Button>
          {template && (
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy} title="Vorlage entfernen">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
          {!uploadOnly && (
            <>
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                size="sm"
                variant="outline"
                disabled={!template}
                onClick={() => onDownload("docx")}
                title="Als DOCX herunterladen"
              >
                <FileType className="h-4 w-4 mr-1" />
                DOCX
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!template}
                onClick={() => onDownload("pdf")}
                title="Als PDF herunterladen"
              >
                <FileText className="h-4 w-4 mr-1" />
                PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!template}
                onClick={() => onDownload("dms")}
                title="PDF erzeugen und im DMS ablegen (pro Eigentümer, falls Einzeldokument)"
              >
                <FolderUp className="h-4 w-4 mr-1" />
                DMS
              </Button>
            </>
          )}
        </div>
      </div>


      {!template && (
        <div className="mt-2 text-[11px] text-muted-foreground italic">
          Datei hierher ziehen oder Upload-Button klicken (.docx)
        </div>
      )}
    </div>
  );
}
