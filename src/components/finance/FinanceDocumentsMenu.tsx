/**
 * FinanceDocumentsMenu
 *
 * Einheitlicher Button im Finance-Header für ALLE Dokumenttypen:
 *  - Gesamtabrechnung
 *  - Einzelabrechnungen (alle als ZIP)
 *  - Vermögensbericht
 *  - §35a Bescheinigung
 *  - Wirtschaftsplan (Gesamt + Einzel als ZIP)
 *
 * Architektur:
 *  - "Vorlagen verwalten" öffnet direkt den BillingTemplatesDialog
 *    (zeigt alle 5 Scopes inkl. Standard-Markierung).
 *  - "Herunterladen" wechselt – falls nötig – in den Abrechnungs-Tab,
 *    wartet kurz auf das Mount und dispatcht ein CustomEvent
 *    `finance:request-download`. BillingSettlement & ManualEconomicPlanEditor
 *    lauschen darauf und rufen ihre vorhandenen Download-Funktionen auf.
 *
 *  - Voraussetzungen werden vor dem Dispatch geprüft:
 *      * Gebäude muss gewählt sein
 *      * Periode muss gewählt sein
 *      * Eine Standard-Vorlage für den gewünschten Scope muss existieren
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, FileType, Settings2, Download, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BillingTemplatesDialog } from "./BillingTemplatesDialog";
import { toast } from "sonner";

export type DownloadRequest = {
  target:
    | "overall"          // Gesamtabrechnung
    | "all"              // Alle Einzelabrechnungen als ZIP
    | "asset_report"     // Vermögensbericht
    | "paragraph_35a"    // §35a Bescheinigung (ZIP)
    | "economic_plan_overall"
    | "economic_plan_all";
  format: "docx" | "pdf";
};

interface Props {
  selectedBuildingId: string | null;
  selectedPeriodId: string | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const SCOPE_FOR_TARGET: Record<DownloadRequest["target"], string> = {
  overall: "overall",
  all: "single",
  asset_report: "asset_report",
  paragraph_35a: "paragraph_35a",
  economic_plan_overall: "economic_plan",
  economic_plan_all: "economic_plan",
};

export function FinanceDocumentsMenu({
  selectedBuildingId,
  selectedPeriodId,
  activeTab,
  onTabChange,
}: Props) {
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Standard-Vorlagen aus DB laden (für Disabled-State der Download-Items)
  const { data: defaults = {} } = useQuery({
    queryKey: ["billing-templates-defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_templates")
        .select("id, scope, name, is_default")
        .eq("is_default", true);
      if (error) throw error;
      const map: Record<string, { id: string; name: string }> = {};
      for (const t of data || []) map[(t as any).scope] = { id: (t as any).id, name: (t as any).name };
      return map;
    },
  });

  const hasDefaultForTarget = (target: DownloadRequest["target"]) =>
    Boolean(defaults[SCOPE_FOR_TARGET[target]]);

  const requestDownload = (req: DownloadRequest) => {
    if (!selectedBuildingId) {
      toast.error("Bitte zuerst eine Liegenschaft auswählen.");
      return;
    }
    if (!selectedPeriodId) {
      toast.error("Bitte zuerst eine Abrechnungsperiode auswählen.");
      return;
    }
    if (!hasDefaultForTarget(req.target)) {
      toast.error("Für diese Dokumentart ist keine Standard-Vorlage gesetzt.", {
        description: "Bitte zuerst eine Vorlage hochladen und als Standard markieren.",
        action: { label: "Vorlagen öffnen", onClick: () => setTemplatesOpen(true) },
      });
      return;
    }

    const needsAbrechnungTab = req.target !== "economic_plan_overall" && req.target !== "economic_plan_all";
    const targetTab = needsAbrechnungTab ? "abrechnung" : "abrechnung"; // Wirtschaftsplan-Editor lebt aktuell als Tab innerhalb Abrechnung
    if (activeTab !== targetTab) {
      onTabChange(targetTab);
    }

    // Kurzer Delay, damit das Ziel-Component gemountet ist
    const dispatch = () =>
      window.dispatchEvent(new CustomEvent("finance:request-download", { detail: req }));
    if (activeTab !== targetTab) {
      setTimeout(dispatch, 300);
    } else {
      dispatch();
    }
    toast.message("Download wird vorbereitet…");
  };

  const FormatItems = ({ target, label }: { target: DownloadRequest["target"]; label: string }) => (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={!hasDefaultForTarget(target)}>
        <Download className="h-4 w-4 mr-2" />
        {label}
        {!hasDefaultForTarget(target) && (
          <span className="ml-auto text-[10px] text-muted-foreground">keine Vorlage</span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem onClick={() => requestDownload({ target, format: "docx" })}>
          <FileType className="h-4 w-4 mr-2" /> DOCX
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => requestDownload({ target, format: "pdf" })}>
          <FileText className="h-4 w-4 mr-2" /> PDF
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <FileText className="h-4 w-4" />
            Dokumente
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Herunterladen</DropdownMenuLabel>
          <FormatItems target="overall" label="Gesamtabrechnung" />
          <FormatItems target="all" label="Einzelabrechnungen (ZIP)" />
          <FormatItems target="asset_report" label="Vermögensbericht" />
          <FormatItems target="paragraph_35a" label="§35a Bescheinigungen (ZIP)" />
          <FormatItems target="economic_plan_overall" label="Wirtschaftsplan (Gesamt)" />
          <FormatItems target="economic_plan_all" label="Wirtschaftspläne (Einzel, ZIP)" />

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTemplatesOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" /> Vorlagen verwalten…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BillingTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </>
  );
}
