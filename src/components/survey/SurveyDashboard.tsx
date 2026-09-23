import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Auswertung, Einstufung, VoteDetail, VerteilungsZeile,
  ART_LABEL, auswerten, useSurveyAuswertung, willAntwort,
} from "@/hooks/useSurvey";
import { AdminSurvey, useUpdateSurvey } from "@/hooks/useSurveysAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

/**
 * Ergebnisse einer Umfrage (Verwaltung).
 *
 * Jede Fragenart wird so dargestellt, wie sie gestellt wurde: Balken bei
 * Auswahlfragen, Durchschnitt und Verteilung bei der Skala, Antwortkarten bei
 * Freitext. Nur bei der Art „Maßnahme" gibt es die Einstufung und den Schalter
 * „Auf Tagesordnung".
 *
 * Ob nach Köpfen oder nach Miteigentumsanteilen gerechnet wird, steht oben und
 * wird an der Umfrage gespeichert.
 */

const EINSTUFUNG: Record<Einstufung, { label: string; cls: string; defaultOn: boolean }> = {
  pflicht:         { label: "Pflicht / Sicherheit – kommt auf TO", cls: "bg-red-100 text-red-700", defaultOn: true },
  antrag:          { label: "Hohe Zustimmung – Beschlussantrag",   cls: "bg-emerald-100 text-emerald-700", defaultOn: true },
  diskussion:      { label: "Mittlere Zustimmung – Diskussionspunkt", cls: "bg-amber-100 text-amber-800", defaultOn: true },
  zurueckgestellt: { label: "Geringe Zustimmung – zurückgestellt",  cls: "bg-muted text-muted-foreground" , defaultOn: false },
};

export default function SurveyDashboard({ survey, agendaMap }: {
  survey: AdminSurvey;
  agendaMap: Record<string, boolean | null>; // item_id -> on_agenda (aus survey_items geladen)
}) {
  const qc = useQueryClient();
  const update = useUpdateSurvey();
  const nachMea = survey.weight_by_mea !== false;
  const { data, isLoading } = useSurveyAuswertung(survey.id, survey.building_id);

  const setAgenda = useMutation({
    mutationFn: async ({ itemId, on }: { itemId: string; on: boolean }) => {
      const { error } = await (supabase as any).from("survey_items").update({ on_agenda: on }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["survey-items", survey.id] }),
  });

  if (isLoading || !data) return <div className="p-6 text-muted-foreground">Ergebnisse werden geladen …</div>;

  const auswertungen: Auswertung[] = data.items
    .filter((it) => willAntwort(it) || it.kind === "massnahme")
    .map((it) => auswerten(it, data.proPunkt[it.id] ?? [], nachMea));

  const massnahmen = auswertungen.filter((a) => a.art === "massnahme") as Extract<Auswertung, { art: "massnahme" }>[];
  const onCount = massnahmen.filter((a) => agendaMap[a.item.id] ?? EINSTUFUNG[a.einstufung].defaultOn).length;

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
        <div>
          <Label>Nach Miteigentumsanteilen gewichten</Label>
          <p className="text-xs text-muted-foreground">
            {nachMea
              ? "Große Einheiten zählen mehr — passend für Maßnahmen und Beschlüsse."
              : "Jede Stimme zählt gleich — passend für allgemeine Umfragen."}
          </p>
        </div>
        <Switch checked={nachMea}
          onCheckedChange={(v) => update.mutate({ id: survey.id, patch: { weight_by_mea: v } })} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi value={nachMea ? `${data.beteiligungPct}%` : String(data.teilnehmendeKoepfe)}
          label={nachMea ? "Beteiligung (nach MEA)" : "Teilnehmer"} />
        <Kpi value={massnahmen.length ? `${onCount} / ${massnahmen.length}` : "—"} label="Punkte auf Tagesordnung" />
        <Kpi value={data.totalMea.toLocaleString("de-DE")} label="Gesamt-MEA" />
      </div>

      {auswertungen.length === 0 && (
        <Card><CardContent className="p-6 text-muted-foreground text-sm">
          Noch keine Punkte, die eine Antwort erwarten.
        </CardContent></Card>
      )}

      {auswertungen.map((a) => (
        <Card key={a.item.id}><CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-semibold">{a.item.title}</h3>
            <span className="text-xs text-muted-foreground">
              {ART_LABEL[a.item.kind] ?? a.item.kind} · {a.teilnehmer} Antwort(en)
            </span>
          </div>

          {a.art === "massnahme" && (
            <MassnahmeBlock a={a} nachMea={nachMea}
              on={agendaMap[a.item.id] ?? EINSTUFUNG[a.einstufung].defaultOn}
              onToggle={(on) => setAgenda.mutate({ itemId: a.item.id, on })} />
          )}

          {a.art === "verteilung" && <Balken zeilen={a.zeilen} nachMea={nachMea} />}

          {a.art === "skala" && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-primary">{a.schnitt.toLocaleString("de-DE")}</span>
                <span className="text-sm text-muted-foreground">im Schnitt (1 bis {a.item.scale_max ?? 5})</span>
              </div>
              <Balken zeilen={a.zeilen} nachMea={nachMea} />
            </div>
          )}

          {a.art === "text" && (
            <div className="space-y-2">
              {a.antworten.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Antworten.</p>}
              {a.antworten.map((v) => (
                <div key={v.contact_id} className="rounded-lg bg-muted/40 p-3 text-sm">
                  <div className="whitespace-pre-line">{v.text_answer}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {v.name}{v.unit_number ? ` · Einheit ${v.unit_number}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {a.art !== "text" && a.stimmen.length > 0 && (
            <VoteList votes={a.stimmen} auswertung={a} />
          )}
        </CardContent></Card>
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

function Balken({ zeilen, nachMea }: { zeilen: VerteilungsZeile[]; nachMea: boolean }) {
  if (!zeilen.length) return <p className="text-sm text-muted-foreground">Noch keine Antworten.</p>;
  return (
    <div className="space-y-2">
      {zeilen.map((z, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-44 shrink-0 truncate text-sm" title={z.label}>{z.label}</span>
          <span className="h-5 flex-1 overflow-hidden rounded bg-muted">
            <span className="block h-5 rounded bg-primary" style={{ width: `${z.pct}%` }} />
          </span>
          <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
            {z.koepfe}{nachMea ? ` · ${z.mea.toLocaleString("de-DE")} MEA` : ""} · {z.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

function MassnahmeBlock({ a, nachMea, on, onToggle }: {
  a: Extract<Auswertung, { art: "massnahme" }>;
  nachMea: boolean;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  const cfg = EINSTUFUNG[a.einstufung];
  return (
    <>
      <div className="text-sm text-muted-foreground">
        Zustimmung: <b>{a.jaPct}%</b> {nachMea ? "nach MEA" : "nach Köpfen"} · {a.head_ja} Ja / {a.head_neutral} Neutral / {a.head_nein} Nein
        {a.urgent_count > 0 && <> · {a.urgent_count}× „dringend"</>}
      </div>
      {!a.item.is_safety && (
        <div className="flex h-6 overflow-hidden rounded text-xs font-bold text-white">
          {a.jaPct > 0 && <div className="flex items-center justify-center bg-emerald-600" style={{ width: `${a.jaPct}%` }}>{a.jaPct > 8 ? `${a.jaPct}%` : ""}</div>}
          {a.neutralPct > 0 && <div className="flex items-center justify-center bg-muted-foreground" style={{ width: `${a.neutralPct}%` }}>{a.neutralPct > 8 ? `${a.neutralPct}%` : ""}</div>}
          {a.neinPct > 0 && <div className="flex items-center justify-center bg-red-600" style={{ width: `${a.neinPct}%` }}>{a.neinPct > 8 ? `${a.neinPct}%` : ""}</div>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Badge className={cfg.cls + " hover:" + cfg.cls}>{cfg.label}</Badge>
        <label className="flex items-center gap-2 text-sm font-medium">
          Auf Tagesordnung <Switch checked={on} onCheckedChange={onToggle} />
        </label>
      </div>
    </>
  );
}

const CHOICE_BADGE: Record<string, { label: string; cls: string }> = {
  ja: { label: "Ja", cls: "bg-emerald-100 text-emerald-700" },
  neutral: { label: "Neutral", cls: "bg-muted text-muted-foreground" },
  nein: { label: "Nein", cls: "bg-red-100 text-red-700" },
};

/** Wie hat diese Person geantwortet — passend zur Art des Punktes. */
function einzelAntwort(v: VoteDetail, a: Auswertung): string {
  const it = a.item;
  switch (it.kind) {
    case "einfachauswahl":
    case "mehrfachauswahl": {
      const opts = it.answer_options ?? [];
      const gewaehlt = (v.option_indexes ?? []).map((i) => opts[i]).filter(Boolean);
      return gewaehlt.join(", ") || "—";
    }
    case "skala": return v.scale_value ? `${v.scale_value} von ${it.scale_max ?? 5}` : "—";
    case "datum": return v.date_answer ? new Date(v.date_answer).toLocaleDateString("de-DE") : "—";
    default: return "—";
  }
}

function VoteList({ votes, auswertung }: { votes: VoteDetail[]; auswertung: Auswertung }) {
  const istMassnahme = auswertung.art === "massnahme";
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
        Einzelstimmen anzeigen ({votes.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 border-t pt-2">
        {votes.map((v) => {
          const badge = CHOICE_BADGE[v.choice ?? ""] ?? { label: einzelAntwort(v, auswertung), cls: "bg-muted text-muted-foreground" };
          return (
            <div key={v.contact_id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{v.name}</span>
                {v.unit_number && <span className="text-xs text-muted-foreground">Einheit {v.unit_number}</span>}
                <span className="text-xs text-muted-foreground">MEA {v.mea.toLocaleString("de-DE")}</span>
                <Badge className={badge.cls + " hover:" + badge.cls}>{badge.label}</Badge>
                {istMassnahme && v.urgent && <span className="text-xs font-medium text-amber-700">dringend</span>}
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
