import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Circle, Inbox, Power, Users, AlertCircle, Loader2, ChevronRight,
  Mail, Download, FileText, Copy, Check,
} from "lucide-react";
import { OnboardingStepOverviews } from "./onboarding/OnboardingStepOverviews";

function PlaceholderChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title="Klicken zum Kopieren"
      className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-accent transition-colors"
    >
      <span>{value}</span>
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  );
}
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  buildingId: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  wohnungsdaten: "Wohnungsdaten",
  gebaeudeinformationen: "Gebäudeinformationen",
  dienstleister: "Dienstleister",
  bewertung: "Einschätzung",
};

export const BuildingOnboardingTab = ({ buildingId }: Props) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reviewItem, setReviewItem] = useState<any | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [markGlobal, setMarkGlobal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: number; failed: number; zip_path: string } | null>(null);

  // Activation state
  const { data: activation } = useQuery({
    queryKey: ["onb-activation", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_activations" as any)
        .select("*")
        .eq("building_id", buildingId)
        .maybeSingle();
      return data as any;
    },
  });

  // Building (for welcome letter template)
  const { data: building } = useQuery({
    queryKey: ["onb-building", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("buildings")
        .select("id, name, welcome_letter_template_id" as any)
        .eq("id", buildingId)
        .maybeSingle();
      return data as any;
    },
  });

  // Letter templates available for this building (or global)
  const { data: letterTemplates = [] } = useQuery({
    queryKey: ["onb-letter-templates", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("comm_templates")
        .select("id, name")
        .eq("type", "letter")
        .or(`building_id.eq.${buildingId},building_id.is.null`)
        .order("name");
      return data ?? [];
    },
  });

  // All progress rows for this building
  const { data: progresses = [] } = useQuery({
    queryKey: ["onb-progress", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_progress" as any)
        .select("*")
        .eq("building_id", buildingId);
      return (data ?? []) as any[];
    },
  });

  // Pending submissions
  const { data: submissions = [] } = useQuery({
    queryKey: ["onb-submissions", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_submissions" as any)
        .select("*")
        .eq("building_id", buildingId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  // Owner names lookup
  const userIds = Array.from(
    new Set([
      ...progresses.map((p: any) => p.user_id),
      ...submissions.map((s: any) => s.user_id),
    ])
  );
  const { data: profiles = [] } = useQuery({
    queryKey: ["onb-profiles", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, username")
        .in("user_id", userIds);
      return data ?? [];
    },
  });
  const nameOf = (uid: string) => {
    const p: any = profiles.find((x: any) => x.user_id === uid);
    if (!p) return uid.slice(0, 8);
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.username || uid.slice(0, 8);
  };

  // Toggle activation
  const toggleActivation = async (active: boolean) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    if (activation) {
      await supabase
        .from("onboarding_activations" as any)
        .update({
          is_active: active,
          deactivated_at: active ? null : new Date().toISOString(),
        })
        .eq("building_id", buildingId);
    } else {
      await supabase.from("onboarding_activations" as any).insert({
        building_id: buildingId,
        is_active: active,
        activated_by: u.user.id,
      });
    }
    qc.invalidateQueries({ queryKey: ["onb-activation", buildingId] });
    toast({
      title: active ? "Onboarding aktiviert" : "Onboarding deaktiviert",
      description: active
        ? "Eigentümer können den Wizard jetzt sehen."
        : "Der Wizard ist für Eigentümer ausgeblendet.",
    });
  };

  // Approve / reject
  const handleReview = async (action: "approve" | "reject") => {
    if (!reviewItem) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "onboarding-approve-submission",
        {
          body: {
            submission_id: reviewItem.id,
            action,
            review_note: reviewNote || null,
            mark_as_global_suggestion: markGlobal,
          },
        }
      );
      if (error) throw error;
      const r = data as any;
      if (r?.error) throw new Error(r.error);
      toast({
        title: action === "approve" ? "Übernommen" : "Abgelehnt",
        description: action === "approve" ? "Daten wurden übernommen." : "Eintrag wurde abgelehnt.",
      });
      setReviewItem(null);
      setReviewNote("");
      setMarkGlobal(false);
      qc.invalidateQueries({ queryKey: ["onb-submissions", buildingId] });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Welcome letter — set template
  const setTemplate = async (templateId: string) => {
    const newId = templateId === "__none__" ? null : templateId;
    const { error } = await supabase
      .from("buildings")
      .update({ welcome_letter_template_id: newId } as any)
      .eq("id", buildingId);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["onb-building", buildingId] });
    toast({ title: "Vorlage gespeichert" });
  };

  // Welcome letter — generate
  const generateLetters = async () => {
    setGenerating(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-welcome-letters",
        { body: { building_id: buildingId } },
      );
      if (error) throw error;
      const r = data as any;
      if (r?.error) throw new Error(r.error);
      setLastResult({ ok: r.ok, failed: r.failed, zip_path: r.zip_path });
      toast({
        title: "Briefe erstellt",
        description: `${r.ok} erfolgreich, ${r.failed} fehlgeschlagen. Ablage im Dokumentenarchiv.`,
      });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const downloadLastZip = async () => {
    if (!lastResult?.zip_path) return;
    const { data, error } = await supabase.storage
      .from("comm-assets")
      .createSignedUrl(lastResult.zip_path, 600);
    if (error || !data?.signedUrl) {
      toast({ title: "Download-Fehler", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };


  const totalOwners = progresses.length;
  const step1Done = progresses.filter((p: any) => p.step1_completed_at).length;
  const fullyDone = progresses.filter((p: any) => p.fully_completed_at).length;
  const isActive = !!activation?.is_active;

  return (
    <div className="space-y-6">
      {/* Activation */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Power className="h-5 w-5" /> Onboarding aktivieren
              </CardTitle>
              <CardDescription>
                Schaltet den Wizard und FAB für alle zugeordneten Eigentümer dieser Liegenschaft frei.
              </CardDescription>
            </div>
            <Switch checked={isActive} onCheckedChange={toggleActivation} />
          </div>
        </CardHeader>
        {activation?.activated_at && (
          <CardContent className="text-sm text-muted-foreground">
            Aktiviert am{" "}
            {format(new Date(activation.activated_at), "dd.MM.yyyy HH:mm", { locale: de })}
            {activation?.deactivated_at && (
              <> · Deaktiviert am {format(new Date(activation.deactivated_at), "dd.MM.yyyy HH:mm", { locale: de })}</>
            )}
          </CardContent>
        )}
      </Card>

      {/* Welcome letters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Begrüßungsbriefe & Magic-Link
          </CardTitle>
          <CardDescription>
            Für jeden Eigentümer einen personalisierten Brief mit eingebettetem QR-Code (gültig 30 Tage) als ZIP erzeugen — automatische Ablage im Dokumentenarchiv.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Brief-Vorlage
            </label>
            <Select
              value={building?.welcome_letter_template_id ?? "__none__"}
              onValueChange={setTemplate}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vorlage wählen…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Keine Vorlage —</SelectItem>
                {(letterTemplates as any[]).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
              <span>Vorlage muss die Platzhalter</span>
              <PlaceholderChip value="{{magic_link_url}}" />
              <span>und (für QR-Code) ein Bildplatzhalter</span>
              <PlaceholderChip value="{%magic_link_qr}" />
              <span>enthalten.</span>
            </p>

            <details className="rounded-md border bg-muted/30 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">
                Alle verfügbaren Platzhalter anzeigen (klicken zum Kopieren)
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 font-semibold text-foreground">Magic-Link / QR</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><PlaceholderChip value="{{magic_link_url}}" /> — Onboarding-Link</li>
                    <li><PlaceholderChip value="{%magic_link_qr}" /> — QR-Code als Bild</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Person</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><PlaceholderChip value="{{anrede}}" /> — Herr / Frau</li>
                    <li><PlaceholderChip value="{{anrede_brief}}" /> — Sehr geehrter Herr …,</li>
                    <li><PlaceholderChip value="{{vorname}}" /></li>
                    <li><PlaceholderChip value="{{nachname}}" /></li>
                    <li><PlaceholderChip value="{{vollname}}" /></li>
                    <li><PlaceholderChip value="{{titel}}" /> — Position/Funktion</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Adresse</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><PlaceholderChip value="{{firma}}" /></li>
                    <li><PlaceholderChip value="{{strasse}}" /></li>
                    <li><PlaceholderChip value="{{plz}}" /></li>
                    <li><PlaceholderChip value="{{ort}}" /></li>
                    <li><PlaceholderChip value="{{adresse_block}}" /> — komplette Briefanschrift</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Kontakt</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><PlaceholderChip value="{{email}}" /></li>
                    <li><PlaceholderChip value="{{telefon}}" /></li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Gebäude / Einheit</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><PlaceholderChip value="{{gebaeude_name}}" /></li>
                    <li><PlaceholderChip value="{{gebaeude_strasse}}" /></li>
                    <li><PlaceholderChip value="{{einheit}}" /></li>
                    <li><PlaceholderChip value="{{rolle}}" /> — Eigentümer/Mieter</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Verwaltung & Datum</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><PlaceholderChip value="{{verwalter_name}}" /></li>
                    <li><PlaceholderChip value="{{verwalter_email}}" /></li>
                    <li><PlaceholderChip value="{{verwalter_telefon}}" /></li>
                    <li><PlaceholderChip value="{{datum_heute}}" /> — z. B. 25. April 2026</li>
                    <li><PlaceholderChip value="{{ort_datum}}" /> — Ort, 25.04.2026</li>
                  </ul>
                </div>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={generateLetters}
              disabled={generating || !building?.welcome_letter_template_id}
            >
              {generating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Begrüßungsbriefe erstellen
            </Button>
            {lastResult && (
              <Button variant="outline" onClick={downloadLastZip}>
                <Download className="h-4 w-4 mr-2" />
                ZIP herunterladen ({lastResult.ok} Briefe)
              </Button>
            )}
          </div>

          {lastResult?.failed ? (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4" />
              {lastResult.failed} Briefe konnten nicht erzeugt werden.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Progress overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Fortschritt der Eigentümer
          </CardTitle>
          <CardDescription>
            {totalOwners === 0
              ? "Noch keine Eigentümer haben den Wizard gestartet."
              : `${step1Done} von ${totalOwners} haben Schritt 1 abgeschlossen · ${fullyDone} vollständig fertig`}
          </CardDescription>
        </CardHeader>
        {totalOwners > 0 && (
          <CardContent className="space-y-3">
            <Progress value={(step1Done / totalOwners) * 100} className="h-2" />
            <div className="space-y-2">
              {progresses.map((p: any) => (
                <ProgressRow key={p.id} p={p} name={nameOf(p.user_id)} />
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Submission Inbox */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" /> Freigaben ({submissions.length})
          </CardTitle>
          <CardDescription>
            Eingaben der Eigentümer, die übernommen oder abgelehnt werden müssen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Keine offenen Freigaben.
            </p>
          ) : (
            <div className="space-y-2">
              {submissions.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setReviewItem(s);
                    setReviewNote("");
                    setMarkGlobal(false);
                  }}
                  className="w-full flex items-center justify-between rounded-md border p-3 hover:bg-muted/40 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="secondary">{CATEGORY_LABEL[s.category] || s.category}</Badge>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{nameOf(s.user_id)}</div>
                      <div className="text-xs text-muted-foreground">
                        Schritt {s.step} ·{" "}
                        {format(new Date(s.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!reviewItem} onOpenChange={(o) => !o && setReviewItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Eingabe prüfen</DialogTitle>
            <DialogDescription>
              {reviewItem && (
                <>
                  {nameOf(reviewItem.user_id)} · {CATEGORY_LABEL[reviewItem.category] || reviewItem.category}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {reviewItem && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 max-h-64 overflow-auto">
                <pre className="text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(reviewItem.payload, null, 2)}
                </pre>
              </div>

              {reviewItem.category === "dienstleister" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={markGlobal}
                    onChange={(e) => setMarkGlobal(e.target.checked)}
                  />
                  Auch als globalen Vorschlag für andere Liegenschaften markieren
                </label>
              )}

              <div>
                <label className="text-sm font-medium mb-1 block">Notiz (optional)</label>
                <Textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Interne Notiz zur Entscheidung…"
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewItem(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleReview("reject")}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ablehnen
            </Button>
            <Button onClick={() => handleReview("approve")} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function ProgressRow({ p, name }: { p: any; name: string }) {
  const steps = [1, 2, 3, 4, 5].map((n) => !!p[`step${n}_completed_at`]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-2.5">
      <div className="text-sm font-medium truncate">{name}</div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {steps.map((done, i) =>
          done ? (
            <CheckCircle2 key={i} className="h-4 w-4 text-primary" />
          ) : (
            <Circle key={i} className="h-4 w-4 text-muted-foreground/40" />
          )
        )}
      </div>
    </div>
  );
}
