/**
 * EconomicPlanSection — konsolidiert die bisherige /finanzen/wirtschaftsplan-Route
 * in den Tab "Planung & Berichte". Bietet drei Zugangsmodi:
 *   1. Aus Vorjahr generieren (braucht Periode, nutzt EconomicPlanEditor)
 *   2. Manuell anlegen (Jahres-Input, ManualEconomicPlanEditor)
 *   3. Bestehenden Plan öffnen (Liste mit Status)
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FilePlus2, FileStack, ArrowLeft } from "lucide-react";
import { EconomicPlanEditor } from "./EconomicPlanEditor";
import { ManualEconomicPlanEditor } from "./ManualEconomicPlanEditor";

interface Props {
  buildingId: string;
  periodId: string | null;
  fiscalYear: number | null;
}

type Mode = "from-prev" | "manual" | "existing";

export function EconomicPlanSection({ buildingId, periodId, fiscalYear }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [manualYear, setManualYear] = useState<string>(String(new Date().getFullYear()));
  const [openPlanYear, setOpenPlanYear] = useState<number | null>(null);

  // Reset wenn Liegenschaft wechselt
  useEffect(() => {
    setMode(null);
    setOpenPlanYear(null);
  }, [buildingId]);

  const { data: existingPlans = [] } = useQuery({
    queryKey: ["economic-plans-list", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_plans" as any)
        .select("id, fiscal_year, status, source")
        .eq("building_id", buildingId)
        .order("fiscal_year", { ascending: false });
      if (error) throw error;
      return (data as any) || [];
    },
  });

  const reset = () => { setMode(null); setOpenPlanYear(null); };

  // Mode 1: Aus Vorjahr — braucht Periode
  if (mode === "from-prev") {
    if (!periodId || !fiscalYear) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground space-y-3">
            <p className="text-sm">Bitte wähle oben das Abrechnungsjahr, auf dem der Wirtschaftsplan basieren soll.</p>
            <Button variant="ghost" size="sm" onClick={reset}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Zurück
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={reset}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Zurück zur Auswahl
        </Button>
        <EconomicPlanEditor buildingId={buildingId} periodId={periodId} fiscalYear={fiscalYear} />
      </div>
    );
  }

  // Mode 2: Manuell
  if (mode === "manual") {
    return (
      <div className="space-y-3">
        <Card>
          <CardContent className="py-3 flex flex-wrap items-end gap-3">
            <Button variant="ghost" size="sm" onClick={reset}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Zurück
            </Button>
            <div>
              <Label className="text-xs">Wirtschaftsjahr</Label>
              <Input
                type="number"
                value={manualYear}
                onChange={(e) => setManualYear(e.target.value)}
                className="w-32"
              />
            </div>
          </CardContent>
        </Card>
        {manualYear && /^\d{4}$/.test(manualYear) && (
          <ManualEconomicPlanEditor buildingId={buildingId} fiscalYear={parseInt(manualYear, 10)} />
        )}
      </div>
    );
  }

  // Mode 3: Bestehenden Plan öffnen
  if (mode === "existing" && openPlanYear != null) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={reset}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Zurück zur Auswahl
        </Button>
        <ManualEconomicPlanEditor buildingId={buildingId} fiscalYear={openPlanYear} />
      </div>
    );
  }

  // Standard: Modus-Auswahl
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setMode("from-prev")}
        >
          <CardContent className="py-6 text-center space-y-2">
            <FileStack className="h-8 w-8 mx-auto text-primary" />
            <h3 className="font-semibold text-sm">Aus Vorjahr generieren</h3>
            <p className="text-xs text-muted-foreground">
              Hochrechnung basierend auf einer bestehenden Abrechnungsperiode.
              Empfohlen, wenn ein Vorjahr im System ist.
            </p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setMode("manual")}
        >
          <CardContent className="py-6 text-center space-y-2">
            <FilePlus2 className="h-8 w-8 mx-auto text-primary" />
            <h3 className="font-semibold text-sm">Manuell anlegen</h3>
            <p className="text-xs text-muted-foreground">
              Leerer Plan zur direkten Eingabe. Empfohlen bei Neuübernahme einer
              Liegenschaft ohne Vorjahresdaten.
            </p>
          </CardContent>
        </Card>
      </div>

      {existingPlans.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Bestehende Pläne
            </p>
            <div className="flex flex-wrap gap-2">
              {existingPlans.map((p: any) => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="sm"
                  onClick={() => { setMode("existing"); setOpenPlanYear(p.fiscal_year); }}
                  className="gap-2"
                >
                  <span>{p.fiscal_year}</span>
                  <Badge
                    variant={p.status === "active" ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {p.status === "active" ? "aktiv" : p.status === "draft" ? "Entwurf" : "archiviert"}
                  </Badge>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
