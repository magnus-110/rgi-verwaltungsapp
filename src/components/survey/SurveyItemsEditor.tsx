import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, ShieldAlert, ChevronUp, ChevronDown, Loader2, Copy, X, FileInput } from "lucide-react";
import {
  ARTEN_MIT_LOGIK, ART_LABEL, FRAGENARTEN, JA_NEUTRAL_NEIN,
  SurveyKind, costTierSymbol,
} from "@/hooks/useSurvey";
import { useAdminSurveys } from "@/hooks/useSurveysAdmin";
import SurveyItemImages from "@/components/survey/SurveyItemImages";

/**
 * Die Fragen einer Umfrage (nur Verwaltung).
 *
 * Eine Zeile je Frage: Reihenfolge, Art, Text — und rechts daneben die Fotos
 * dieser Frage. Einen eigenen Reiter „Bilder" gibt es deshalb nicht mehr.
 *
 * Im Dialog wird links die Art gewählt, rechts erscheinen nur die Felder, die
 * zu dieser Art gehören. Kosten und Pflicht-Kennzeichen gibt es nur bei der
 * Art „Maßnahme".
 */

const COST_OPTIONS = [
  { value: "1", label: "€" },
  { value: "2", label: "€€" },
  { value: "3", label: "€€€" },
  { value: "4", label: "€€€€" },
  { value: "offen", label: "€ offen" },
];

const SKALA_OPTIONS = [3, 4, 5, 7, 10];

/** Ruhige, aber unterscheidbare Farben je Art. */
export const ART_FARBE: Record<SurveyKind, string> = {
  massnahme: "bg-orange-100 text-orange-800",
  einfachauswahl: "bg-sky-100 text-sky-800",
  mehrfachauswahl: "bg-indigo-100 text-indigo-800",
  skala: "bg-violet-100 text-violet-800",
  freitext: "bg-emerald-100 text-emerald-800",
  datum: "bg-amber-100 text-amber-800",
  info: "bg-muted text-muted-foreground",
};

export function ArtKennzeichen({ kind }: { kind: SurveyKind }) {
  return (
    <span className={`inline-block shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${ART_FARBE[kind] ?? "bg-muted text-muted-foreground"}`}>
      {ART_LABEL[kind] ?? kind}
    </span>
  );
}

interface Item {
  id: string;
  survey_id: string;
  position: number;
  group_label: string | null;
  title: string;
  explanation: string;
  kind: SurveyKind;
  answer_options: string[] | null;
  scale_max: number | null;
  scale_min_label: string | null;
  scale_max_label: string | null;
  is_required: boolean;
  cost_tier: string | null;
  is_safety: boolean;
  depends_on_item_id: string | null;
  depends_on_value: string | null;
  followup_question: string | null;
  followup_options: string[] | null;
}

interface FormState {
  id?: string;
  position: number;
  kind: SurveyKind;
  group_label: string;
  title: string;
  explanation: string;
  answer_options: string[];
  scale_max: number;
  scale_min_label: string;
  scale_max_label: string;
  is_required: boolean;
  cost_tier: string;
  is_safety: boolean;
  followup_question: string;
  followup_options: string;
  depends_on_item_id: string;
  depends_on_value: string;
}

const emptyForm = (position: number, kind: SurveyKind): FormState => ({
  position, kind,
  group_label: "", title: "", explanation: "",
  answer_options: kind === "einfachauswahl" || kind === "mehrfachauswahl" ? ["", ""] : [],
  scale_max: 5, scale_min_label: "", scale_max_label: "",
  is_required: kind !== "freitext",
  cost_tier: "2", is_safety: false,
  followup_question: "", followup_options: "",
  depends_on_item_id: "", depends_on_value: "",
});

const ART_HINWEIS: Record<SurveyKind, string> = FRAGENARTEN.reduce(
  (acc, a) => ({ ...acc, [a.kind]: a.hint }),
  {} as Record<SurveyKind, string>,
);

export default function SurveyItemsEditor({ surveyId, buildingId }: { surveyId: string; buildingId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [uebernahmeOffen, setUebernahmeOffen] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["survey-items-editor", surveyId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("survey_items")
        .select("*")
        .eq("survey_id", surveyId)
        .order("position", { ascending: true });
      return (data || []).map((r: any) => ({
        ...r,
        kind: r.kind ?? (r.item_type === "info" ? "info" : "massnahme"),
        is_required: r.is_required ?? true,
        depends_on_value: r.depends_on_value ?? r.depends_on_choice ?? null,
      })) as Item[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["survey-items-editor", surveyId] });
    qc.invalidateQueries({ queryKey: ["survey-items", surveyId] });
    qc.invalidateQueries({ queryKey: ["survey-item-images", surveyId] });
    qc.invalidateQueries({ queryKey: ["survey-auswertung", surveyId] });
    qc.invalidateQueries({ queryKey: ["owner-survey"] });
    qc.invalidateQueries({ queryKey: ["admin-surveys"] });
  };

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const auswahl = f.kind === "einfachauswahl" || f.kind === "mehrfachauswahl";
      const optionen = f.answer_options.map((o) => o.trim()).filter(Boolean);
      const payload: any = {
        survey_id: surveyId,
        position: f.position,
        kind: f.kind,
        group_label: f.group_label.trim() || null,
        title: f.title.trim(),
        explanation: f.explanation.trim(),
        answer_options: auswahl ? optionen : null,
        scale_max: f.kind === "skala" ? f.scale_max : null,
        scale_min_label: f.kind === "skala" ? (f.scale_min_label.trim() || null) : null,
        scale_max_label: f.kind === "skala" ? (f.scale_max_label.trim() || null) : null,
        is_required: f.kind === "info" ? false : f.is_required,
        cost_tier: f.kind === "massnahme" ? f.cost_tier : null,
        is_safety: f.kind === "massnahme" ? f.is_safety : false,
        followup_question: f.kind === "massnahme" ? (f.followup_question.trim() || null) : null,
        followup_options:
          f.kind === "massnahme" && f.followup_options.split("\n").map((s) => s.trim()).filter(Boolean).length
            ? f.followup_options.split("\n").map((s) => s.trim()).filter(Boolean)
            : null,
        depends_on_item_id: f.depends_on_item_id || null,
        depends_on_value: f.depends_on_item_id && f.depends_on_value ? f.depends_on_value : null,
      };
      if (f.id) {
        const { error } = await (supabase as any).from("survey_items").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("survey_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { setForm(null); refresh(); },
    onError: (e: any) => alert("Speichern fehlgeschlagen: " + (e?.message ?? e)),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("survey_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => alert("Löschen fehlgeschlagen: " + (e?.message ?? e)),
  });

  const swap = useMutation({
    mutationFn: async ({ a, b }: { a: Item; b: Item }) => {
      await (supabase as any).from("survey_items").update({ position: b.position }).eq("id", a.id);
      await (supabase as any).from("survey_items").update({ position: a.position }).eq("id", b.id);
    },
    onSuccess: refresh,
  });

  const duplicate = useMutation({
    mutationFn: async (it: Item) => {
      const { error } = await (supabase as any).from("survey_items").insert({
        survey_id: surveyId,
        position: (items[items.length - 1]?.position ?? 0) + 1,
        kind: it.kind,
        group_label: it.group_label,
        title: it.title + " (Kopie)",
        explanation: it.explanation,
        answer_options: it.answer_options,
        scale_max: it.scale_max,
        scale_min_label: it.scale_min_label,
        scale_max_label: it.scale_max_label,
        is_required: it.is_required,
        cost_tier: it.cost_tier,
        is_safety: it.is_safety,
        followup_question: it.followup_question,
        followup_options: it.followup_options,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  /** Alle Fragen einer anderen Umfrage hierher kopieren (ohne Antworten). */
  const uebernehmen = useMutation({
    mutationFn: async (quelleId: string) => {
      const { data: quelle } = await (supabase as any)
        .from("survey_items").select("*").eq("survey_id", quelleId).order("position");
      let pos = items[items.length - 1]?.position ?? 0;
      const idMap = new Map<string, string>();
      for (const it of (quelle || []) as any[]) {
        pos += 1;
        const { data: neu, error } = await (supabase as any).from("survey_items").insert({
          survey_id: surveyId,
          position: pos,
          kind: it.kind ?? (it.item_type === "info" ? "info" : "massnahme"),
          group_label: it.group_label,
          title: it.title,
          explanation: it.explanation,
          answer_options: it.answer_options,
          scale_max: it.scale_max,
          scale_min_label: it.scale_min_label,
          scale_max_label: it.scale_max_label,
          is_required: it.is_required ?? true,
          cost_tier: it.cost_tier,
          is_safety: it.is_safety,
          followup_question: it.followup_question,
          followup_options: it.followup_options,
        }).select("id").single();
        if (error) throw error;
        idMap.set(it.id, neu.id);
      }
      for (const it of (quelle || []) as any[]) {
        if (it.depends_on_item_id && idMap.has(it.depends_on_item_id)) {
          await (supabase as any).from("survey_items").update({
            depends_on_item_id: idMap.get(it.depends_on_item_id),
            depends_on_value: it.depends_on_value ?? it.depends_on_choice,
          }).eq("id", idMap.get(it.id));
        }
      }
    },
    onSuccess: () => { setUebernahmeOffen(false); refresh(); },
    onError: (e: any) => alert("Übernehmen fehlgeschlagen: " + (e?.message ?? e)),
  });

  const openEdit = (it: Item) =>
    setForm({
      id: it.id,
      position: it.position,
      kind: it.kind,
      group_label: it.group_label ?? "",
      title: it.title,
      explanation: it.explanation ?? "",
      answer_options: it.answer_options?.length ? [...it.answer_options] : ["", ""],
      scale_max: it.scale_max ?? 5,
      scale_min_label: it.scale_min_label ?? "",
      scale_max_label: it.scale_max_label ?? "",
      is_required: it.is_required ?? true,
      cost_tier: it.cost_tier ?? "2",
      is_safety: it.is_safety,
      followup_question: it.followup_question ?? "",
      followup_options: (it.followup_options ?? []).join("\n"),
      depends_on_item_id: it.depends_on_item_id ?? "",
      depends_on_value: it.depends_on_value ?? "",
    });

  const openNew = (kind: SurveyKind = "einfachauswahl") =>
    setForm(emptyForm((items[items.length - 1]?.position ?? 0) + 1, kind));

  /** Art wechseln, ohne das Geschriebene zu verlieren. */
  const setKind = (kind: SurveyKind) =>
    setForm((f) =>
      !f ? f : {
        ...f,
        kind,
        answer_options:
          (kind === "einfachauswahl" || kind === "mehrfachauswahl") && !f.answer_options.length
            ? ["", ""]
            : f.answer_options,
        is_required: kind === "freitext" ? false : f.is_required,
      },
    );

  const logikPunkte = items.filter((i) => ARTEN_MIT_LOGIK.includes(i.kind));
  const logikAuswahl = form?.id ? logikPunkte.filter((i) => i.id !== form.id) : logikPunkte;
  const logikEltern = logikAuswahl.find((i) => i.id === form?.depends_on_item_id);

  const werteFuerLogik = (eltern?: Item): { value: string; label: string }[] => {
    if (!eltern) return [];
    if (eltern.kind === "massnahme") {
      return [
        { value: "ja", label: "Antwort = Ja" },
        { value: "neutral", label: "Antwort = Neutral" },
        { value: "nein", label: "Antwort = Nein" },
      ];
    }
    return (eltern.answer_options ?? []).map((o, i) => ({ value: String(i), label: `Antwort = ${o}` }));
  };

  const beschreibeLogik = (it: Item) => {
    const eltern = items.find((x) => x.id === it.depends_on_item_id);
    if (!eltern) return "";
    const treffer = werteFuerLogik(eltern).find((w) => w.value === it.depends_on_value);
    return `nur wenn „${eltern.title}" ${treffer ? treffer.label.replace("Antwort = ", "= ") : "beantwortet"}`;
  };

  const auswahlArt = form?.kind === "einfachauswahl" || form?.kind === "mehrfachauswahl";

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Lädt …</div>;

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {items.length} Frage{items.length === 1 ? "" : "n"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setUebernahmeOffen(true)}>
              <FileInput className="mr-1 h-4 w-4" /> Übernehmen
            </Button>
            <Button size="sm" onClick={() => openNew()}>
              <Plus className="mr-1 h-4 w-4" /> Frage hinzufügen
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Noch keine Frage ---------- */}
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-7">
          <h3 className="text-base font-semibold">Noch keine Frage — womit soll es losgehen?</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Wählen Sie eine Art, dann öffnet sich gleich das Formular. Die Art lässt sich später jederzeit ändern.
          </p>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {FRAGENARTEN.map((a) => (
              <button key={a.kind} type="button" onClick={() => openNew(a.kind)}
                className={`rounded-lg border p-3 text-left transition hover:border-primary ${
                  a.kind === "massnahme" ? "border-orange-200 bg-orange-50/60" : "bg-background"
                }`}>
                <span className="block text-sm font-semibold">{a.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{a.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-5">
            <Button variant="outline" size="sm" onClick={() => setUebernahmeOffen(true)}>
              <FileInput className="mr-1 h-4 w-4" /> Fragen aus einer anderen Umfrage übernehmen
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Die Fragen ---------- */}
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={it.id} className={`flex items-start gap-3 rounded-xl border p-4 ${it.kind === "info" ? "bg-muted/30" : "bg-card"}`}>
            <div className="flex w-6 shrink-0 flex-col items-center pt-0.5">
              <button type="button" disabled={idx === 0} onClick={() => swap.mutate({ a: it, b: items[idx - 1] })}
                className="text-muted-foreground/60 transition hover:text-foreground disabled:opacity-30" title="Nach oben">
                <ChevronUp className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-muted-foreground">{it.position}</span>
              <button type="button" disabled={idx === items.length - 1} onClick={() => swap.mutate({ a: it, b: items[idx + 1] })}
                className="text-muted-foreground/60 transition hover:text-foreground disabled:opacity-30" title="Nach unten">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <button type="button" onClick={() => openEdit(it)} className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <ArtKennzeichen kind={it.kind} />
                <span className="text-sm font-semibold">{it.title}</span>
                {it.is_safety && (
                  <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                    <ShieldAlert className="mr-1 h-3 w-3" />Pflicht
                  </span>
                )}
                {it.kind === "massnahme" && it.cost_tier && (
                  <span className="text-xs text-muted-foreground">{costTierSymbol(it.cost_tier)}</span>
                )}
                {!it.is_required && it.kind !== "info" && (
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Antwort freiwillig</span>
                )}
              </div>

              {it.explanation && (
                <p className="mt-1.5 line-clamp-1 text-[13px] text-muted-foreground">{it.explanation}</p>
              )}

              {(it.kind === "einfachauswahl" || it.kind === "mehrfachauswahl") && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(it.answer_options ?? []).map((o, i) => (
                    <span key={i} className="rounded-full border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground">{o}</span>
                  ))}
                  {!(it.answer_options ?? []).length && (
                    <span className="text-[11px] text-destructive">noch keine Antworten hinterlegt</span>
                  )}
                </div>
              )}

              {it.kind === "skala" && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  1 bis {it.scale_max ?? 5}
                  {(it.scale_min_label || it.scale_max_label) && ` · ${it.scale_min_label || "1"} … ${it.scale_max_label || String(it.scale_max ?? 5)}`}
                </p>
              )}

              {(it.group_label || it.depends_on_item_id || it.followup_question) && (
                <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  {it.group_label && <span>{it.group_label}</span>}
                  {it.depends_on_item_id && <span>↳ {beschreibeLogik(it)}</span>}
                  {it.followup_question && <span>↳ Folgefrage: {it.followup_question}</span>}
                </p>
              )}
            </button>

            {it.kind !== "info" && (
              <div className="hidden shrink-0 md:block">
                <SurveyItemImages surveyId={surveyId} itemId={it.id} />
              </div>
            )}

            <div className="flex shrink-0 gap-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(it)} title="Bearbeiten">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicate.mutate(it)} title="Duplizieren">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => { if (confirm(`Frage "${it.title}" löschen? Zugehörige Antworten und Fotos werden mit entfernt.`)) del.mutate(it.id); }}
                title="Löschen">
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Fragen übernehmen ---------- */}
      <UebernahmeDialog
        offen={uebernahmeOffen} setOffen={setUebernahmeOffen}
        buildingId={buildingId} surveyId={surveyId}
        laeuft={uebernehmen.isPending}
        onWaehlen={(id) => uebernehmen.mutate(id)}
      />

      {/* ---------- Frage anlegen / bearbeiten ---------- */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Frage bearbeiten" : "Frage hinzufügen"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
              {/* Art der Frage */}
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Art der Frage</Label>
                {FRAGENARTEN.map((a) => (
                  <div key={a.kind}>
                    {a.kind === "massnahme" && <div className="my-2 border-t" />}
                    <button type="button" onClick={() => setKind(a.kind)}
                      className={`w-full rounded-lg border p-2.5 text-left transition ${
                        form.kind === a.kind ? "border-primary bg-primary/5" : "hover:border-primary/50"
                      }`}>
                      <span className="block text-sm font-medium">{a.label}</span>
                      <span className="block text-xs text-muted-foreground">{a.hint}</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Felder zur gewählten Art */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{ART_HINWEIS[form.kind]}</p>

                <div><Label>{form.kind === "info" ? "Überschrift" : "Frage"}</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder={form.kind === "info" ? "z. B. Zwischenüberschrift" : "z. B. Wie soll der Innenhof künftig genutzt werden?"} /></div>

                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Gruppe / Kapitel</Label>
                    <Input value={form.group_label} onChange={(e) => setForm({ ...form, group_label: e.target.value })}
                      placeholder="z. B. Außen & Sicherheit" /></div>
                  <div><Label>Position</Label>
                    <Input type="number" value={form.position}
                      onChange={(e) => setForm({ ...form, position: parseInt(e.target.value || "0", 10) })} /></div>
                </div>

                <div><Label>{form.kind === "info" ? "Inhalt" : "Erklärung (optional)"}</Label>
                  <Textarea rows={form.kind === "info" ? 6 : 3} value={form.explanation}
                    onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                    placeholder={form.kind === "info"
                      ? "Frei formulierter Text, wird dem Eigentümer als eigene Seite gezeigt."
                      : "Kurz und verständlich: worum geht es?"} /></div>

                {/* Antworten (Einfach-/Mehrfachauswahl) */}
                {auswahlArt && (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <Label>Antworten</Label>
                      <Button type="button" variant="ghost" size="sm"
                        onClick={() => setForm({ ...form, answer_options: [...JA_NEUTRAL_NEIN] })}>
                        Vorlage: Ja / Neutral / Nein
                      </Button>
                    </div>
                    {form.answer_options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-4 text-right text-xs text-muted-foreground">{i + 1}.</span>
                        <Input value={opt} placeholder={`Antwort ${i + 1}`}
                          onChange={(e) => {
                            const next = [...form.answer_options];
                            next[i] = e.target.value;
                            setForm({ ...form, answer_options: next });
                          }} />
                        <Button type="button" variant="ghost" size="icon"
                          disabled={form.answer_options.length <= 1}
                          onClick={() => setForm({ ...form, answer_options: form.answer_options.filter((_, k) => k !== i) })}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="secondary" size="sm"
                      onClick={() => setForm({ ...form, answer_options: [...form.answer_options, ""] })}>
                      <Plus className="mr-1 h-4 w-4" /> Antwort hinzufügen
                    </Button>
                  </div>
                )}

                {/* Skala */}
                {form.kind === "skala" && (
                  <div className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-3">
                    <div><Label>Von 1 bis</Label>
                      <Select value={String(form.scale_max)} onValueChange={(v) => setForm({ ...form, scale_max: parseInt(v, 10) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{SKALA_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div><Label>Beschriftung links</Label>
                      <Input value={form.scale_min_label} placeholder="z. B. gar nicht zufrieden"
                        onChange={(e) => setForm({ ...form, scale_min_label: e.target.value })} /></div>
                    <div><Label>Beschriftung rechts</Label>
                      <Input value={form.scale_max_label} placeholder="z. B. sehr zufrieden"
                        onChange={(e) => setForm({ ...form, scale_max_label: e.target.value })} /></div>
                  </div>
                )}

                {/* Maßnahme: Kosten, Pflicht, Folgefrage */}
                {form.kind === "massnahme" && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div><Label>Kostenrahmen</Label>
                      <Select value={form.cost_tier} onValueChange={(v) => setForm({ ...form, cost_tier: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{COST_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                      </Select></div>

                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div><Label>Sicherheits-/Pflichtpunkt</Label>
                        <p className="text-xs text-muted-foreground">Ohne Ja/Nein-Abstimmung (Verkehrssicherungspflicht)</p></div>
                      <Switch checked={form.is_safety} onCheckedChange={(v) => setForm({ ...form, is_safety: v })} />
                    </div>

                    <div><Label>Folgefrage (optional, nur bei Antwort „Ja")</Label>
                      <Input value={form.followup_question} onChange={(e) => setForm({ ...form, followup_question: e.target.value })}
                        placeholder="z. B. Welche Ausführung?" /></div>
                    <div><Label>Antwortoptionen der Folgefrage (eine pro Zeile)</Label>
                      <Textarea value={form.followup_options} onChange={(e) => setForm({ ...form, followup_options: e.target.value })}
                        placeholder={"Metall\nAcrylglas"} /></div>
                  </div>
                )}

                {/* Antwortpflicht */}
                {form.kind !== "info" && !(form.kind === "massnahme" && form.is_safety) && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div><Label>Antwort erforderlich</Label>
                      <p className="text-xs text-muted-foreground">Ohne Antwort kann nicht weitergeblättert werden.</p></div>
                    <Switch checked={form.is_required} onCheckedChange={(v) => setForm({ ...form, is_required: v })} />
                  </div>
                )}

                {/* Logik */}
                <div className="space-y-2 rounded-md border p-3">
                  <Label>Nur anzeigen, wenn ein anderer Punkt bestimmt beantwortet wurde</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={form.depends_on_item_id || "none"}
                      onValueChange={(v) => setForm({ ...form, depends_on_item_id: v === "none" ? "" : v, depends_on_value: "" })}>
                      <SelectTrigger><SelectValue placeholder="Punkt wählen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Immer anzeigen —</SelectItem>
                        {logikAuswahl.map((i) => (
                          <SelectItem key={i.id} value={i.id}>{i.position}. {i.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={form.depends_on_value || undefined}
                      onValueChange={(v) => setForm({ ...form, depends_on_value: v })}
                      disabled={!form.depends_on_item_id}>
                      <SelectTrigger><SelectValue placeholder="Antwort wählen" /></SelectTrigger>
                      <SelectContent>
                        {werteFuerLogik(logikEltern).map((w) => (
                          <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Möglich bei Punkten der Art „Einfachauswahl" und „Maßnahme" — nur dort steht eine eindeutige Antwort fest.
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setForm(null)}>Abbrechen</Button>
            <Button
              disabled={
                !form?.title.trim() || save.isPending ||
                (auswahlArt && form!.answer_options.filter((o) => o.trim()).length < 2)
              }
              onClick={() => form && save.mutate(form)}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Fragen einer anderen Umfrage desselben Gebäudes übernehmen. */
function UebernahmeDialog({ offen, setOffen, buildingId, surveyId, laeuft, onWaehlen }: {
  offen: boolean;
  setOffen: (o: boolean) => void;
  buildingId: string;
  surveyId: string;
  laeuft: boolean;
  onWaehlen: (id: string) => void;
}) {
  const { data: alle = [] } = useAdminSurveys(buildingId, true);
  const quellen = alle.filter((s) => s.id !== surveyId && (s.item_count ?? 0) > 0);

  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Fragen übernehmen</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Alle Fragen der gewählten Umfrage werden hier angehängt — ohne die abgegebenen Antworten.
          Fotos bleiben bei der Ursprungsumfrage.
        </p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {quellen.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              In diesem Gebäude gibt es keine andere Umfrage mit Fragen.
            </p>
          )}
          {quellen.map((s) => (
            <button key={s.id} type="button" disabled={laeuft} onClick={() => onWaehlen(s.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition hover:border-primary disabled:opacity-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.title}</span>
                <span className="block text-xs text-muted-foreground">{s.item_count} Frage(n)</span>
              </span>
              {laeuft ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
