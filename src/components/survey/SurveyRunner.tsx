import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useOwnerSurvey, useSaveVote, SurveyChoice, OwnerVote, SurveyItem,
  costTierSymbol, istBeantwortet, leereAntwort, logikWert, willAntwort,
} from "@/hooks/useSurvey";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ThumbsUp, Minus, ThumbsDown, CheckCircle2, ArrowLeft, Info, X, Check } from "lucide-react";

/**
 * Die Umfrage aus Sicht der Eigentümer — und zugleich die Vorschau in der
 * Verwaltung. Was gefragt wird, hängt an der Art des Punktes.
 */

const AMPEL: { key: SurveyChoice; label: string; sub: string; Icon: any; cls: string }[] = [
  { key: "ja", label: "Ja", sub: "finde ich sinnvoll", Icon: ThumbsUp, cls: "data-[on=true]:border-emerald-500 data-[on=true]:bg-emerald-50" },
  { key: "neutral", label: "Neutral", sub: "ist mir egal", Icon: Minus, cls: "data-[on=true]:border-muted-foreground data-[on=true]:bg-muted" },
  { key: "nein", label: "Nein", sub: "aktuell nicht nötig", Icon: ThumbsDown, cls: "data-[on=true]:border-red-500 data-[on=true]:bg-red-50" },
];

export default function SurveyRunner({ surveyId: propId }: { surveyId?: string } = {}) {
  const params = useParams();
  const navigate = useNavigate();
  const surveyId = propId ?? params.id;
  const { profile } = useAuth();
  const { data, isLoading } = useOwnerSurvey(surveyId, profile?.user_id);
  const save = useSaveVote(surveyId ?? "", profile?.user_id);

  const [local, setLocal] = useState<Record<string, OwnerVote>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => { document.getElementById("survey-top")?.scrollIntoView({ block: "start", inline: "nearest" }); }, [step]);

  useMemo(() => {
    if (!data) return;
    const map: Record<string, OwnerVote> = {};
    data.votes.forEach((v) => (map[v.item_id] = { ...leereAntwort(v.item_id), ...v }));
    setLocal((prev) => ({ ...map, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.survey?.id]);

  useEffect(() => {
    if (!surveyId) navigate("/weg-owner/umfragen", { replace: true });
  }, [surveyId, navigate]);

  if (isLoading) return <div className="p-6 text-muted-foreground">Umfrage wird geladen …</div>;
  if (!data) return (
    <div className="p-6 space-y-3">
      <p className="text-muted-foreground">Diese Umfrage ist aktuell nicht verfügbar.</p>
      <Button variant="secondary" onClick={() => navigate("/weg-owner/umfragen")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Zur Übersicht
      </Button>
    </div>
  );

  // Sichtbare Punkte ermitteln (Logik auswerten)
  const visibleItems = data.items.filter((it) => {
    if (!it.depends_on_item_id) return true;
    const eltern = data.items.find((x) => x.id === it.depends_on_item_id);
    if (!eltern) return true;
    return logikWert(eltern, local[eltern.id]) === it.depends_on_value;
  });
  const total = visibleItems.length;

  const antwortVon = (itemId: string) => local[itemId] ?? leereAntwort(itemId);

  const setAnswer = (itemId: string, patch: Partial<OwnerVote>, sofortSpeichern = false) => {
    const next: OwnerVote = { ...antwortVon(itemId), ...patch, item_id: itemId };
    setLocal((p) => ({ ...p, [itemId]: next }));
    if (sofortSpeichern) save.mutate({ ...next, survey_id: data.survey.id });
  };

  const persist = (itemId: string) => {
    const it = data.items.find((x) => x.id === itemId);
    if (!it || !willAntwort(it)) return;
    const a = local[itemId];
    if (!a) return;
    save.mutate({ ...a, survey_id: data.survey.id });
  };

  const goNext = (fromItemId?: string) => { if (fromItemId) persist(fromItemId); setStep((s) => s + 1); window.scrollTo(0, 0); };
  const goPrev = () => { setStep((s) => Math.max(0, s - 1)); window.scrollTo(0, 0); };
  const jumpTo = (s: number) => { setStep(s); window.scrollTo(0, 0); };

  const pct = step === 0 ? 4 : step <= total ? Math.round((step / (total + 1)) * 100) : 100;
  const s = data.survey;

  // -------- Willkommen --------
  if (step === 0) {
    return (
      <Shell survey={s} ownerMea={data.ownerMea} pct={pct} label="Willkommen">
        <Card><CardContent className="p-6 space-y-4">
          <h2 className="text-2xl font-bold">{s.welcome_title || "Ihre Meinung zählt"}</h2>
          <p className="text-lg whitespace-pre-line">
            {s.welcome_message || `Wir möchten Ihre Rückmeldung zu ${total} Punkten.`}
          </p>
          <div className="rounded-lg border bg-amber-50 p-4 text-sm text-amber-900">
            Diese Umfrage ist ein <b>Stimmungsbild</b> zur Vorbereitung der Eigentümerversammlung – sie ersetzt keinen Beschluss.
          </div>
          <Button size="lg" className="w-full text-lg" onClick={() => goNext()}>Los geht’s →</Button>
        </CardContent></Card>
      </Shell>
    );
  }

  // -------- Zusammenfassung --------
  if (step === total + 1) {
    return (
      <Shell survey={s} ownerMea={data.ownerMea} pct={100} label="Übersicht">
        <Card><CardContent className="p-6 space-y-2">
          <h2 className="text-2xl font-bold mb-2">Ihre Antworten</h2>
          {visibleItems.map((it, i) => (
            <div key={it.id} className="flex items-center justify-between border-b py-3 gap-3">
              <span className="font-medium min-w-0">{i + 1}. {it.title}</span>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="secondary" className="max-w-[220px] truncate">{antwortText(it, local[it.id])}</Badge>
                <Button variant="link" className="h-auto p-0" onClick={() => jumpTo(i + 1)}>ändern</Button>
              </div>
            </div>
          ))}
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => jumpTo(total)}>← Zurück</Button>
            <Button size="lg" className="flex-1" onClick={() => goNext()}>Absenden ✓</Button>
          </div>
        </CardContent></Card>
      </Shell>
    );
  }

  // -------- Fertig / Danke --------
  if (step >= total + 2) {
    return (
      <Shell survey={s} ownerMea={data.ownerMea} pct={100} label="Fertig">
        <Card><CardContent className="p-8 text-center space-y-4">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
          <h2 className="text-2xl font-bold">{s.end_title || "Vielen Dank für Ihre Teilnahme!"}</h2>
          <p className="text-lg whitespace-pre-line">
            {s.end_message || "Ihre Rückmeldung hilft uns, die nächste Eigentümerversammlung vorzubereiten."}
          </p>
          <div className="pt-2">
            <Button variant="secondary" onClick={() => navigate("/weg-owner/umfragen")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Zur Übersicht
            </Button>
          </div>
        </CardContent></Card>
      </Shell>
    );
  }

  // -------- Ein Punkt --------
  const it = visibleItems[step - 1];
  const a = antwortVon(it.id);
  const gewaehlt = (i: number) => (a.option_indexes ?? []).includes(i);
  const weiterGesperrt = it.is_required && willAntwort(it) && !istBeantwortet(it, a);

  return (
    <Shell survey={s} ownerMea={data.ownerMea} pct={pct} label={`Punkt ${step} von ${total}`}>
      <Card><CardContent className="p-6 space-y-4">
        {it.group_label && <div className="text-sm font-semibold uppercase tracking-wide text-primary">{it.group_label}</div>}
        <h2 className="text-2xl font-bold leading-tight">{it.title}</h2>

        {it.images.filter((im) => im.url).length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
            {it.images.filter((im) => im.url).map((im, k) => (
              <img key={k} src={im.url!} alt={it.title} onClick={() => setLightbox(im.url!)}
                className="h-56 w-auto flex-shrink-0 snap-start object-cover rounded-xl border cursor-zoom-in" />
            ))}
          </div>
        )}

        {it.kind === "massnahme" && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-amber-800 border-amber-300 bg-amber-50">{costTierSymbol(it.cost_tier)}</Badge>
            {it.is_safety && <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><ShieldAlert className="mr-1 h-3.5 w-3.5" />Sicherheit</Badge>}
          </div>
        )}

        {it.explanation && <p className="text-lg whitespace-pre-line">{it.explanation}</p>}

        {/* ---- Info ---- */}
        {it.kind === "info" && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5" />
            <span>Diese Seite dient nur der Information — bitte weiterblättern.</span>
          </div>
        )}

        {/* ---- Maßnahme ohne Abstimmung ---- */}
        {it.kind === "massnahme" && it.is_safety && (
          <div className="rounded-lg border bg-red-50 p-4 text-red-900 whitespace-pre-line">
            {s.safety_notice || "Diese Maßnahme wird aus Gründen der Verkehrssicherungspflicht ohnehin umgesetzt und steht daher nicht zur Abstimmung."}
          </div>
        )}

        {/* ---- Maßnahme mit Abstimmung ---- */}
        {it.kind === "massnahme" && !it.is_safety && (
          <>
            <p className="text-xl font-semibold">{it.cost_tier === "offen" ? "Soll die Verwaltung das weiter verfolgen?" : "Wie wichtig ist Ihnen das?"}</p>
            <div className="grid gap-3">
              {AMPEL.map(({ key, label, sub, Icon, cls }) => (
                <button key={key} data-on={a.choice === key}
                  onClick={() => {
                    const aus = a.choice === key;
                    setAnswer(it.id, {
                      choice: aus ? null : key,
                      followup_choice: aus || key !== "ja" ? null : a.followup_choice,
                    }, aus);
                  }}
                  className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left text-lg font-medium transition ${cls}`}>
                  <Icon className="h-7 w-7 shrink-0" />
                  <span>{label}<span className="block text-sm font-normal text-muted-foreground">{sub}</span></span>
                </button>
              ))}
            </div>

            {it.followup_question && a.choice === "ja" && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="font-semibold">{it.followup_question}</p>
                {(it.followup_options ?? []).map((opt, k) => (
                  <button key={k} onClick={() => setAnswer(it.id, { followup_choice: a.followup_choice === k ? null : k })}
                    className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left ${a.followup_choice === k ? "border-primary bg-primary/5" : ""}`}>
                    <span className={`h-4 w-4 rounded-full border-2 ${a.followup_choice === k ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                    {opt}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Kein Beschluss — nur ein Meinungsbild zur Priorisierung. Eine Umsetzung ist damit nicht zugesagt.
            </p>
          </>
        )}

        {/* ---- Einfachauswahl ---- */}
        {it.kind === "einfachauswahl" && (
          <div className="grid gap-3">
            {(it.answer_options ?? []).map((opt, k) => (
              <button key={k}
                onClick={() => setAnswer(it.id, { option_indexes: gewaehlt(k) ? [] : [k] }, gewaehlt(k))}
                className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left text-lg font-medium transition ${
                  gewaehlt(k) ? "border-primary bg-primary/5" : ""
                }`}>
                <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${gewaehlt(k) ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* ---- Mehrfachauswahl ---- */}
        {it.kind === "mehrfachauswahl" && (
          <>
            <p className="text-sm text-muted-foreground">Mehrere Antworten möglich.</p>
            <div className="grid gap-3">
              {(it.answer_options ?? []).map((opt, k) => (
                <button key={k}
                  onClick={() => {
                    const cur = a.option_indexes ?? [];
                    const next = gewaehlt(k) ? cur.filter((x) => x !== k) : [...cur, k].sort((x, y) => x - y);
                    setAnswer(it.id, { option_indexes: next });
                  }}
                  className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left text-lg font-medium transition ${
                    gewaehlt(k) ? "border-primary bg-primary/5" : ""
                  }`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${gewaehlt(k) ? "border-primary bg-primary text-white" : "border-muted-foreground"}`}>
                    {gewaehlt(k) && <Check className="h-3.5 w-3.5" />}
                  </span>
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---- Skala ---- */}
        {it.kind === "skala" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: it.scale_max ?? 5 }, (_, k) => k + 1).map((w) => (
                <button key={w}
                  onClick={() => setAnswer(it.id, { scale_value: a.scale_value === w ? null : w }, a.scale_value === w)}
                  className={`h-14 flex-1 min-w-[3rem] rounded-xl border-2 text-lg font-semibold transition ${
                    a.scale_value === w ? "border-primary bg-primary/5 text-primary" : ""
                  }`}>
                  {w}
                </button>
              ))}
            </div>
            {(it.scale_min_label || it.scale_max_label) && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{it.scale_min_label}</span><span>{it.scale_max_label}</span>
              </div>
            )}
          </div>
        )}

        {/* ---- Freitext ---- */}
        {it.kind === "freitext" && (
          <Textarea rows={5} value={a.text_answer ?? ""} placeholder="Ihre Antwort …"
            onChange={(e) => setAnswer(it.id, { text_answer: e.target.value })}
            onBlur={() => persist(it.id)} />
        )}

        {/* ---- Datum ---- */}
        {it.kind === "datum" && (
          <Input type="date" className="h-12 text-lg" value={a.date_answer ?? ""}
            onChange={(e) => setAnswer(it.id, { date_answer: e.target.value || null }, true)} />
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={goPrev}>← Zurück</Button>
          <Button size="lg" className="flex-1" disabled={weiterGesperrt} onClick={() => goNext(it.id)}>Weiter →</Button>
        </div>

        {lightbox && (
          <div onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 cursor-zoom-out">
            <img src={lightbox} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
          </div>
        )}
      </CardContent></Card>
    </Shell>
  );
}

/** Kurzfassung der eigenen Antwort für die Übersichtsseite. */
function antwortText(it: SurveyItem, v?: OwnerVote | null): string {
  if (it.kind === "info") return "gelesen";
  if (it.kind === "massnahme" && it.is_safety) return "wird umgesetzt";
  if (!v) return "—";
  switch (it.kind) {
    case "massnahme":
      return v.choice === "ja" ? "Ja" : v.choice === "neutral" ? "Neutral" : v.choice === "nein" ? "Nein" : "—";
    case "einfachauswahl":
    case "mehrfachauswahl": {
      const opts = it.answer_options ?? [];
      const gewaehlt = (v.option_indexes ?? []).map((i) => opts[i]).filter(Boolean);
      return gewaehlt.length ? gewaehlt.join(", ") : "—";
    }
    case "skala":
      return v.scale_value ? `${v.scale_value} von ${it.scale_max ?? 5}` : "—";
    case "freitext":
      return v.text_answer?.trim() ? v.text_answer.trim() : "—";
    case "datum":
      return v.date_answer ? new Date(v.date_answer).toLocaleDateString("de-DE") : "—";
    default:
      return "—";
  }
}

function Shell({ survey, ownerMea, pct, label, children }: { survey: any; ownerMea: number; pct: number; label: string; children: any }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isOwnerRoute = location.pathname.startsWith("/weg-owner/umfrage");
  return (
    <div id="survey-top" className="mx-auto w-full max-w-2xl overflow-x-hidden px-3 py-4 space-y-4">
      {isOwnerRoute && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => navigate("/weg-owner/umfragen")}>
            <X className="h-4 w-4 mr-1" /> Schließen
          </Button>
        </div>
      )}
      <div className="text-center">
        <h1 className="text-2xl font-bold">{survey.title}</h1>
        <p className="text-muted-foreground">{survey.buildings?.name}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
        <span>Angemeldet als Eigentümer</span>
        <span className="text-muted-foreground">Ihr Stimmgewicht: <b className="text-primary">{ownerMea}</b> MEA</span>
      </div>
      <Progress value={pct} />
      <p className="text-center text-sm text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
