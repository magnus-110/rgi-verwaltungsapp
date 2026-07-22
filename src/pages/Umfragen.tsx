import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SurveyDashboard from "@/components/survey/SurveyDashboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Verwaltungs-Seite "Umfragen": Gebäude wählen → aktuelle Umfrage + Ergebnis-Dashboard.
 * Route: /umfragen (innerhalb AdminLayout). Nur für Verwaltung (AdminLayout schützt bereits).
 */
export default function UmfragenPage() {
  const [buildingId, setBuildingId] = useState<string | null>(null);

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

  // aktuellste Umfrage des Gebäudes (jeder Status)
  const { data: survey } = useQuery({
    queryKey: ["admin-survey", buildingId],
    enabled: !!buildingId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("surveys")
        .select("id, title, status")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; title: string; status: string } | null;
    },
  });

  // on_agenda-Zustand der Items (manuelle Verwaltungs-Entscheidung)
  const { data: agendaMap = {} } = useQuery({
    queryKey: ["survey-items", survey?.id],
    enabled: !!survey?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("survey_items")
        .select("id, on_agenda")
        .eq("survey_id", survey!.id);
      const map: Record<string, boolean | null> = {};
      (data || []).forEach((r: any) => (map[r.id] = r.on_agenda));
      return map;
    },
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Umfragen</h1>
        <Select value={buildingId ?? undefined} onValueChange={setBuildingId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Gebäude wählen" /></SelectTrigger>
          <SelectContent>
            {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!survey ? (
        <Card><CardContent className="p-6 text-muted-foreground">
          Für dieses Gebäude gibt es noch keine Umfrage.
        </CardContent></Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {survey.title} · Status: <b>{survey.status}</b>
          </div>
          <SurveyDashboard surveyId={survey.id} buildingId={buildingId!} agendaMap={agendaMap} />
        </>
      )}
    </div>
  );
}
