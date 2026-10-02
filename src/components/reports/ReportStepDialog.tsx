import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Report, ReportStep, hasPortalAccess, useAddReportStep, useReportSteps } from "@/hooks/useReports";
import { CheckRow } from "./reportUi";
import { errorMessage } from "@/lib/reports";

interface Props {
  report: Report;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * „Stand aktualisieren“ — es wird nur der Schritt eingetragen, der gerade
 * passiert ist. Künftige Schritte kündigt die App nicht an; sie ändern sich
 * zu oft (z. B. wenn sich herausstellt, dass es Sondereigentum ist).
 */
export function ReportStepDialog({ report, open, onOpenChange }: Props) {
  const { data: steps = [] } = useReportSteps();
  const add = useAddReportStep();
  const [step, setStep] = useState<ReportStep | null>(null);
  const [text, setText] = useState("");
  const [allowReply, setAllowReply] = useState(false);
  const portal = hasPortalAccess(report);
  const firstName = (report.contact_name || "Melder").split(" ")[0];

  useEffect(() => {
    if (open) {
      setStep(null);
      setText("");
      setAllowReply(false);
    }
  }, [open]);

  const choose = (s: ReportStep) => {
    setStep(s);
    setText(s.default_text);
    setAllowReply(portal && s.asks_reply);
  };

  const save = async () => {
    if (!step) {
      toast.error("Bitte einen Schritt wählen");
      return;
    }
    try {
      await add.mutateAsync({
        report,
        label: step.label,
        status: step.status as "in_progress" | "waiting",
        text,
        allowReply: portal && allowReply,
      });
      toast.success(portal ? "Stand im Portal eingetragen" : "Stand eingetragen");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Konnte nicht gespeichert werden"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stand aktualisieren</DialogTitle>
          <DialogDescription>Nur den Schritt eintragen, der gerade passiert ist.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Was ist passiert?</p>
            <div className="flex flex-wrap gap-1.5">
              {steps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => choose(s)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                    step?.id === s.id
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "hover:bg-muted",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", s.status === "waiting" ? "bg-sky-600" : "bg-primary")} />
                  {s.label}
                </button>
              ))}
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground">Noch keine Schritte angelegt.</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="report-step-text">
              Text für {portal ? firstName : "den Verlauf"}
            </label>
            <Textarea
              id="report-step-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Schritt wählen, Text bei Bedarf anpassen"
            />
          </div>

          {portal && (
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <p className="text-muted-foreground">So sieht es {firstName} im Portal</p>
              <p className="text-sm font-semibold">{step?.label || "—"}</p>
              {text && <p className="text-foreground/80">{text}</p>}
            </div>
          )}

          {portal ? (
            <CheckRow checked={allowReply} onChange={setAllowReply}>
              Rückfrage: {firstName} darf im Portal antworten
            </CheckRow>
          ) : (
            <p className="text-xs text-muted-foreground">
              {firstName} hat keinen Portalzugang. Der Stand steht nur im Verlauf; für eine Rückmeldung bitte eine
              Nachricht per E-Mail schicken.
            </p>
          )}
          <p className="rounded-md bg-muted/40 px-3 py-2 text-[11.5px] text-muted-foreground">
            Eine E-Mail-Benachrichtigung zum neuen Stand kommt später, zusammen mit den anderen Benachrichtigungen der App.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/settings?tab=meldungen">
              <Settings2 className="h-3.5 w-3.5" /> Schritte verwalten
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={save} disabled={add.isPending || !step}>
              {add.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Eintragen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
