import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerSurvey, useSaveVote, SurveyChoice, OwnerVote, SurveyItem, costTierSymbol } from "@/hooks/useSurvey";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ShieldAlert, ThumbsUp, Minus, ThumbsDown, CheckCircle2, ChevronDown, ArrowLeft, Info } from "lucide-react";

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
    data.votes.forEach((v) => (map[v.item_id] = v));
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

  // Sichtbare Items ermitteln (Abhängigkeiten auswerten)
  const visibleItems = data.items.filter((it) => {
    if (!it.depends_on_item_id) return true;
    const dep = local[it.depends_on_item_id];
    return dep?.choice === it.depends_on_choice;
  });
  const total = visibleItems.length;

  const setAnswer = (itemId: string, patch: Partial<OwnerVote>) =>
    setLocal((p) => ({
      ...p,
      [itemId]: {
        ...(p[itemId] ?? { item_id: itemId, choice: null, followup_choice: null, urgent: false, comment: null }),
        ...patch,
        item_id: itemId,
      },
    }));

  const persist = (itemId: string) => {
    const it = data.items.find((x) => x.id === itemId);
    if (!it || it.item_type === "info") return;
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
            {s.welcome_message || `Wir möchten wissen, welche Verbesserungen Ihnen am wichtigsten sind. Sie sehen ${total} Themen – bei jedem tippen Sie einfach auf Ja, Neutral oder Nein.`}
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
          {visibleItems.map((it, i) => {
            const a = local[it.id];
            const lbl = it.item_type === "info"
              ? "gelesen"
              : it.is_safety ? "wird umgesetzt"
              : a?.choice === "ja" ? "Ja" : a?.choice === "neutral" ? "Neutral" : a?.choice === "nein" ? "Nein" : "—";
            return (
              <div key={it.id} className="flex items-center justify-between border-b py-3">
                <span className="font-medium">{i + 1}. {it.title}</span>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{lbl}</Badge>
                  <Button variant="link" className="h-auto p-0" onClick={() => jumpTo(i + 1)}>ändern</Button>
                </div>
              </div>
            );
          })}
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

  // -------- Themenkarte / Info --------
  const it = visibleItems[step - 1];
  const a = local[it.id] ?? { item_id: it.id, choice: null, followup_choice: null, urgent: false, comment: null };

  return (
    <Shell survey={s} ownerMea={data.ownerMea} pct={pct} label={`Punkt ${step} von ${total}`}>
      <Card><CardContent className="p-6 space-y-4">
        {it.group_label && <div className="text-sm font-semibold uppercase tracking-wide text-primary">{it.group_label}</div>}
        <h2 className="text-2xl font-bold leading-tight">{it.title}</h2>

        {it.images.filter((im) => im.url).length > 0
          ? <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
              {it.images.filter((im) => im.url).map((im, k) => (
                <img key={k} src={im.url!} alt={it.title} onClick={() => setLightbox(im.url!)} className="h-56 w-auto flex-shrink-0 snap-start object-cover rounded-xl border cursor-zoom-in" />
              ))}
            </div>
          : it.item_type === "question"
            ? <div className="flex h-40 items-center justify-center rounded-xl border border-dashed bg-muted text-muted-foreground text-sm">Foto: {it.title}</div>
            : null}

        {it.item_type === "question" && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-amber-800 border-amber-300 bg-amber-50">{costTierSymbol(it.cost_tier)}</Badge>
            {it.is_safety && <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><ShieldAlert className="mr-1 h-3.5 w-3.5" />Sicherheit</Badge>}
          </div>
        )}

        <p className="text-lg whitespace-pre-line">{it.explanation}</p>

        {it.item_type === "info" ? (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5" />
            <span>Diese Seite dient nur der Information — bitte weiterblättern.</span>
          </div>
        ) : it.is_safety ? (
          <div className="rounded-lg border bg-red-50 p-4 text-red-900 whitespace-pre-line">
            {s.safety_notice || "Diese Maßnahme wird aus Gründen der Verkehrssicherungspflicht ohnehin umgesetzt und steht daher nicht zur Abstimmung."}
          </div>
        ) : (
          <>
            <p className="text-xl font-semibold">{it.cost_tier === "offen" ? "Soll die Verwaltung das weiter verfolgen?" : "Wie wichtig ist Ihnen das?"}</p>
            <div className="grid gap-3">
              {AMPEL.map(({ key, label, sub, Icon, cls }) => (
                <button key={key} data-on={a.choice === key}
                  onClick={() => setAnswer(it.id, { choice: key })}
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
                  <button key={k} onClick={() => setAnswer(it.id, { followup_choice: k })}
                    className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left ${a.followup_choice === k ? "border-primary bg-primary/5" : ""}`}>
                    <span className={`h-4 w-4 rounded-full border-2 ${a.followup_choice === k ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </>
        )}


        <div className="flex gap-3 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={goPrev}>← Zurück</Button>
          <Button size="lg" className="flex-1"
            disabled={it.item_type === "question" && !it.is_safety && !a.choice}
            onClick={() => goNext(it.id)}>Weiter →</Button>
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

function Shell({ survey, ownerMea, pct, label, children }: { survey: any; ownerMea: number; pct: number; label: string; children: any }) {
  return (
    <div id="survey-top" className="mx-auto w-full max-w-2xl overflow-x-hidden px-3 py-4 space-y-4">
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
