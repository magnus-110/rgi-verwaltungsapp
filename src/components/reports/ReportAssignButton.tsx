import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Report, StaffProfile, staffFirstName, staffName, useAssignReport } from "@/hooks/useReports";
import { StaffAvatar } from "./reportUi";
import { errorMessage } from "@/lib/reports";

interface Props {
  report: Report;
  staff: StaffProfile[];
  disabled?: boolean;
}

/**
 * Zuständigkeit — wie bei E-Mails über das Kürzel. Wer an jemand anderen
 * übergibt, schreibt dazu, was zu tun ist; das steht dann als interner
 * Eintrag im Verlauf und die Person bekommt einen Hinweis.
 */
export function ReportAssignButton({ report, staff, disabled }: Props) {
  const { user } = useAuth();
  const assign = useAssignReport();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<StaffProfile | null>(null);
  const [note, setNote] = useState("");
  const current = staff.find((s) => s.user_id === report.assigned_to) || null;

  const pick = (p: StaffProfile | null) => {
    setOpen(false);
    if (!p) {
      assign.mutate(
        { report, userId: null },
        { onSuccess: () => toast.success("Zuständigkeit entfernt"), onError: (e) => toast.error(errorMessage(e)) },
      );
      return;
    }
    if (p.user_id === report.assigned_to) return;
    setNote("");
    setTarget(p);
  };

  const confirm = async () => {
    if (!target) return;
    try {
      await assign.mutateAsync({ report, userId: target.user_id, note });
      toast.success(target.user_id === user?.id ? "Du bist jetzt zuständig" : `An ${staffFirstName(target)} übergeben`);
      setTarget(null);
    } catch (e) {
      toast.error(errorMessage(e, "Konnte nicht übergeben werden"));
    }
  };

  const self = target?.user_id === user?.id;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pl-0.5 pr-2.5 text-xs hover:bg-muted disabled:opacity-60"
            title="Zuständigkeit"
          >
            <StaffAvatar profile={current} empty={!current} />
            {current ? staffFirstName(current) : "Zuständig …"}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-1.5">
          <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Zuständig machen
          </p>
          {staff.map((p) => (
            <button
              key={p.user_id}
              onClick={() => pick(p)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
            >
              <StaffAvatar profile={p} />
              <span className="flex-1 truncate">
                {staffName(p)}
                {p.user_id === user?.id && " (ich)"}
              </span>
              {p.user_id === report.assigned_to && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
          {current && (
            <button
              onClick={() => pick(null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-muted"
            >
              <StaffAvatar empty /> Niemand
            </button>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{self ? "Selbst übernehmen" : `An ${staffFirstName(target)} übergeben`}</DialogTitle>
            <DialogDescription>
              {report.report_number} · {report.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="report-assign-note">
              {self ? "Notiz für dich (optional)" : `Was soll ${staffFirstName(target)} tun?`}
            </label>
            <Textarea
              id="report-assign-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder={self ? "z. B. Montag mit dem Hausmeister ansehen" : "z. B. Installateur anrufen, Schlüssel liegt im Büro."}
            />
            <p className="text-xs text-muted-foreground">
              Wird als interne Notiz gespeichert. Der Melder sieht das nicht.
              {!self && ` ${staffFirstName(target)} bekommt einen Hinweis in der App.`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Abbrechen
            </Button>
            <Button onClick={confirm} disabled={assign.isPending}>
              {assign.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {self ? "Übernehmen" : "Übergeben"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
