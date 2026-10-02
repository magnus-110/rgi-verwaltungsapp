import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  Report,
  StaffProfile,
  staffName,
  suggestTaskFromReport,
  useCreateTaskFromReport,
} from "@/hooks/useReports";
import { CheckRow } from "./reportUi";
import { errorMessage } from "@/lib/reports";

interface Props {
  report: Report;
  staff: StaffProfile[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Aufgabe aus einer Meldung. Mistral schlägt Titel und Beschreibung vor;
 * alles bleibt änderbar. Die Meldung bleibt offen und mit der Aufgabe
 * verknüpft.
 */
export function ReportTaskDialog({ report, staff, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const create = useCreateTaskFromReport();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [due, setDue] = useState("");
  const [toWall, setToWall] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [aiState, setAiState] = useState<"idle" | "ok" | "failed">("idle");

  useEffect(() => {
    if (!open) return;
    setTitle(report.title);
    setDescription(report.description || "");
    setAssignee(report.assigned_to || user?.id || "");
    setDue("");
    setToWall(true);
    setAiState("idle");
    let cancelled = false;
    setThinking(true);
    suggestTaskFromReport(report.id)
      .then((s) => {
        if (cancelled) return;
        if (s.title) setTitle(s.title);
        if (s.description) setDescription(s.description);
        setAiState("ok");
      })
      .catch(() => !cancelled && setAiState("failed"))
      .finally(() => !cancelled && setThinking(false));
    return () => {
      cancelled = true;
    };
    // Nur beim Öffnen — spätere Aktualisierungen der Meldung sollen Eingaben nicht überschreiben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, report.id]);

  const save = async () => {
    if (!title.trim() || !assignee) {
      toast.error("Bitte Titel und Zuständigkeit angeben");
      return;
    }
    try {
      await create.mutateAsync({
        report,
        title,
        description,
        assignedTo: assignee,
        dueDate: due || null,
        pinToWall: toWall,
        assigneeName: staffName(staff.find((s) => s.user_id === assignee)),
      });
      toast.success(toWall ? "Aufgabe erstellt und an die Wand gehängt" : "Aufgabe erstellt — sie liegt im Vorrat");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Aufgabe konnte nicht erstellt werden"));
    }
  };

  const mine = assignee === user?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aufgabe aus Meldung erstellen</DialogTitle>
          <DialogDescription>
            {report.report_number} · {report.building?.name || "ohne Gebäude"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-primary">
            {thinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {thinking
              ? "Mistral fasst die Meldung zusammen …"
              : aiState === "ok"
                ? "Vorschlag von Mistral. Du kannst alles ändern."
                : aiState === "failed"
                  ? "Kein KI-Vorschlag möglich — Titel und Text der Meldung übernommen."
                  : ""}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="report-task-title">
              Titel
            </label>
            {thinking ? <Skeleton className="h-9 w-full" /> : (
              <Input id="report-task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="report-task-desc">
              Beschreibung
            </label>
            {thinking ? <Skeleton className="h-24 w-full" /> : (
              <Textarea id="report-task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Zuständig</p>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder="Person wählen" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {staffName(p)}
                      {p.user_id === user?.id ? " (ich)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="report-task-due">
                Fällig am
              </label>
              <Input id="report-task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          <CheckRow checked={toWall} onChange={setToWall}>
            {mine ? "Gleich an meine Wand hängen" : "Gleich an die Wand der zuständigen Person hängen"} (sonst liegt sie
            im Vorrat)
          </CheckRow>
          <p className="text-xs text-muted-foreground">
            Die Meldung bleibt offen. Ist die Aufgabe erledigt, steht das im Verlauf der Meldung.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={create.isPending || thinking}>
            {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Aufgabe erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
