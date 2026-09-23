import { useEffect, useState } from "react";
import { AdminSurvey, useUpdateSurvey } from "@/hooks/useSurveysAdmin";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Save } from "lucide-react";

/**
 * Die Einstellungen einer Umfrage.
 *
 * Zustand und Aktionen (veröffentlichen, schließen, löschen …) stehen jetzt
 * oben im Kopf — hier bleiben nur die Angaben, die man tippt.
 */

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}

function Block({ titel, hinweis, children }: { titel: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h3 className="text-sm font-semibold">{titel}</h3>
      {hinweis && <p className="mt-1 text-xs text-muted-foreground">{hinweis}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default function SurveySettingsTab({ survey }: { survey: AdminSurvey }) {
  const update = useUpdateSurvey();
  const [form, setForm] = useState(survey);
  useEffect(() => setForm(survey), [survey.id]);

  const dirty = JSON.stringify(form) !== JSON.stringify(survey);

  const save = () =>
    update.mutate({
      id: survey.id,
      patch: {
        title: form.title,
        description: form.description,
        opens_at: form.opens_at,
        closes_at: form.closes_at,
        weight_by_mea: form.weight_by_mea,
        is_visible_to_owners: form.is_visible_to_owners,
        welcome_title: form.welcome_title,
        welcome_message: form.welcome_message,
        end_title: form.end_title,
        end_message: form.end_message,
        safety_notice: form.safety_notice,
      },
    });

  return (
    <div className="max-w-3xl space-y-4 pb-16">
      <Block titel="Grundangaben">
        <div>
          <Label>Titel</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <Label>Kurzbeschreibung (nur intern)</Label>
          <Textarea rows={2} value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Startet am</Label>
            <Input type="datetime-local" value={toLocalInput(form.opens_at)}
              onChange={(e) => setForm({ ...form, opens_at: fromLocalInput(e.target.value) })} />
          </div>
          <div>
            <Label>Endet am</Label>
            <Input type="datetime-local" value={toLocalInput(form.closes_at)}
              onChange={(e) => setForm({ ...form, closes_at: fromLocalInput(e.target.value) })} />
          </div>
        </div>
      </Block>

      <Block titel="Auswertung und Sichtbarkeit">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label>Nach Miteigentumsanteilen gewichten</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aus: jede Stimme zählt gleich viel — passend für allgemeine Umfragen.
              An: große Einheiten zählen mehr — passend für Maßnahmen.
            </p>
          </div>
          <Switch checked={form.weight_by_mea !== false}
            onCheckedChange={(v) => setForm({ ...form, weight_by_mea: v })} />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label>Für Eigentümer sichtbar</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aus: die Umfrage verschwindet samt Menüpunkt im Eigentümer-Portal, auch wenn sie aktiv ist.
            </p>
          </div>
          <Switch checked={form.is_visible_to_owners}
            onCheckedChange={(v) => setForm({ ...form, is_visible_to_owners: v })} />
        </div>
      </Block>

      <Block titel="Texte für die Eigentümer" hinweis="Diese Texte sehen die Eigentümer beim Ausfüllen.">
        <div>
          <Label>Begrüßung — Überschrift</Label>
          <Input value={form.welcome_title ?? ""} onChange={(e) => setForm({ ...form, welcome_title: e.target.value })} />
          <Label className="mt-3 block">Begrüßung — Text</Label>
          <Textarea rows={3} value={form.welcome_message ?? ""}
            onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} />
        </div>
        <div>
          <Label>Danke-Seite — Überschrift</Label>
          <Input value={form.end_title ?? ""} onChange={(e) => setForm({ ...form, end_title: e.target.value })} />
          <Label className="mt-3 block">Danke-Seite — Text</Label>
          <Textarea rows={3} value={form.end_message ?? ""}
            onChange={(e) => setForm({ ...form, end_message: e.target.value })} />
        </div>
        <div>
          <Label>Hinweis bei Pflichtpunkten ohne Abstimmung</Label>
          <Textarea rows={2} value={form.safety_notice ?? ""}
            onChange={(e) => setForm({ ...form, safety_notice: e.target.value })} />
        </div>
      </Block>

      <div className="sticky bottom-0 flex justify-end bg-background/80 py-3 backdrop-blur">
        <Button onClick={save} disabled={!dirty || update.isPending}>
          <Save className="mr-1 h-4 w-4" /> Änderungen speichern
        </Button>
      </div>
    </div>
  );
}
