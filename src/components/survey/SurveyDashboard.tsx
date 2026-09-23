import { useMemo, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Auswertung, Einstufung, VoteDetail, VerteilungsZeile,
  auswerten, useSurveyAuswertung, willAntwort,
} from "@/hooks/useSurvey";
import { AdminSurvey, useUpdateSurvey } from "@/hooks/useSurveysAdmin";
import { ArtKennzeichen } from "@/components/survey/SurveyItemsEditor";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

/**
 * Die Ergebnisse einer Umfrage (Verwaltung).
 *
 * Oben der Beteiligungsring mit den wichtigsten Zahlen und dem Schalter für
 * die Gewichtung. Darunter je Frage eine Karte, die zur Art passt: Balken bei
 * Auswahlfragen, Durchschnitt bei der Skala, Antwortkarten bei Freitext.
 *
 * Nur Maßnahmen bekommen eine Einstufung und den Schalter „Auf Tagesordnung".
 */

const EINSTUFUNG: Record<Einstufung, { kurz: string; rat: string; rand: string; text: string; defaultOn: boolean }> = {
  pflicht:         { kurz: "Pflicht / Sicherheit", rat: "kommt auf die Tagesordnung", rand: "border-l-red-500",     text: "text-red-700",     defaultOn: true },
  antrag:          { kurz: "Hohe Zustimmung",      rat: "Vorschlag: Beschlussantrag", rand: "border-l-emerald-600", text: "text-emerald-700", defaultOn: true },
  diskussion:      { kurz: "Mittlere Zustimmung",  rat: "Vorschlag: Diskussionspunkt", rand: "border-l-amber-500",  text: "text-amber-700",   defaultOn: true },
  zurueckgestellt: { kurz: "Geringe Zustimmung",   rat: "Vorschlag: zurückstellen",   rand: "border-l-muted",       text: "text-muted-foreground", defaultOn: false },
};

type Filter = "alle" | "massnahmen" | "andere" | "agenda";
type Sortierung = "reihenfolge" | "zustimmung";

export default function SurveyDashboard({ survey, agendaMap }: {
  survey: AdminSurvey;
  agendaMap: Record<string, boolean | null>;
}) {
  const qc = useQueryClient();
  const update = useUpdateSurvey();
  const nachMea = survey.weight_by_mea !== false;
  const { data, isLoading } = useSurveyAuswertung(survey.id, survey.building_id);
  const [filter, setFilter] = useState<Filter>("alle");
  const [sortierung, setSortierung] = useState<Sortierung>("reihenfolge");

  const setAgenda = useMutation({
    mutationFn: async ({ itemId, on }: { itemId: string; on: boolean }) => {
      const { error } = await (supabase as any).from("survey_items").update({ on_agenda: on }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["survey-items", survey.id] }),
  });

  const alle: Auswertung[] = useMemo(() => {
    if (!data) return [];
    return data.items
      .filter((it) => willAntwort(it) || it.kind === "massnahme")
      .map((it) => auswerten(it, data.proPunkt[it.id] ?? [], nachMea));
  }, [data, nachMea]);

  const massnahmen = alle.filter((a) => a.art === "massnahme") as Extract<Auswertung, { art: "massnahme" }>[];
  const aufTagesordnung = (a: Extract<Auswertung, { art: "massnahme" }>) =>
    agendaMap[a.item.id] ?? EINSTUFUNG[a.einstufung].defaultOn;
  const onCount = massnahmen.filter(aufTagesordnung).length;

  const sichtbar = useMemo(() => {
    let liste = alle;
    if (filter === "massnahmen") liste = alle.filter((a) => a.art === "massnahme");
    if (filter === "andere") liste = alle.filter((a) => a.art !== "massnahme");
    if (filter === "agenda") liste = massnahmen.filter(aufTagesordnung);
    if (sortierung === "zustimmung") {
      liste = [...liste].sort((a, b) => {
        const wert = (x: Auswertung) => (x.art === "massnahme" ? x.jaPct : -1);
        return wert(b) - wert(a);
      });
    }
    return liste;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alle, filter, sortierung, agendaMap]);

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Ergebnisse werden geladen …</div>;

  const keineAntworten = data.teilnehmendeKoepfe === 0;

  return (
    <div className="space-y-4 pb-10">
      {/* ---------- Kopfband ---------- */}
      <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-card p-4 sm:p-5">
        <Ring pct={data.beteiligungPct} />

        <div className="min-w-[200px] flex-1">
          <p className="text-[13px] text-muted-foreground">
            {keineAntworten
              ? "Noch hat niemand geantwortet."
              : <><b className="text-foreground">{data.teilnehmendeKoepfe}{data.eigentuemerGesamt ? ` von ${data.eigentuemerGesamt}` : ""}</b> Eigentümern haben geantwortet</>}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
            <Zahl wert={String(alle.length)} label="Fragen" />
            <Zahl wert={String(massnahmen.length)} label="Maßnahmen" />
            <Zahl wert={String(onCount)} label="auf der Tagesordnung" betont />
            <Zahl wert={data.totalMea.toLocaleString("de-DE")} label="Gesamt-MEA" />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <div className="text-[13px] font-medium">Nach Miteigentumsanteilen</div>
            <div className="text-xs text-muted-foreground">
              {nachMea ? "große Einheiten zählen mehr" : "jede Stimme zählt gleich"}
            </div>
          </div>
          <Switch checked={nachMea}
            onCheckedChange={(v) => update.mutate({ id: survey.id, patch: { weight_by_mea: v } })} />
        </div>
      </div>

      {/* ---------- Filter ---------- */}
      {alle.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip an={filter === "alle"} onClick={() => setFilter("alle")}>Alle {alle.length}</Chip>
          {massnahmen.length > 0 && (
            <>
              <Chip an={filter === "massnahmen"} onClick={() => setFilter("massnahmen")}>Maßnahmen {massnahmen.length}</Chip>
              <Chip an={filter === "agenda"} onClick={() => setFilter("agenda")}>Auf Tagesordnung {onCount}</Chip>
            </>
          )}
          {alle.length - massnahmen.length > 0 && (
            <Chip an={filter === "andere"} onClick={() => setFilter("andere")}>Andere Fragen {alle.length - massnahmen.length}</Chip>
          )}
          <button type="button"
            onClick={() => setSortierung((s) => (s === "reihenfolge" ? "zustimmung" : "reihenfolge"))}
            className="ml-auto text-[12.5px] text-muted-foreground underline-offset-2 hover:underline">
            {sortierung === "reihenfolge" ? "Reihenfolge der Umfrage" : "Nach Zustimmung sortiert"}
          </button>
        </div>
      )}

      {/* ---------- Die Ergebnisse ---------- */}
      {alle.length === 0 && (
        <div className="rounded-xl border border-dashed p-7 text-sm text-muted-foreground">
          Diese Umfrage hat noch keine Frage, die eine Antwort erwartet.
        </div>
      )}

      <div className="space-y-2.5">
        {sichtbar.map((a) =>
          a.art === "massnahme" ? (
            <MassnahmeKarte key={a.item.id} a={a} nachMea={nachMea}
              on={aufTagesordnung(a)}
              onToggle={(on) => setAgenda.mutate({ itemId: a.item.id, on })} />
          ) : (
            <FrageKarte key={a.item.id} a={a} nachMea={nachMea} />
          ),
        )}
      </div>
    </div>
  );
}

/* ---------------- Bausteine ---------------- */

function Ring({ pct }: { pct: number }) {
  const r = 40;
  const umfang = 2 * Math.PI * r;
  const voll = (Math.min(100, Math.max(0, pct)) / 100) * umfang;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
      <circle cx="48" cy="48" r={r} fill="none" strokeWidth="12" className="stroke-muted" />
      <circle cx="48" cy="48" r={r} fill="none" strokeWidth="12" strokeLinecap="round"
        className="stroke-emerald-600" strokeDasharray={`${voll} ${umfang}`} transform="rotate(-90 48 48)" />
      <text x="48" y="45" textAnchor="middle" className="fill-foreground" fontSize="21" fontWeight="700">{pct} %</text>
      <text x="48" y="61" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Anteile</text>
    </svg>
  );
}

function Zahl({ wert, label, betont }: { wert: string; label: string; betont?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-bold ${betont ? "text-primary" : ""}`}>{wert}</div>
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Chip({ an, onClick, children }: { an: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12.5px] transition ${
        an ? "border-foreground bg-foreground font-semibold text-background" : "bg-card text-muted-foreground hover:border-primary/50"
      }`}>
      {children}
    </button>
  );
}

function KartenKopf({ a }: { a: Auswertung }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ArtKennzeichen kind={a.item.kind} />
      <h3 className="text-sm font-semibold">{a.item.title}</h3>
      <span className="text-[11.5px] text-muted-foreground">
        {a.teilnehmer} Antwort{a.teilnehmer === 1 ? "" : "en"}
      </span>
    </div>
  );
}

function Balken({ zeilen, nachMea }: { zeilen: VerteilungsZeile[]; nachMea: boolean }) {
  if (!zeilen.length) return <p className="text-[13px] text-muted-foreground">Noch keine Antworten.</p>;
  const spitze = Math.max(...zeilen.map((z) => z.pct));
  return (
    <div className="space-y-2">
      {zeilen.map((z, i) => {
        const fuehrt = z.pct === spitze && z.pct > 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className={`w-40 shrink-0 truncate text-[13px] sm:w-48 ${fuehrt ? "font-semibold" : ""}`} title={z.label}>{z.label}</span>
            <span className="h-6 min-w-[60px] flex-1 overflow-hidden rounded-md bg-muted">
              <span className={`block h-6 rounded-md ${fuehrt ? "bg-primary" : "bg-muted-foreground/25"}`}
                style={{ width: `${z.pct}%` }} />
            </span>
            <span className={`w-28 shrink-0 text-right text-[12.5px] ${fuehrt ? "text-foreground" : "text-muted-foreground"}`}>
              <b>{z.pct} %</b> · {z.koepfe}{nachMea ? ` / ${z.mea.toLocaleString("de-DE")} MEA` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MassnahmeKarte({ a, nachMea, on, onToggle }: {
  a: Extract<Auswertung, { art: "massnahme" }>;
  nachMea: boolean;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  const cfg = EINSTUFUNG[a.einstufung];
  return (
    <div className={`rounded-xl border border-l-4 bg-card p-4 sm:p-5 ${cfg.rand}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[260px] flex-1">
          <KartenKopf a={a} />

          {!a.item.is_safety && (
            <>
              <div className="mt-3 flex h-6 overflow-hidden rounded-md text-[11.5px] font-bold text-white">
                {a.jaPct > 0 && (
                  <div className="flex items-center bg-emerald-600 pl-2" style={{ width: `${a.jaPct}%` }}>
                    {a.jaPct > 16 ? `${a.jaPct} % Ja` : a.jaPct > 8 ? `${a.jaPct} %` : ""}
                  </div>
                )}
                {a.neutralPct > 0 && (
                  <div className="flex items-center justify-center bg-muted-foreground/60" style={{ width: `${a.neutralPct}%` }}>
                    {a.neutralPct > 8 ? `${a.neutralPct} %` : ""}
                  </div>
                )}
                {a.neinPct > 0 && (
                  <div className="flex items-center justify-center bg-red-500" style={{ width: `${a.neinPct}%` }}>
                    {a.neinPct > 8 ? `${a.neinPct} %` : ""}
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                {a.head_ja} Ja · {a.head_neutral} Neutral · {a.head_nein} Nein
                {nachMea ? " · gewichtet nach MEA" : " · nach Köpfen"}
                {a.urgent_count > 0 && ` · ${a.urgent_count}× „dringend"`}
              </p>
            </>
          )}

          {a.item.is_safety && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Pflichtpunkt — stand nicht zur Abstimmung.
            </p>
          )}

          {a.stimmen.length > 0 && <Einzelstimmen votes={a.stimmen} auswertung={a} />}
        </div>

        <div className="w-48 shrink-0 sm:text-right">
          <p className={`text-[12.5px] font-semibold ${cfg.text}`}>{cfg.kurz}</p>
          <p className="text-[11.5px] text-muted-foreground">{cfg.rat}</p>
          <label className={`mt-2.5 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] ${on ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
            Auf Tagesordnung
            <Switch checked={on} onCheckedChange={onToggle} />
          </label>
        </div>
      </div>
    </div>
  );
}

function FrageKarte({ a, nachMea }: { a: Auswertung; nachMea: boolean }) {
  const [alleZeigen, setAlleZeigen] = useState(false);
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <KartenKopf a={a} />
      <div className="mt-3">
        {a.art === "verteilung" && <Balken zeilen={a.zeilen} nachMea={nachMea} />}

        {a.art === "skala" && (
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-3xl font-bold leading-none">{a.schnitt.toLocaleString("de-DE")}</div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">von {a.item.scale_max ?? 5} im Schnitt</div>
            </div>
            <div className="flex h-16 min-w-[180px] flex-1 items-end gap-1.5">
              {a.zeilen.map((z, i) => {
                const spitze = Math.max(...a.zeilen.map((x) => x.pct), 1);
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className={`w-full rounded-t ${z.pct === spitze && z.pct > 0 ? "bg-primary" : "bg-muted-foreground/25"}`}
                      style={{ height: `${Math.max(4, (z.pct / spitze) * 48)}px` }} />
                    <span className="text-[11px] text-muted-foreground">{z.label}</span>
                  </div>
                );
              })}
            </div>
            {(a.item.scale_min_label || a.item.scale_max_label) && (
              <p className="w-full text-[11.5px] text-muted-foreground">
                1 = {a.item.scale_min_label || "—"} · {a.item.scale_max ?? 5} = {a.item.scale_max_label || "—"}
              </p>
            )}
          </div>
        )}

        {a.art === "text" && (
          <div className="space-y-2">
            {a.antworten.length === 0 && <p className="text-[13px] text-muted-foreground">Noch keine Antworten.</p>}
            {(alleZeigen ? a.antworten : a.antworten.slice(0, 3)).map((v) => (
              <div key={v.contact_id} className="rounded-lg bg-muted/40 p-3">
                <p className="whitespace-pre-line text-[13px] leading-relaxed">{v.text_answer}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {v.name}{v.unit_number ? ` · Einheit ${v.unit_number}` : ""}
                </p>
              </div>
            ))}
            {a.antworten.length > 3 && (
              <button type="button" onClick={() => setAlleZeigen((x) => !x)} className="text-[12.5px] text-primary">
                {alleZeigen ? "weniger zeigen" : `alle ${a.antworten.length} Antworten zeigen`}
              </button>
            )}
          </div>
        )}
      </div>

      {a.art !== "text" && a.stimmen.length > 0 && <Einzelstimmen votes={a.stimmen} auswertung={a} />}
    </div>
  );
}

const CHOICE_BADGE: Record<string, { label: string; cls: string }> = {
  ja: { label: "Ja", cls: "bg-emerald-100 text-emerald-700" },
  neutral: { label: "Neutral", cls: "bg-muted text-muted-foreground" },
  nein: { label: "Nein", cls: "bg-red-100 text-red-700" },
};

/** Wie hat diese Person geantwortet — passend zur Art der Frage. */
function einzelAntwort(v: VoteDetail, a: Auswertung): string {
  const it = a.item;
  switch (it.kind) {
    case "einfachauswahl":
    case "mehrfachauswahl": {
      const opts = it.answer_options ?? [];
      return (v.option_indexes ?? []).map((i) => opts[i]).filter(Boolean).join(", ") || "—";
    }
    case "skala": return v.scale_value ? `${v.scale_value} von ${it.scale_max ?? 5}` : "—";
    case "datum": return v.date_answer ? new Date(v.date_answer).toLocaleDateString("de-DE") : "—";
    default: return "—";
  }
}

function Einzelstimmen({ votes, auswertung }: { votes: VoteDetail[]; auswertung: Auswertung }) {
  const istMassnahme = auswertung.art === "massnahme";
  return (
    <Collapsible className="mt-3">
      <CollapsibleTrigger className="group flex items-center gap-1 text-[11.5px] text-muted-foreground transition hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
        Einzelstimmen ({votes.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 border-t pt-2">
        {votes.map((v) => {
          const badge = CHOICE_BADGE[v.choice ?? ""] ?? { label: einzelAntwort(v, auswertung), cls: "bg-muted text-muted-foreground" };
          return (
            <div key={v.contact_id} className="text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{v.name}</span>
                {v.unit_number && <span className="text-[11px] text-muted-foreground">Einheit {v.unit_number}</span>}
                <span className="text-[11px] text-muted-foreground">MEA {v.mea.toLocaleString("de-DE")}</span>
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                {istMassnahme && v.urgent && <span className="text-[11px] font-medium text-amber-700">dringend</span>}
              </div>
              {v.followup_text && <div className="text-[11.5px] text-muted-foreground">Folgeantwort: „{v.followup_text}“</div>}
              {v.comment && <div className="text-[11.5px] italic text-muted-foreground">„{v.comment}“</div>}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
