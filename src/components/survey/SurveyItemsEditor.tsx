import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, ShieldAlert, ArrowUp, ArrowDown, Loader2, Copy, X } from "lucide-react";
import {
  ARTEN_MIT_LOGIK, ART_LABEL, FRAGENARTEN, JA_NEUTRAL_NEIN,
  SurveyKind, costTierSymbol,
} from "@/hooks/useSurvey";

/**
 * Editor für die Punkte einer Umfrage (nur Verwaltung).
 *
 * Links im Dialog wird die Art der Frage gewählt, rechts erscheinen nur die
 * Felder, die zu dieser Art gehören. Kosten und Pflicht-Kennzeichen gibt es
 * deshalb nur noch bei der Art „Maßnahme".
 */

const COST_OPTIONS = [
  { value: "1", label: "€" },
  { value: "2", label: "€€" },
  { value: "3", label: "€€€" },
  { value: "4", label: "€€€€" },
  { value: "offen", label: "€ offen" },
];

const SKALA_OPTIONS = [3, 4, 5, 7, 10];

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

/** Kurzer Hinweis unter der Überschrift des Dialogs. */
const ART_HINWEIS: Record<SurveyKind, string> = FRAGENARTEN.reduce(
  (acc, a) => ({ ...acc, [a.kind]: a.hint }),
  {} as Record<SurveyKind, string>,
);

export default function SurveyItemsEditor({ surveyId }: { surveyId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);

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
    qc.invalidateQueries({ queryKey: ["survey-images-manager", surveyId] });
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

  const openNew = () => setForm(emptyForm((items[items.length - 1]?.position ?? 0) + 1, "einfachauswahl"));

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

  if (isLoading) return <div className="p-4 text-muted-foreground">Lädt …</div>;

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
    const werte = werteFuerLogik(eltern);
    const treffer = werte.find((w) => w.value === it.depends_on_value);
    return `↳ nur wenn „${eltern.title}" ${treffer ? treffer.label.replace("Antwort = ", "= ") : "beantwortet"}`;
  };

  const auswahlArt = form?.kind === "einfachauswahl" || form?.kind === "mehrfachauswahl";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{items.length} Punkt(e)</p>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Punkt hinzufügen</Button>
      </div>

      {items.map((it, idx) => (
        <Card key={it.id}><CardContent className="p-4 flex items-start gap-3">
          <div className="flex flex-col items-center pt-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0}
              onClick={() => swap.mutate({ a: it, b: items[idx - 1] })}><ArrowUp className="h-4 w-4" /></Button>
            <span className="text-xs text-muted-foreground">{it.position}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === items.length - 1}
              onClick={() => swap.mutate({ a: it, b: items[idx + 1] })}><ArrowDown className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{it.title}</span>
              <Badge variant="secondary">{ART_LABEL[it.kind] ?? it.kind}</Badge>
              {it.group_label && <Badge variant="secondary">{it.group_label}</Badge>}
              {it.kind === "massnahme" && it.cost_tier && <Badge variant="outline">{costTierSymbol(it.cost_tier)}</Badge>}
              {it.is_safety && <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><ShieldAlert className="h-3 w-3 mr-1" />ohne Abstimmung</Badge>}
              {it.depends_on_item_id && <Badge variant="outline" className="text-xs">{beschreibeLogik(it)}</Badge>}
            </div>
            {it.explanation && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{it.explanation}</p>}
            {(it.kind === "einfachauswahl" || it.kind === "mehrfachauswahl") && (
              <p className="text-xs text-muted-foreground mt-1">
                Antworten: {(it.answer_options ?? []).join(" · ") || "— noch keine —"}
              </p>
            )}
            {it.kind === "skala" && (
              <p className="text-xs text-muted-foreground mt-1">
                1 bis {it.scale_max ?? 5}
                {it.scale_min_label || it.scale_max_label ? ` (${it.scale_min_label || "1"} … ${it.scale_max_label || String(it.scale_max ?? 5)})` : ""}
              </p>
            )}
            {it.followup_question && (
              <p className="text-xs text-muted-foreground mt-1">
                ↳ Folgefrage: {it.followup_question} ({(it.followup_options ?? []).join(", ")})
              </p>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => duplicate.mutate(it)} title="Duplizieren"><Copy className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(it)} title="Bearbeiten"><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Punkt "${it.title}" löschen? Zugehörige Antworten/Bilder werden mit entfernt.`)) del.mutate(it.id); }}>
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </CardContent></Card>
      ))}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Punkt bearbeiten" : "Punkt hinzufügen"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
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
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Antworten</Label>
                      <Button type="button" variant="ghost" size="sm"
                        onClick={() => setForm({ ...form, answer_options: [...JA_NEUTRAL_NEIN] })}>
                        Vorlage: Ja / Neutral / Nein
                      </Button>
                    </div>
                    {form.answer_options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}.</span>
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
                      <Plus className="h-4 w-4 mr-1" /> Antwort hinzufügen
                    </Button>
                  </div>
                )}

                {/* Skala */}
                {form.kind === "skala" && (
                  <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <div className="rounded-md border p-3 space-y-3">
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
                <div className="rounded-md border p-3 space-y-2">
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
              {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
