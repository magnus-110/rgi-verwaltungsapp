import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SurveyDashboard from "@/components/survey/SurveyDashboard";
import SurveyImageManager from "@/components/survey/SurveyImageManager";
import SurveyItemsEditor from "@/components/survey/SurveyItemsEditor";
import SurveyList from "@/components/survey/SurveyList";
import SurveySettingsTab from "@/components/survey/SurveySettingsTab";
import SurveyRunner from "@/components/survey/SurveyRunner";
import { useAdminSurvey } from "@/hooks/useSurveysAdmin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";

/**
 * Verwaltungs-Seite „Umfragen":
 * Links: Gebäude wählen + Liste aller Umfragen.
 * Rechts: gewählte Umfrage mit Tabs (Einstellungen / Punkte / Bilder / Ergebnisse) + Vorschau.
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
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Umfragen</h1>
        <Select value={buildingId ?? undefined} onValueChange={setBuildingId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Gebäude wählen" /></SelectTrigger>
          <SelectContent>
            {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!buildingId ? (
        <Card><CardContent className="p-6 text-muted-foreground">Bitte ein Gebäude wählen.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <div>
            <SurveyList buildingId={buildingId} selectedId={surveyId ?? undefined} onSelect={setSurveyId} />
          </div>
          <div>
            {!survey ? (
              <Card><CardContent className="p-6 text-muted-foreground">
                Wählen Sie links eine Umfrage aus oder legen Sie eine neue an.
              </CardContent></Card>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{survey.title}</div>
                    {survey.description && <div className="text-sm text-muted-foreground">{survey.description}</div>}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
                    <Eye className="h-4 w-4 mr-1" /> Vorschau
                  </Button>
                </div>
                <Tabs defaultValue="einstellungen">
                  <TabsList>
                    <TabsTrigger value="einstellungen">Einstellungen</TabsTrigger>
                    <TabsTrigger value="punkte">Punkte</TabsTrigger>
                    <TabsTrigger value="bilder">Bilder</TabsTrigger>
                    <TabsTrigger value="ergebnisse">Ergebnisse</TabsTrigger>
                  </TabsList>
                  <TabsContent value="einstellungen" className="mt-4">
                    <SurveySettingsTab survey={survey} onDeleted={() => setSurveyId(null)} />
                  </TabsContent>
                  <TabsContent value="punkte" className="mt-4">
                    <SurveyItemsEditor surveyId={survey.id} />
                  </TabsContent>
                  <TabsContent value="bilder" className="mt-4">
                    <SurveyImageManager surveyId={survey.id} />
                  </TabsContent>
                  <TabsContent value="ergebnisse" className="mt-4">
                    <SurveyDashboard surveyId={survey.id} buildingId={buildingId} agendaMap={agendaMap} />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Vorschau (wie Eigentümer es sehen)</DialogTitle></DialogHeader>
          {surveyId && <SurveyRunner surveyId={surveyId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
