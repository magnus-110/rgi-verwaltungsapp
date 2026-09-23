import { AdminSurvey, useDeleteSurvey, useDuplicateSurvey, useUpdateSurvey } from "@/hooks/useSurveysAdmin";
import { useSurveyAuswertung } from "@/hooks/useSurvey";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Archive, Copy, Eye, MoreHorizontal, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * Der feste Kopf über einer Umfrage.
 *
 * Vorher musste man erst in die Einstellungen, um zu sehen, ob die Umfrage
 * läuft, bis wann und wer geantwortet hat. Jetzt steht das oben — zusammen mit
 * genau den Knöpfen, die zum jeweiligen Zustand passen.
 */

const ZUSTAND: Record<string, { label: string; punkt: string; text: string; grund: string }> = {
  draft:    { label: "Entwurf",     punkt: "bg-muted-foreground/50", text: "text-muted-foreground", grund: "bg-muted" },
  open:     { label: "Aktiv",       punkt: "bg-emerald-600",          text: "text-emerald-800",      grund: "bg-emerald-100" },
  paused:   { label: "Pausiert",    punkt: "bg-amber-500",            text: "text-amber-800",        grund: "bg-amber-100" },
  closed:   { label: "Geschlossen", punkt: "bg-slate-500",            text: "text-slate-700",        grund: "bg-slate-200" },
  archived: { label: "Archiviert",  punkt: "bg-slate-400",            text: "text-slate-600",        grund: "bg-slate-200" },
};

function datum(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
}

/** „läuft vom 12.09. bis 15.10.2026" — je nachdem, was gesetzt ist. */
function zeitraum(s: AdminSurvey) {
  const von = datum(s.opens_at);
  const bis = datum(s.closes_at);
  if (von && bis) return `läuft vom ${von} bis ${bis}`;
  if (bis) return `läuft bis ${bis}`;
  if (von) return `läuft seit ${von}`;
  return "ohne festen Zeitraum";
}

export default function SurveyKopf({ survey, gebaeudeName, onVorschau, onDeleted }: {
  survey: AdminSurvey;
  gebaeudeName?: string;
  onVorschau: () => void;
  onDeleted: () => void;
}) {
  const update = useUpdateSurvey();
  const del = useDeleteSurvey();
  const dup = useDuplicateSurvey();
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const { data: auswertung } = useSurveyAuswertung(survey.id, survey.building_id);

  const z = ZUSTAND[survey.status] ?? ZUSTAND.draft;
  const setStatus = (status: AdminSurvey["status"]) => update.mutate({ id: survey.id, patch: { status } });
  const fragen = survey.item_count ?? 0;
  const hatStimmen = (survey.vote_count ?? 0) > 0;

  const gesamt = auswertung?.eigentuemerGesamt ?? 0;
  const dabei = auswertung?.teilnehmendeKoepfe ?? 0;
  const pct = auswertung?.beteiligungPct ?? 0;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate text-lg font-semibold">{survey.title}</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${z.grund} ${z.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${z.punkt}`} />{z.label}
            </span>
            {!survey.is_visible_to_owners && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11.5px] text-muted-foreground">für Eigentümer ausgeblendet</span>
            )}
          </div>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {gebaeudeName ? `${gebaeudeName} · ` : ""}
            {fragen === 0 ? "noch keine Frage" : `${fragen} Frage${fragen === 1 ? "" : "n"}`}
            {survey.status === "draft" ? " · noch nicht veröffentlicht" : ` · ${zeitraum(survey)}`}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onVorschau} disabled={fragen === 0}>
            <Eye className="mr-1 h-4 w-4" /> Vorschau
          </Button>

          {survey.status === "draft" && (
            <Button size="sm" onClick={() => setStatus("open")} disabled={fragen === 0}>
              <Play className="mr-1 h-4 w-4" /> Veröffentlichen
            </Button>
          )}
          {survey.status === "open" && (
            <Button variant="outline" size="sm" onClick={() => setStatus("closed")}>
              <Square className="mr-1 h-4 w-4" /> Schließen
            </Button>
          )}
          {survey.status === "paused" && (
            <Button size="sm" onClick={() => setStatus("open")}>
              <Play className="mr-1 h-4 w-4" /> Fortsetzen
            </Button>
          )}
          {survey.status === "closed" && (
            <Button variant="outline" size="sm" onClick={() => setStatus("open")}>
              <RotateCcw className="mr-1 h-4 w-4" /> Wieder öffnen
            </Button>
          )}
          {survey.status === "archived" && (
            <Button variant="outline" size="sm" onClick={() => setStatus("draft")}>
              <RotateCcw className="mr-1 h-4 w-4" /> Wiederherstellen
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" title="Mehr">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {survey.status === "open" && (
                <DropdownMenuItem onClick={() => setStatus("paused")}>
                  <Pause className="mr-2 h-4 w-4" /> Pausieren
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => dup.mutate({ id: survey.id })}>
                <Copy className="mr-2 h-4 w-4" /> Duplizieren
              </DropdownMenuItem>
              {survey.status !== "archived" && (
                <DropdownMenuItem onClick={() => setStatus("archived")}>
                  <Archive className="mr-2 h-4 w-4" /> Archivieren
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setLoeschenOffen(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Beteiligung */}
      {survey.status !== "draft" && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[13px] text-muted-foreground">Beteiligung</span>
          <span className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-1.5 rounded-full bg-emerald-600" style={{ width: `${Math.min(100, pct)}%` }} />
          </span>
          <span className="text-[13px] text-muted-foreground">
            {dabei === 0
              ? "noch keine Antworten"
              : <><b className="text-foreground">{dabei}{gesamt ? ` von ${gesamt}` : ""}</b> Eigentümern{gesamt ? ` · ${pct} % der Anteile` : ""}</>}
          </span>
        </div>
      )}

      <AlertDialog open={loeschenOffen} onOpenChange={setLoeschenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Umfrage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {hatStimmen
                ? "Diese Umfrage enthält bereits Antworten und kann nicht gelöscht werden. Bitte stattdessen archivieren."
                : "Diese Aktion kann nicht rückgängig gemacht werden. Alle Fragen und Fotos werden entfernt."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={hatStimmen} onClick={() => del.mutate(survey.id, { onSuccess: onDeleted })}>
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
