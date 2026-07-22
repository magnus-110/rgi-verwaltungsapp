import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerSurvey, useSaveVote, SurveyChoice, OwnerVote } from "@/hooks/useSurvey";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ShieldAlert, ThumbsUp, Minus, ThumbsDown, CheckCircle2, ChevronDown } from "lucide-react";

/** Kosten-Skala als lesbares Label. */
function costLabel(tier: string | null): string {
  if (!tier || tier === "offen") return "Kosten offen";
  const words: Record<number, string> = { 1: "günstig", 2: "mittel", 3: "groß", 4: "sehr groß" };
  const parts = tier.split("–").map((n) => parseInt(n, 10));
  const hi = parts[parts.length - 1];
  const euro = "€".repeat(hi);
  return parts.length > 1 ? `${euro} · ${words[parts[0]]} bis ${words[hi]}` : `${euro} · ${words[hi]}`;
}

const AMPEL: { key: SurveyChoice; label: string; sub: string; Icon: any; cls: string }[] = [
  { key: "ja", label: "Ja", sub: "finde ich sinnvoll", Icon: ThumbsUp, cls: "data-[on=true]:border-emerald-500 data-[on=true]:bg-emerald-50" },
  { key: "neutral", label: "Neutral", sub: "ist mir egal", Icon: Minus, cls: "data-[on=true]:border-muted-foreground data-[on=true]:bg-muted" },
  { key: "nein", label: "Nein", sub: "aktuell nicht nötig", Icon: ThumbsDown, cls: "data-[on=true]:border-red-500 data-[on=true]:bg-red-50" },
];

export default function SurveyRunner() {
  const { profile } = useAuth();
  const { data, isLoading } = useOwnerSurvey(profile?.user_id);
  const save = useSaveVote(data?.survey?.id ?? "", profile?.user_id);

  // lokaler Antwort-Zwischenspeicher (item_id -> Antwort)
  const [local, setLocal] = useState<Record<string, OwnerVote>>({});
  const [step, setStep] = useState(0); // 0 Willkommen, 1..n Themen, n+1 Zusammenfassung, n+2 fertig

  const items = data?.items ?? [];
  const total = items.length;

  // gespeicherte Stimmen in den lokalen State übernehmen (einmalig)
  useMemo(() => {
    if (!data) return;
    const map: Record<string, OwnerVote> = {};
    data.votes.forEach((v) => (map[v.item_id] = v));
    setLocal((prev) => ({ ...map, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.survey?.id]);

  if (isLoading) return <div className="p-6 text-muted-foreground">Umfrage wird geladen …</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Aktuell läuft keine Umfrage für Ihre Wohnanlage.</div>;

  const setAnswer = (itemId: string, patch: Partial<OwnerVote>) =>
    setLocal((p) => ({ ...p, [itemId]: { ...(p[itemId] ?? { item_id: itemId, choice: null, followup_choice: null, urgent: false, comment: null }), ...patch, item_id: itemId } }));

  const persist = (itemId: string) => {
    const a = local[itemId];
    if (!a) return;
    save.mutate({ ...a, survey_id: data.survey.id });
  };

  const goNext = (fromItemId?: string) => { if (fromItemId) persist(fromItemId); setStep((s) => s + 1); window.scrollTo(0, 0); };
  const goPrev = () => { setStep((s) => Math.max(0, s - 1)); window.scrollTo(0, 0); };
  const jumpTo = (s: number) => { setStep(s); window.scrollTo(0, 0); };

  const pct = step === 0 ? 4 : step <= total ? Math.round((step / (total + 1)) * 100) : 100;

  // -------- Willkommen --------
  if (step === 0) {
    return (
      <Shell survey={data.survey} ownerMea={data.ownerMea} pct={pct} label="Willkommen">
        <Card><CardContent className="p-6 space-y-4">
          <h2 className="text-2xl font-bold">Ihre Meinung zählt</h2>
          <p className="text-lg">Wir möchten wissen, welche Verbesserungen Ihnen am wichtigsten sind.
            Sie sehen <b>{total} Themen</b> – bei jedem tippen Sie einfach auf <b>Ja</b>, <b>Neutral</b> oder <b>Nein</b>.</p>
          <ul className="list-disc pl-6 space-y-1 text-base">
            <li>Ein Thema pro Seite, mit Foto und kurzer Erklärung.</li>
            <li>Sie können jederzeit pausieren und später weitermachen.</li>
            <li>Am Ende sehen Sie alles noch einmal und können es ändern.</li>
          </ul>
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
      <Shell survey={data.survey} ownerMea={data.ownerMea} pct={100} label="Übersicht">
        <Card><CardContent className="p-6 space-y-2">
          <h2 className="text-2xl font-bold mb-2">Ihre Antworten</h2>
          {items.map((it, i) => {
            const a = local[it.id];
            const lbl = it.is_safety ? "wird umgesetzt" : a?.choice === "ja" ? "Ja" : a?.choice === "neutral" ? "Neutral" : a?.choice === "nein" ? "Nein" : "—";
            return (
              <div key={it.id} className="flex items-center justify-between border-b py-3">
                <span className="font-medium">{i + 1}. {it.title}{a?.urgent ? " ⚠" : ""}</span>
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
      <Shell survey={data.survey} ownerMea={data.ownerMea} pct={100} label="Fertig">
        <Card><CardContent className="p-8 text-center space-y-4">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
          <h2 className="text-2xl font-bold">Vielen Dank für Ihre Teilnahme!</h2>
          <p className="text-lg">Ihre Rückmeldung hilft uns, die nächste Eigentümerversammlung vorzubereiten.
            Wir werten alle Antworten aus und senden Ihnen <b>vor der Versammlung eine Übersicht</b>, welche Themen priorisiert wurden.</p>
          <p className="text-base text-muted-foreground">Bitte beachten Sie: Auch danach können Sie <b>jederzeit eigene Punkte
            für die Tagesordnung einreichen</b> – Ihr Antragsrecht als Eigentümer (§ 24 Abs. 2 WEG) bleibt selbstverständlich bestehen.</p>
        </CardContent></Card>
      </Shell>
    );
  }

  // -------- Themenkarte --------
  const it = items[step - 1];
  const a = local[it.id] ?? { item_id: it.id, choice: null, followup_choice: null, urgent: false, comment: null };
  const img = it.images[0];

  return (
    <Shell survey={data.survey} ownerMea={data.ownerMea} pct={pct} label={`Punkt ${step} von ${total}`}>
      <Card><CardContent className="p-6 space-y-4">
        {it.group_label && <div className="text-sm font-semibold uppercase tracking-wide text-primary">{it.group_label}</div>}
        <h2 className="text-2xl font-bold leading-tight">{it.title}</h2>

        {img?.url
          ? <img src={img.url} alt={it.title} className="w-full max-h-64 object-cover rounded-xl border" />
          : <div className="flex h-40 items-center justify-center rounded-xl border border-dashed bg-muted text-muted-foreground text-sm">Foto: {it.title}</div>}

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-amber-800 border-amber-300 bg-amber-50">{costLabel(it.cost_tier)}</Badge>
          {it.is_safety && <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><ShieldAlert className="mr-1 h-3.5 w-3.5" />Sicherheit</Badge>}
        </div>

        <p className="text-lg">{it.explanation}</p>

        {it.is_safety ? (
          // Sicherheits-/Pflichtpunkt: KEINE Abstimmung, nur Info + Kommentar
          <div className="rounded-lg border bg-red-50 p-4 text-red-900">
            Diese Maßnahme wird aus Gründen der <b>Verkehrssicherungspflicht ohnehin umgesetzt</b>.
            Sie können hier gerne einen Kommentar hinterlassen, aber nicht dagegen stimmen.
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

        <label className="flex items-center gap-3 text-base">
          <Checkbox checked={a.urgent} onCheckedChange={(v) => setAnswer(it.id, { urgent: !!v })} /> Besonders dringend
        </label>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-primary text-sm font-medium">
            <ChevronDown className="h-4 w-4" /> Kommentar hinzufügen (freiwillig)
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Textarea className="mt-2" placeholder="Ihre Anmerkung …" value={a.comment ?? ""}
              onChange={(e) => setAnswer(it.id, { comment: e.target.value })} />
          </CollapsibleContent>
        </Collapsible>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={goPrev}>← Zurück</Button>
          <Button size="lg" className="flex-1"
            disabled={!it.is_safety && !a.choice}
            onClick={() => goNext(it.id)}>Weiter →</Button>
        </div>
      </CardContent></Card>
    </Shell>
  );
}

// ---- Rahmen (Kopf, Eigentümer-Badge, Fortschritt) ----
function Shell({ survey, ownerMea, pct, label, children }: any) {
  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Was sollen wir als Nächstes anpacken?</h1>
        <p className="text-muted-foreground">{survey.title} · {survey.buildings?.name}</p>
      </div>
      <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3 text-sm">
        <span>Angemeldet als Eigentümer</span>
        <span className="text-muted-foreground">Ihr Stimmgewicht: <b className="text-primary">{ownerMea}</b> MEA</span>
      </div>
      <Progress value={pct} />
      <p className="text-center text-sm text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
