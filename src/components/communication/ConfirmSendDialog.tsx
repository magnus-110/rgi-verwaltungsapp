import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send, CalendarClock, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientCount: number;
  scheduledAt?: string; // ISO string or datetime-local value
  onConfirm: () => void;
}

export const ConfirmSendDialog = ({ open, onOpenChange, recipientCount, scheduledAt, onConfirm }: Props) => {
  const [phase, setPhase] = useState<1 | 2>(1);
  const [countdown, setCountdown] = useState(2);

  useEffect(() => {
    if (!open) {
      setPhase(1);
      setCountdown(2);
    }
  }, [open]);

  useEffect(() => {
    if (phase !== 2) return;
    setCountdown(2);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const isScheduled = !!scheduledAt;
  const whenStr = scheduledAt ? new Date(scheduledAt).toLocaleString("de-DE") : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {phase === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {isScheduled ? <CalendarClock className="h-5 w-5 text-primary" /> : <Send className="h-5 w-5 text-primary" />}
                {isScheduled ? "Versand planen?" : "Rundmail versenden?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  Du bist im Begriff, an{" "}
                  <strong className="text-foreground">{recipientCount} Empfänger</strong> zu senden
                  {isScheduled ? <> — geplant für <strong className="text-foreground">{whenStr}</strong></> : null}.
                </span>
                <span className="block text-xs">Diese Aktion kann nicht rückgängig gemacht werden.</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); setPhase(2); }}>
                Weiter
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Letzte Bestätigung
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isScheduled
                  ? <>Wirklich endgültig für <strong className="text-foreground">{whenStr}</strong> einplanen?</>
                  : <>Wirklich jetzt <strong className="text-foreground">endgültig</strong> an {recipientCount} Empfänger versenden?</>}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPhase(1)}>Zurück</AlertDialogCancel>
              <AlertDialogAction
                disabled={countdown > 0}
                onClick={(e) => { e.preventDefault(); onConfirm(); onOpenChange(false); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {countdown > 0
                  ? `Bitte warten (${countdown})…`
                  : isScheduled ? "Jetzt einplanen" : "Jetzt senden"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};
