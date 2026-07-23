import { useEffect, useState } from "react";
import { AdminSurvey, useDeleteSurvey, useDuplicateSurvey, useUpdateSurvey } from "@/hooks/useSurveysAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Copy, Save, Play, Pause, Square, Archive, Trash2, RotateCcw } from "lucide-react";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:    { label: "Entwurf",    cls: "bg-muted text-muted-foreground" },
  open:     { label: "Aktiv",      cls: "bg-emerald-100 text-emerald-700" },
  paused:   { label: "Pausiert",   cls: "bg-amber-100 text-amber-800" },
  closed:   { label: "Geschlossen", cls: "bg-slate-200 text-slate-700" },
  archived: { label: "Archiviert", cls: "bg-slate-200 text-slate-500" },
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}

export default function SurveySettingsTab({ survey, onDeleted }: { survey: AdminSurvey; onDeleted: () => void }) {
  const update = useUpdateSurvey();
  const del = useDeleteSurvey();
  const dup = useDuplicateSurvey();
  const [form, setForm] = useState(survey);
  useEffect(() => setForm(survey), [survey.id]);

  const dirty = JSON.stringify(form) !== JSON.stringify(survey);
  const st = STATUS_LABEL[survey.status] ?? STATUS_LABEL.draft;

  const setStatus = (status: AdminSurvey["status"]) =>
    update.mutate({ id: survey.id, patch: { status } });

  const save = () =>
    update.mutate({
      id: survey.id,
      patch: {
        title: form.title,
        description: form.description,
        opens_at: form.opens_at,
        closes_at: form.closes_at,
        quorum_pct: form.quorum_pct,
        is_visible_to_owners: form.is_visible_to_owners,
        welcome_title: form.welcome_title,
        welcome_message: form.welcome_message,
        end_title: form.end_title,
        end_message: form.end_message,
        safety_notice: form.safety_notice,
      },
    });

  return (
    <div className="space-y-4">
      {/* Status + Aktionen */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge className={st.cls + " hover:" + st.cls}>{st.label}</Badge>
              <span className="text-sm text-muted-foreground">
                {survey.vote_count ?? 0} Stimme(n) · {survey.item_count ?? 0} Punkt(e)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {survey.status === "draft" && (
                <Button size="sm" onClick={() => setStatus("open")} disabled={!survey.item_count}>
                  <Play className="h-4 w-4 mr-1" /> Veröffentlichen
                </Button>
              )}
              {survey.status === "open" && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setStatus("paused")}>
                    <Pause className="h-4 w-4 mr-1" /> Pausieren
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setStatus("closed")}>
                    <Square className="h-4 w-4 mr-1" /> Schließen
                  </Button>
                </>
              )}
              {survey.status === "paused" && (
                <Button size="sm" onClick={() => setStatus("open")}>
                  <Play className="h-4 w-4 mr-1" /> Fortsetzen
                </Button>
              )}
              {survey.status === "closed" && (
                <Button size="sm" variant="secondary" onClick={() => setStatus("open")}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Wieder öffnen
                </Button>
              )}
              {survey.status !== "archived" && (
                <Button size="sm" variant="ghost" onClick={() => setStatus("archived")}>
                  <Archive className="h-4 w-4 mr-1" /> Archivieren
                </Button>
              )}
              {survey.status === "archived" && (
                <Button size="sm" variant="secondary" onClick={() => setStatus("draft")}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Wiederherstellen
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => dup.mutate({ id: survey.id })}>
                <Copy className="h-4 w-4 mr-1" /> Duplizieren
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4 mr-1" /> Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Umfrage löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {(survey.vote_count ?? 0) > 0
                        ? "Diese Umfrage enthält bereits Stimmen und kann nicht gelöscht werden. Bitte stattdessen archivieren."
                        : "Diese Aktion kann nicht rückgängig gemacht werden. Alle Punkte und Bilder werden entfernt."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={(survey.vote_count ?? 0) > 0}
                      onClick={() => del.mutate(survey.id, { onSuccess: onDeleted })}
                    >
                      Endgültig löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Für Eigentümer sichtbar</Label>
              <p className="text-xs text-muted-foreground">
                Bei „aus" verschwindet die Umfrage inkl. Menüpunkt im Eigentümer-Portal, auch wenn sie aktiv ist.
              </p>
            </div>
            <Switch
              checked={form.is_visible_to_owners}
              onCheckedChange={(v) => setForm({ ...form, is_visible_to_owners: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Basisdaten */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label>Titel</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label>Kurzbeschreibung (intern)</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div>
              <Label>Quorum-Warnschwelle (%)</Label>
              <Input type="number" min={0} max={100} value={form.quorum_pct ?? 40}
                onChange={(e) => setForm({ ...form, quorum_pct: parseInt(e.target.value || "0", 10) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Willkommens- und Abschluss-Texte */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Begrüßung (erste Seite)</h3>
            <Label>Titel</Label>
            <Input value={form.welcome_title ?? ""} onChange={(e) => setForm({ ...form, welcome_title: e.target.value })} />
            <Label className="mt-2 block">Nachricht</Label>
            <Textarea rows={4} value={form.welcome_message ?? ""}
              onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} />
          </div>
          <div>
            <h3 className="font-semibold mb-2">Abschluss (Danke-Seite)</h3>
            <Label>Titel</Label>
            <Input value={form.end_title ?? ""} onChange={(e) => setForm({ ...form, end_title: e.target.value })} />
            <Label className="mt-2 block">Nachricht</Label>
            <Textarea rows={4} value={form.end_message ?? ""}
              onChange={(e) => setForm({ ...form, end_message: e.target.value })} />
          </div>
          <div>
            <h3 className="font-semibold mb-2">Hinweis bei Sicherheits-/Pflichtpunkten</h3>
            <Label>Text (wird bei Punkten ohne Abstimmung angezeigt)</Label>
            <Textarea rows={3} value={form.safety_notice ?? ""}
              onChange={(e) => setForm({ ...form, safety_notice: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-0 bg-background/80 backdrop-blur py-2">
        <Button onClick={save} disabled={!dirty || update.isPending}>
          <Save className="h-4 w-4 mr-1" /> Änderungen speichern
        </Button>
      </div>
    </div>
  );
}
