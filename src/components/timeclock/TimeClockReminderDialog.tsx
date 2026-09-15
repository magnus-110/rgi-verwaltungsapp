import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTimeEntry, useClockIn, startOfToday } from "@/hooks/useTimeClock";
import { toast } from "sonner";

/**
 * Erinnert Verwaltungsmitarbeiter beim ersten Aufruf des Tages daran,
 * sich einzustempeln. Erscheint nicht, wenn die Uhr bereits laeuft oder
 * heute schon gestempelt wurde.
 */

const speicherSchluessel = (userId: string) => `timeclock_reminder_dismissed_${userId}`;

function heuteAlsText() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function heuteBereitsWeggeklickt(userId: string) {
  try {
    return localStorage.getItem(speicherSchluessel(userId)) === heuteAlsText();
  } catch {
    // Privater Modus oder gesperrter Speicher: dann lieber einmal zu viel fragen.
    return false;
  }
}

function fuerHeuteMerken(userId: string) {
  try {
    localStorage.setItem(speicherSchluessel(userId), heuteAlsText());
  } catch {
    /* ohne Speicher erscheint der Hinweis beim naechsten Seitenaufruf erneut */
  }
}

export function TimeClockReminderDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const { data: laufenderEintrag, isLoading: laufendLaedt } = useActiveTimeEntry();
  const clockIn = useClockIn();

  const { data: heuteSchonGestempelt, isLoading: heuteLaedt } = useQuery({
    queryKey: ["timeclock", "heute", userId],
    enabled: !!userId,
    // Innerhalb einer Sitzung reicht eine Abfrage; der Dialog soll nicht
    // mitten am Tag erneut aufpoppen.
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_clock_entries")
        .select("id")
        .eq("user_id", userId)
        .gte("started_at", startOfToday().toISOString())
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });

  useEffect(() => {
    if (!userId || laufendLaedt || heuteLaedt) return;
    if (laufenderEintrag) return;
    if (heuteSchonGestempelt) return;
    if (heuteBereitsWeggeklickt(userId)) return;
    setOpen(true);
  }, [userId, laufendLaedt, heuteLaedt, laufenderEintrag, heuteSchonGestempelt]);

  const spaeter = () => {
    fuerHeuteMerken(userId);
    setOpen(false);
  };

  const jetztEinstempeln = () => {
    clockIn.mutate(undefined, {
      onSuccess: () => {
        fuerHeuteMerken(userId);
        setOpen(false);
        toast.success("Eingestempelt. Ihre Arbeitszeit läuft.");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) spaeter(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Arbeitszeit erfassen</DialogTitle>
          <DialogDescription className="text-center">
            Sie haben sich heute noch nicht eingestempelt. Soll die Zeiterfassung jetzt starten?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button onClick={jetztEinstempeln} disabled={clockIn.isPending} className="w-full">
            <Play className="h-4 w-4 mr-2" />
            {clockIn.isPending ? "Wird gestartet…" : "Jetzt einstempeln"}
          </Button>
          <Button
            variant="ghost"
            onClick={spaeter}
            disabled={clockIn.isPending}
            className="w-full text-muted-foreground"
          >
            Heute nicht mehr erinnern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
