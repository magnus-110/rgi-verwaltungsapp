import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Download, Loader2, Plus, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { reportsDb } from "@/integrations/supabase/reports";
import {
  REPORT_CHANNEL_LABEL,
  REPORT_STATUS_LABEL,
  ReportChannel,
  ReportStatus,
  ReportRow,
  ReportStep,
  currentStandOf,
  staffName,
  useDeleteReportStep,
  useReportSteps,
  useSaveReportStep,
  useStaffProfiles,
} from "@/hooks/useReports";
import { errorMessage } from "@/lib/reports";

/**
 * Einstellungen › Meldungen.
 *
 * Hier wird die Liste der Schritte gepflegt, aus der beim „Stand
 * aktualisieren“ gewählt wird. „Eingegangen“ und „Erledigt“ sind fest und
 * stehen deshalb nicht in der Liste.
 */
export function ReportSettings() {
  return (
    <div className="space-y-6">
      <StepsCard />
      <ExportCard />
    </div>
  );
}

function StepsCard() {
  const { data: steps = [], isLoading } = useReportSteps(true);
  const save = useSaveReportStep();
  const remove = useDeleteReportStep();

  const move = async (index: number, dir: -1 | 1) => {
    const a = steps[index];
    const b = steps[index + dir];
    if (!a || !b) return;
    try {
      await save.mutateAsync({ id: a.id, label: a.label, status: a.status, sort_order: b.sort_order });
      await save.mutateAsync({ id: b.id, label: b.label, status: b.status, sort_order: a.sort_order });
    } catch (e) {
      toast.error(errorMessage(e, "Reihenfolge nicht gespeichert"));
    }
  };

  const add = () => {
    const max = steps.reduce((m, s) => Math.max(m, s.sort_order), 0);
    save.mutate(
      { label: "Neuer Schritt", status: "in_progress", default_text: "", sort_order: max + 10 },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schritte für den Melder</CardTitle>
        <p className="text-sm text-muted-foreground">
          Aus dieser Liste wird beim „Stand aktualisieren“ gewählt. Jeder Schritt gehört zu einem Grundstatus, damit die
          Ordner im Postfach stimmen. Der Text ist ein Vorschlag und kann beim Eintragen geändert werden. „Eingegangen“
          (automatisch) und „Erledigt“ (Knopf „Erledigen“) sind fest.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden …
          </div>
        ) : (
          steps.map((s, i) => (
            <StepRow
              key={s.id}
              step={s}
              first={i === 0}
              last={i === steps.length - 1}
              onMove={(dir) => move(i, dir)}
              onSave={(patch) =>
                save.mutate({ ...s, ...patch }, { onError: (e) => toast.error(errorMessage(e)) })
              }
              onDelete={() =>
                remove.mutate(s.id, {
                  onSuccess: () => toast.success(`„${s.label}“ entfernt`),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            />
          ))
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={add} disabled={save.isPending}>
          <Plus className="h-3.5 w-3.5" /> Schritt hinzufügen
        </Button>
      </CardContent>
    </Card>
  );
}

function StepRow({
  step,
  first,
  last,
  onMove,
  onSave,
  onDelete,
}: {
  step: ReportStep;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: Partial<ReportStep>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(step.label);
  const [text, setText] = useState(step.default_text);
  useEffect(() => setLabel(step.label), [step.label]);
  useEffect(() => setText(step.default_text), [step.default_text]);

  return (
    <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_150px_minmax(0,1.6fr)_auto] md:items-center">
      <Input
        value={label}
        aria-label="Bezeichnung"
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== step.label && onSave({ label: label.trim() })}
      />
      <Select value={step.status} onValueChange={(v) => onSave({ status: v })}>
        <SelectTrigger aria-label="Grundstatus">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="in_progress">In Bearbeitung</SelectItem>
          <SelectItem value="waiting">Wartet</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={text}
        aria-label="Vorschlagstext für den Melder"
        placeholder="Vorschlagstext für den Melder"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== step.default_text && onSave({ default_text: text })}
      />
      <div className="flex items-center gap-1">
        <label className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground" title="Melder darf bei diesem Schritt antworten">
          <Switch checked={step.asks_reply} onCheckedChange={(v) => onSave({ asks_reply: v })} />
          Rückfrage
        </label>
        <label className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground" title="In der Auswahl anzeigen">
          <Switch checked={step.is_active} onCheckedChange={(v) => onSave({ is_active: v })} />
          Aktiv
        </label>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={first} onClick={() => onMove(-1)} title="Nach oben">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={last} onClick={() => onMove(1)} title="Nach unten">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete} title="Entfernen">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ExportCard() {
  const { data: staff = [] } = useStaffProfiles();
  const [busy, setBusy] = useState(false);

  const exportExcel = async () => {
    setBusy(true);
    try {
      const { data, error } = await reportsDb
        .from("reports")
        .select("*, building:buildings(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = ((data || []) as unknown as (ReportRow & { building: { name: string } | null })[]).map((r) => ({
        Nummer: r.report_number,
        Eingang: new Date(r.created_at).toLocaleDateString("de-DE"),
        Gebäude: r.building?.name || "",
        Bereich: r.management_mode === "rent" ? "Miete" : "WEG",
        Kanal: REPORT_CHANNEL_LABEL[r.channel as ReportChannel] || r.channel,
        Betreff: r.title,
        Beschreibung: r.description || "",
        Melder: r.contact_name || "",
        "E-Mail": r.contact_email || "",
        Telefon: r.contact_phone || "",
        Status: REPORT_STATUS_LABEL[r.status as ReportStatus] || r.status,
        Stand: currentStandOf(r),
        Zuständig: r.assigned_to ? staffName(staff.find((s) => s.user_id === r.assigned_to)) : "",
        "Erledigt am": r.resolved_at ? new Date(r.resolved_at).toLocaleDateString("de-DE") : "",
        Grund: r.resolved_reason || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Meldungen");
      XLSX.writeFile(wb, `Meldungen_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${rows.length} Meldungen exportiert`);
    } catch (e) {
      toast.error(errorMessage(e, "Export fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <p className="text-sm text-muted-foreground">Alle Meldungen als Excel-Tabelle, z. B. für die Versammlung oder den Beirat.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" className="gap-1.5" onClick={exportExcel} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Meldungen exportieren
        </Button>
        <p className="text-xs text-muted-foreground">
          Antwortvorlagen für Meldungen werden bei den E-Mail-Vorlagen verwaltet (Kategorie „Meldungen“). E-Mail-
          Benachrichtigungen für Melder kommen später zentral für die ganze App.
        </p>
      </CardContent>
    </Card>
  );
}
