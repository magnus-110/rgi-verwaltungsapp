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
import { Pencil, Trash2, Plus, ShieldAlert, ArrowUp, ArrowDown, Loader2 } from "lucide-react";

/**
 * Vollständiger Editor für die Umfrage-Punkte (nur Verwaltung):
 * bearbeiten (Stift), löschen, hinzufügen, Reihenfolge ändern.
 */

const COST_OPTIONS = ["1", "1–2", "2", "2–3", "3", "4", "offen"];

interface Item {
  id: string;
  survey_id: string;
  position: number;
  group_label: string | null;
  title: string;
  explanation: string;
  cost_tier: string | null;
  is_safety: boolean;
  followup_question: string | null;
  followup_options: string[] | null;
}

interface FormState {
  id?: string;
  position: number;
  group_label: string;
  title: string;
  explanation: string;
  cost_tier: string;
  is_safety: boolean;
  followup_question: string;
  followup_options: string; // zeilenweise
}

const emptyForm = (position: number): FormState => ({
  position, group_label: "", title: "", explanation: "", cost_tier: "2",
  is_safety: false, followup_question: "", followup_options: "",
});

export default function SurveyItemsEditor({ surveyId }: { surveyId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null); // null = Dialog zu

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["survey-items-editor", surveyId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("survey_items")
        .select("id, survey_id, position, group_label, title, explanation, cost_tier, is_safety, followup_question, followup_options")
        .eq("survey_id", surveyId)
        .order("position", { ascending: true });
      return (data || []) as Item[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["survey-items-editor", surveyId] });
    qc.invalidateQueries({ queryKey: ["survey-items", surveyId] });
    qc.invalidateQueries({ queryKey: ["survey-images-manager", surveyId] });
    qc.invalidateQueries({ queryKey: ["survey-results", surveyId] });
    qc.invalidateQueries({ queryKey: ["owner-survey"] });
  };

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        survey_id: surveyId,
        position: f.position,
        group_label: f.group_label.trim() || null,
        title: f.title.trim(),
        explanation: f.explanation.trim(),
        cost_tier: f.cost_tier,
        is_safety: f.is_safety,
        followup_question: f.followup_question.trim() || null,
        followup_options:
          f.followup_options.split("\n").map((s) => s.trim()).filter(Boolean).length
            ? f.followup_options.split("\n").map((s) => s.trim()).filter(Boolean)
            : null,
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

  // Reihenfolge tauschen
  const swap = useMutation({
    mutationFn: async ({ a, b }: { a: Item; b: Item }) => {
      await (supabase as any).from("survey_items").update({ position: b.position }).eq("id", a.id);
      await (supabase as any).from("survey_items").update({ position: a.position }).eq("id", b.id);
    },
    onSuccess: refresh,
  });

  const openEdit = (it: Item) =>
    setForm({
      id: it.id, position: it.position, group_label: it.group_label ?? "",
      title: it.title, explanation: it.explanation, cost_tier: it.cost_tier ?? "2",
      is_safety: it.is_safety, followup_question: it.followup_question ?? "",
      followup_options: (it.followup_options ?? []).join("\n"),
    });

  const openNew = () => setForm(emptyForm((items[items.length - 1]?.position ?? 0) + 1));

  if (isLoading) return <div className="p-4 text-muted-foreground">Lädt …</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} Punkte · voll anpassbar</p>
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
              {it.group_label && <Badge variant="secondary">{it.group_label}</Badge>}
              {it.cost_tier && <Badge variant="outline">{it.cost_tier === "offen" ? "Kosten offen" : "€".repeat(parseInt(it.cost_tier.split("–").pop()!, 10) || 1)}</Badge>}
              {it.is_safety && <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><ShieldAlert className="h-3 w-3 mr-1" />ohne Abstimmung</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{it.explanation}</p>
            {it.followup_question && <p className="text-xs text-muted-foreground mt-1">↳ Folgefrage: {it.followup_question} ({(it.followup_options ?? []).join(", ")})</p>}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(it)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Punkt "${it.title}" löschen? Zugehörige Stimmen/Bilder werden mit entfernt.`)) del.mutate(it.id); }}>
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </CardContent></Card>
      ))}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "Punkt bearbeiten" : "Neuen Punkt hinzufügen"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>Titel</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z. B. Außenbeleuchtung erneuern" /></div>
              <div><Label>Gruppe</Label>
                <Input value={form.group_label} onChange={(e) => setForm({ ...form, group_label: e.target.value })} placeholder="z. B. Außen & Sicherheit" /></div>
              <div><Label>Erklärung</Label>
                <Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} placeholder="Kurz und verständlich: worum geht es, was müsste gemacht werden?" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Kostenrahmen</Label>
                  <Select value={form.cost_tier} onValueChange={(v) => setForm({ ...form, cost_tier: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{COST_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label>Position</Label>
                  <Input type="number" value={form.position} onChange={(e) => setForm({ ...form, position: parseInt(e.target.value || "0", 10) })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div><Label>Sicherheits-/Pflichtpunkt</Label>
                  <p className="text-xs text-muted-foreground">Ohne Ja/Nein-Abstimmung (Verkehrssicherungspflicht)</p></div>
                <Switch checked={form.is_safety} onCheckedChange={(v) => setForm({ ...form, is_safety: v })} />
              </div>
              <div><Label>Folgefrage (optional)</Label>
                <Input value={form.followup_question} onChange={(e) => setForm({ ...form, followup_question: e.target.value })} placeholder="z. B. Welche Ausführung?" /></div>
              <div><Label>Antwortoptionen der Folgefrage (eine pro Zeile)</Label>
                <Textarea value={form.followup_options} onChange={(e) => setForm({ ...form, followup_options: e.target.value })} placeholder={"Metall\nAcrylglas"} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setForm(null)}>Abbrechen</Button>
            <Button disabled={!form?.title.trim() || save.isPending} onClick={() => form && save.mutate(form)}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
