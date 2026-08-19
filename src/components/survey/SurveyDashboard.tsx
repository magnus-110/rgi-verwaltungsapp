import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSurveyResults, useSurveyVoteDetails, Einstufung, ItemResult, VoteDetail } from "@/hooks/useSurvey";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

/**
 * Verwaltungs-Dashboard: Ergebnisse einer Umfrage (Kopf + MEA), automatische
 * Einstufung und finale Entscheidung "auf die Tagesordnung" (survey_items.on_agenda).
 * Zugriff im Router zusätzlich auf Verwaltungs-Rolle beschränken.
 */

const EINSTUFUNG: Record<Einstufung, { label: string; cls: string; defaultOn: boolean }> = {
  pflicht:         { label: "Pflicht / Sicherheit – kommt auf TO", cls: "bg-red-100 text-red-700", defaultOn: true },
  antrag:          { label: "Hohe Zustimmung – Beschlussantrag",   cls: "bg-emerald-100 text-emerald-700", defaultOn: true },
  diskussion:      { label: "Mittlere Zustimmung – Diskussionspunkt", cls: "bg-amber-100 text-amber-800", defaultOn: true },
  zurueckgestellt: { label: "Geringe Zustimmung – zurückgestellt",  cls: "bg-muted text-muted-foreground", defaultOn: false },
};

export default function SurveyDashboard({ surveyId, buildingId, agendaMap }: {
  surveyId: string; buildingId: string;
  agendaMap: Record<string, boolean | null>; // item_id -> on_agenda (aus survey_items geladen)
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useSurveyResults(surveyId, buildingId);
  const { data: voteDetails = {} } = useSurveyVoteDetails(surveyId, buildingId);

  const setAgenda = useMutation({
    mutationFn: async ({ itemId, on }: { itemId: string; on: boolean }) => {
      const { error } = await (supabase as any).from("survey_items").update({ on_agenda: on }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["survey-items", surveyId] }),
  });

  if (isLoading || !data) return <div className="p-6 text-muted-foreground">Ergebnisse werden geladen …</div>;

  const onCount = data.results.filter((r) => (agendaMap[r.item_id] ?? EINSTUFUNG[r.einstufung].defaultOn)).length;

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi value={`${data.beteiligungPct}%`} label="Beteiligung (nach MEA)" />
        <Kpi value={`${onCount} / ${data.results.length}`} label="Punkte auf Tagesordnung" />
        <Kpi value={data.totalMea.toLocaleString("de-DE")} label="Gesamt-MEA" />
      </div>

      {data.beteiligungPct < 40 && (
        <div className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
          Beteiligung unter 40 % – Ergebnis nur als Tendenz werten.
        </div>
      )}

      {data.results.map((r) => (
        <ResultRow key={r.item_id} r={r} votes={voteDetails[r.item_id] || []}
          on={agendaMap[r.item_id] ?? EINSTUFUNG[r.einstufung].defaultOn}
          onToggle={(on) => setAgenda.mutate({ itemId: r.item_id, on })} />
      ))}
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </CardContent></Card>
  );
}

const CHOICE_BADGE: Record<string, { label: string; cls: string }> = {
  ja: { label: "Ja", cls: "bg-emerald-100 text-emerald-700" },
  neutral: { label: "Neutral", cls: "bg-muted text-muted-foreground" },
  nein: { label: "Nein", cls: "bg-red-100 text-red-700" },
};

function VoteList({ votes }: { votes: VoteDetail[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
        Einzelstimmen anzeigen ({votes.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 border-t pt-2">
        {votes.map((v) => {
          const badge = CHOICE_BADGE[v.choice ?? ""] ?? { label: "—", cls: "bg-muted text-muted-foreground" };
          return (
            <div key={v.contact_id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{v.name}</span>
                {v.unit_number && <span className="text-xs text-muted-foreground">Einheit {v.unit_number}</span>}
                <span className="text-xs text-muted-foreground">MEA {v.mea.toLocaleString("de-DE")}</span>
                <Badge className={badge.cls + " hover:" + badge.cls}>{badge.label}</Badge>
                {v.urgent && <span className="text-xs font-medium text-amber-700">dringend</span>}
              </div>
              {v.followup_text && (
                <div className="text-xs text-muted-foreground">Folgeantwort: „{v.followup_text}“</div>
              )}
              {v.comment && <div className="text-xs italic text-muted-foreground">„{v.comment}“</div>}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ResultRow({ r, on, onToggle, votes }: { r: ItemResult; on: boolean; onToggle: (on: boolean) => void; votes: VoteDetail[] }) {
  const part = r.mea_ja + r.mea_neutral + r.mea_nein || 1;
  const jaP = Math.round((r.mea_ja / part) * 100);
  const neuP = Math.round((r.mea_neutral / part) * 100);
  const neiP = 100 - jaP - neuP;
  const cfg = EINSTUFUNG[r.einstufung];
  return (
    <Card><CardContent className="p-4 space-y-2">
      <h3 className="font-semibold">{r.title}</h3>
      <div className="text-sm text-muted-foreground">
        Zustimmung: <b>{r.jaPctMea}%</b> nach MEA · {r.head_ja} Ja / {r.head_neutral} Neutral / {r.head_nein} Nein
        {r.urgent_count > 0 && <> · {r.urgent_count}× „dringend"</>}
      </div>
      {!r.is_safety && (
        <div className="flex h-6 overflow-hidden rounded text-xs font-bold text-white">
          {jaP > 0 && <div className="flex items-center justify-center bg-emerald-600" style={{ width: `${jaP}%` }}>{jaP > 8 ? `${jaP}%` : ""}</div>}
          {neuP > 0 && <div className="flex items-center justify-center bg-muted-foreground" style={{ width: `${neuP}%` }}>{neuP > 8 ? `${neuP}%` : ""}</div>}
          {neiP > 0 && <div className="flex items-center justify-center bg-red-600" style={{ width: `${neiP}%` }}>{neiP > 8 ? `${neiP}%` : ""}</div>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Badge className={cfg.cls + " hover:" + cfg.cls}>{cfg.label}</Badge>
        <label className="flex items-center gap-2 text-sm font-medium">
          Auf Tagesordnung <Switch checked={on} onCheckedChange={onToggle} />
        </label>
      </div>
      {votes.length > 0 && <VoteList votes={votes} />}
    </CardContent></Card>
  );
}
