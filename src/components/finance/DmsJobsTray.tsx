import { useState } from "react";
import { useDmsJobs } from "@/contexts/DmsJobsProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FolderUp, X, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export function DmsJobsTray() {
  const { jobs, clearDone, remove, activeCount } = useDmsJobs();
  const [open, setOpen] = useState(true);

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[90vw]">
      <Card className="shadow-lg border-2">
        <button
          className="w-full flex items-center justify-between px-3 py-2 border-b bg-muted/30"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <FolderUp className="h-4 w-4" />
            DMS-Ablage
            {activeCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {activeCount}
              </Badge>
            )}
          </div>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        {open && (
          <div className="max-h-[60vh] overflow-y-auto divide-y">
            {jobs.map((j) => {
              const pct = j.total > 0 ? Math.round(((j.completed + j.failed) / j.total) * 100) : 0;
              return (
                <div key={j.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate flex-1">{j.label}</div>
                    {j.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {j.status === "done" && j.failed === 0 && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    {(j.status === "error" || (j.status === "done" && j.failed > 0)) && (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    {(j.status === "done" || j.status === "error") && (
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => remove(j.id)}
                        aria-label="Entfernen"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <div className="text-xs text-muted-foreground">
                    {j.completed + j.failed} / {j.total}
                    {j.failed > 0 && <span className="text-amber-600 ml-2">{j.failed} Fehler</span>}
                  </div>
                  {j.errors.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-amber-700">Fehlerdetails</summary>
                      <ul className="mt-1 list-disc pl-4 space-y-0.5 text-muted-foreground">
                        {j.errors.slice(0, 6).map((e, i) => (
                          <li key={i} className="break-words">{e}</li>
                        ))}
                        {j.errors.length > 6 && <li>…und {j.errors.length - 6} weitere</li>}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {jobs.some((j) => j.status === "done" || j.status === "error") && (
          <div className="px-3 py-1.5 border-t flex justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearDone}>
              Erledigte ausblenden
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
