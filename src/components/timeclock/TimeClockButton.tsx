import { useEffect, useState } from "react";
import { Play, Square, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useActiveTimeEntry,
  useClockIn,
  useClockOut,
  durationMinutes,
  fmtHMS,
} from "@/hooks/useTimeClock";
import { TimeClockPanel } from "./TimeClockPanel";
import { cn } from "@/lib/utils";

export function TimeClockButton() {
  const { data: active } = useActiveTimeEntry();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsedSec = active ? Math.floor((durationMinutes(active, now) * 60) + ((now - new Date(active.started_at).getTime()) / 1000) % 60) : 0;
  const liveSec = active ? Math.max(0, Math.floor((now - new Date(active.started_at).getTime()) / 1000)) : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        {active ? (
          <>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Meine Arbeitszeit"
                className={cn(
                  "group inline-flex items-center gap-2 rounded-full pl-3 pr-2 h-9",
                  "bg-emerald-50 text-emerald-700 border border-emerald-200",
                  "hover:bg-emerald-100 transition-colors"
                )}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="font-mono tabular-nums text-sm">{fmtHMS(liveSec)}</span>
              </button>
            </PopoverTrigger>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Ausstempeln"
              className="h-9 w-9 rounded-full text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100"
              onClick={() => active && clockOut.mutate(active.id)}
              disabled={clockOut.isPending}
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full gap-2 border-border/60"
              onClick={() => clockIn.mutate(undefined)}
              disabled={clockIn.isPending}
            >
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Einstempeln</span>
            </Button>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Meine Arbeitszeit"
                className="h-9 w-9 rounded-full text-muted-foreground"
              >
                <Clock className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </>
        )}
      </div>
      <PopoverContent align="end" className="w-[380px] p-0">
        <TimeClockPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
