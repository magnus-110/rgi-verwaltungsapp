import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Check } from "lucide-react";
import { ANNUAL_CYCLE_TASKS, buildFiscalYears, STATUS_LABEL, type AnnualCycleStatus } from "@/lib/annualCycle";
import { cn } from "@/lib/utils";

// Simplified milestones for owners (subset of admin cycle)
const OWNER_MILESTONES = [
  "jahresabrechnung_erstellt",
  "wirtschaftsplan_erstellt",
  "etv_einberufen",
  "etv_protokoll_fertig",
  "paragraph_35a_versendet",
  "hausgeldanpassung_umgesetzt",
];

interface Building { id: string; name: string }

interface Props { buildings: Building[] }

export const OwnerAnnualCycleWidget = ({ buildings }: Props) => {
  const fiscalYears = useMemo(() => buildFiscalYears(), []);
  const [selectedYear, setSelectedYear] = useState(fiscalYears[2]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedBuildingId && buildings.length > 0) setSelectedBuildingId(buildings[0].id);
  }, [buildings, selectedBuildingId]);

  const { data: tasks = [] } = useQuery({
    queryKey: ["owner-annual-cycle", selectedBuildingId, selectedYear.start],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      const { data } = await supabase
        .from("annual_cycle_tasks")
        .select("task_key, status, completed_at")
        .eq("building_id", selectedBuildingId)
        .eq("fiscal_year_start", selectedYear.start);
      return (data || []) as { task_key: string; status: AnnualCycleStatus; completed_at: string | null }[];
    },
    enabled: !!selectedBuildingId,
  });

  const byKey = useMemo(() => {
    const m = new Map<string, AnnualCycleStatus>();
    tasks.forEach((t) => m.set(t.task_key, t.status));
    return m;
  }, [tasks]);

  const milestones = OWNER_MILESTONES
    .map((key) => ANNUAL_CYCLE_TASKS.find((t) => t.key === key))
    .filter((t): t is { key: string; label: string } => !!t);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
              <CalendarClock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Jahreszyklus</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Aktueller Bearbeitungsstand</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {buildings.length > 1 && (
              <Select value={selectedBuildingId ?? undefined} onValueChange={setSelectedBuildingId}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Gebäude" /></SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={selectedYear.start}
              onValueChange={(v) => setSelectedYear(fiscalYears.find((f) => f.start === v) ?? fiscalYears[2])}
            >
              <SelectTrigger className="h-8 w-[88px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {fiscalYears.map((fy) => (
                  <SelectItem key={fy.start} value={fy.start}>{fy.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Horizontal timeline */}
        <div className="relative">
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
            {milestones.map((m, idx) => {
              const status = byKey.get(m.key) ?? "open";
              const isDone = status === "done";
              const isInProgress = status === "in_progress";
              const isLast = idx === milestones.length - 1;
              return (
                <div key={m.key} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center gap-1.5 flex-shrink-0 px-1">
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center border-2 transition-colors",
                        isDone && "bg-emerald-500 border-emerald-500 text-white",
                        isInProgress && "bg-orange-500/20 border-orange-500 text-orange-700",
                        !isDone && !isInProgress && "bg-muted border-muted-foreground/30 text-muted-foreground"
                      )}
                      title={`${m.label}: ${STATUS_LABEL[status]}`}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : (
                        <span className={cn("h-2 w-2 rounded-full", isInProgress ? "bg-orange-500" : "bg-muted-foreground/40")} />
                      )}
                    </div>
                    <span className={cn(
                      "text-[10px] leading-tight text-center max-w-[68px]",
                      isDone ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>{m.label}</span>
                  </div>
                  {!isLast && (
                    <div className={cn(
                      "h-0.5 flex-1 mt-[-18px] mx-0.5 rounded",
                      isDone ? "bg-emerald-500" : "bg-muted-foreground/20"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
