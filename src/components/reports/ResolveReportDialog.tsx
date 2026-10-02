import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { RESOLVE_REASONS, Report, hasPortalAccess, useReportTodos, useResolveReport } from "@/hooks/useReports";
import { CheckRow } from "./reportUi";
import { errorMessage } from "@/lib/reports";

const TEXT_FOR_REASON: Record<(typeof RESOLVE_REASONS)[number], string> = {
  Gelöst: "Ihr Anliegen ist erledigt. Vielen Dank für Ihre Meldung.",
  "Frage beantwortet": "Wir hoffen, Ihre Frage ist damit beantwortet. Vielen Dank für Ihre Nachricht.",
  "Nicht zuständig (Sondereigentum)":
    "Nach der Teilungserklärung gehört das betroffene Bauteil zu Ihrem Sondereigentum. Die Instandsetzung liegt daher bei Ihnen. Gerne nennen wir Ihnen einen Fachbetrieb.",
  "Doppelt gemeldet":
    "Der Schaden wurde bereits gemeldet und ist in Bearbeitung. Vielen Dank für Ihren Hinweis.",
};

interface Props {
  report: Report;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ResolveReportDialog({ report, open, onOpenChange }: Props) {
  const resolve = useResolveReport();
  const { data: todos = [] } = useReportTodos(open ? report.id : null);
  const { openCompose } = useComposeEmail();
  const openTodos = todos.filter((t) => t.status !== "done");
  const portal = hasPortalAccess(report);
  const [reason, setReason] = useState<(typeof RESOLVE_REASONS)[number]>("Gelöst");
  const [message, setMessage] = useState(TEXT_FOR_REASON["Gelöst"]);
  const [viaEmail, setViaEmail] = useState(false);
  const [closeTodos, setCloseTodos] = useState(true);

  useEffect(() => {
    if (open) {
      setReason("Gelöst");
      setMessage(TEXT_FOR_REASON["Gelöst"]);
      setViaEmail(!portal && !!report.contact_email);
      setCloseTodos(true);
    }
  }, [open, portal, report.contact_email]);

  const save = async () => {
    try {
      await resolve.mutateAsync({ report, reason, message, closeTodos: closeTodos && openTodos.length > 0 });
      if (viaEmail && report.contact_email && message.trim()) {
        openCompose({
          prefill: {
            to: report.contact_email,
            subject: `[${report.report_number}] ${report.title}`,
            bodyText: message.trim(),
          },
        });
      }
      toast.success("Meldung erledigt");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Konnte nicht erledigt werden"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Meldung erledigen</DialogTitle>
          <DialogDescription>
            {report.report_number} · {report.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Grund</p>
            <Select
              value={reason}
              onValueChange={(v) => {
                const r = v as (typeof RESOLVE_REASONS)[number];
                setReason(r);
                setMessage(TEXT_FOR_REASON[r]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLVE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="report-resolve-text">
              Abschluss-Nachricht an {report.contact_name || "den Melder"}
            </label>
            <Textarea id="report-resolve-text" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
            <p className="text-xs text-muted-foreground">
              {portal
                ? "Erscheint im Eigentümerportal. Antworten ist danach nicht mehr möglich."
                : "Kein Portalzugang — die Nachricht steht im Verlauf und kann per E-Mail verschickt werden."}
            </p>
          </div>

          <CheckRow checked={viaEmail} onChange={setViaEmail} disabled={!report.contact_email}>
            {portal ? "Zusätzlich als E-Mail senden" : "Als E-Mail senden"}
            {!report.contact_email && " (keine Adresse hinterlegt)"}
          </CheckRow>
          {openTodos.length > 0 && (
            <CheckRow checked={closeTodos} onChange={setCloseTodos}>
              {openTodos.length === 1
                ? `Verknüpfte Aufgabe „${openTodos[0].title}“ ebenfalls erledigen`
                : `${openTodos.length} verknüpfte Aufgaben ebenfalls erledigen`}
            </CheckRow>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={resolve.isPending} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Erledigen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
