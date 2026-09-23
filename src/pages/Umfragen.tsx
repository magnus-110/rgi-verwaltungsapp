import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SurveyDashboard from "@/components/survey/SurveyDashboard";
import SurveyItemsEditor from "@/components/survey/SurveyItemsEditor";
import SurveyKopf from "@/components/survey/SurveyKopf";
import SurveyList from "@/components/survey/SurveyList";
import SurveySettingsTab from "@/components/survey/SurveySettingsTab";
import SurveyRunner from "@/components/survey/SurveyRunner";
import { useAdminSurvey } from "@/hooks/useSurveysAdmin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardList } from "lucide-react";

/**
 * Verwaltungs-Seite „Umfragen".
 *
 * Links: Gebäude wählen und die Umfragen dieses Gebäudes.
 * Rechts: ein fester Kopf mit Zustand, Zeitraum und Beteiligung, darunter
 * drei Reiter — Fragen (mit den Fotos), Ergebnisse, Einstellungen.
 */
export default function UmfragenPage() {
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["all-buildings-for-surveys"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("buildings")
        .select("id, name")
        .order("name", { ascending: true });
      return (data || []) as { id: string; name: string }[];
    },
  });

  useEffect(() => {
    if (!buildingId && buildings.length) setBuildingId(buildings[0].id);
  }, [buildings, buildingId]);

  useEffect(() => { setSurveyId(null); }, [buildingId]);

  const { data: survey } = useAdminSurvey(surveyId ?? undefined);
  const gebaeudeName = buildings.find((b) => b.id === buildingId)?.name;

  const { data: agendaMap = {} } = useQuery({
    queryKey: ["survey-items", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("survey_items")
        .select("id, on_agenda")
        .eq("survey_id", surveyId);
      const map: Record<string, boolean | null> = {};
      (data || []).forEach((r: any) => (map[r.id] = r.on_agenda));
      return map;
    },
  });

  return (
    <div className="p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[288px_1fr]">
        {/* ---------- links ---------- */}
        <aside className="space-y-3">
          <h1 className="text-xl font-semibold">Umfragen</h1>
          <Select value={buildingId ?? undefined} onValueChange={setBuildingId}>
            <SelectTrigger className="h-9 w-full text-[13px]"><SelectValue placeholder="Gebäude wählen" /></SelectTrigger>
            <SelectContent>
              {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {buildingId && (
            <SurveyList buildingId={buildingId} selectedId={surveyId ?? undefined} onSelect={setSurveyId} />
          )}
        </aside>

        {/* ---------- rechts ---------- */}
        <main className="min-w-0">
          {!buildingId ? (
            <Leer text="Bitte links ein Gebäude wählen." />
          ) : !survey ? (
            <Leer text="Wählen Sie links eine Umfrage aus oder legen Sie eine neue an." />
          ) : (
            <div className="space-y-4">
              <SurveyKopf
                survey={survey}
                gebaeudeName={gebaeudeName}
                onVorschau={() => setPreviewOpen(true)}
                onDeleted={() => setSurveyId(null)}
              />

              <Tabs defaultValue="fragen">
                <TabsList>
                  <TabsTrigger value="fragen">
                    Fragen
                    {(survey.item_count ?? 0) > 0 && (
                      <span className="ml-1.5 text-muted-foreground">{survey.item_count}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="ergebnisse">Ergebnisse</TabsTrigger>
                  <TabsTrigger value="einstellungen">Einstellungen</TabsTrigger>
                </TabsList>

                <TabsContent value="fragen" className="mt-4">
                  <SurveyItemsEditor surveyId={survey.id} buildingId={buildingId} />
                </TabsContent>
                <TabsContent value="ergebnisse" className="mt-4">
                  <SurveyDashboard survey={survey} agendaMap={agendaMap} />
                </TabsContent>
                <TabsContent value="einstellungen" className="mt-4">
                  <SurveySettingsTab survey={survey} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </main>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Vorschau (wie Eigentümer es sehen)</DialogTitle></DialogHeader>
          {surveyId && <SurveyRunner surveyId={surveyId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Leer({ text }: { text: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <ClipboardList className="h-8 w-8 text-muted-foreground/60" />
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
