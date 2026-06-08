import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check } from "lucide-react";
import { ANNUAL_CYCLE_TASKS, buildFiscalYears, type AnnualCycleStatus } from "@/lib/annualCycle";
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

const STATUS_TEXT: Record<AnnualCycleStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Erledigt",
};

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
    const m = new Map<string, { status: AnnualCycleStatus; completed_at: string | null }>();
    tasks.forEach((t) => m.set(t.task_key, { status: t.status, completed_at: t.completed_at }));
    return m;
  }, [tasks]);

  const milestones = OWNER_MILESTONES
    .map((key) => ANNUAL_CYCLE_TASKS.find((t) => t.key === key))
    .filter((t): t is { key: string; label: string } => !!t);

  return (
    <section>
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80">
          Jahreszyklus {selectedYear.label}
        </h2>
        <div className="flex items-center gap-2">
          {buildings.length > 1 && (
            <Select value={selectedBuildingId ?? undefined} onValueChange={setSelectedBuildingId}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Gebäude" /></SelectTrigger>
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
            <SelectTrigger className="h-8 w-[84px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fiscalYears.map((fy) => (
                <SelectItem key={fy.start} value={fy.start}>{fy.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-[14px] border border-border/60 overflow-hidden shadow-sm">
        {milestones.map((m, idx) => {
          const entry = byKey.get(m.key);
          const status: AnnualCycleStatus = entry?.status ?? "open";
          const isDone = status === "done";
          const isProgress = status === "in_progress";
          const completedDate = entry?.completed_at
            ? new Date(entry.completed_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
            : null;
          const subtitle = isDone
            ? completedDate ? `Erledigt am ${completedDate}` : "Erledigt"
            : STATUS_TEXT[status];
          return (
            <div key={m.key}>
              {idx > 0 && <div className="h-px bg-foreground/[0.055]" />}
              <div className="flex items-center gap-4 px-4 py-3.5 min-h-[64px]">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2",
                    isDone && "bg-emerald-500 border-emerald-500 text-white",
                    isProgress && "bg-orange-500/15 border-orange-500 text-orange-700",
                    !isDone && !isProgress && "bg-muted border-muted-foreground/25 text-muted-foreground"
                  )}
                  aria-label={STATUS_TEXT[status]}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : isProgress ? (
                    <span className="h-2 w-2 rounded-full bg-orange-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-[15px] leading-tight",
                    isDone ? "text-foreground font-medium" : "text-foreground font-medium"
                  )}>
                    {m.label}
                  </div>
                  <div className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
