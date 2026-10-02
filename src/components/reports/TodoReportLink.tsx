import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { reportsDb } from "@/integrations/supabase/reports";
import { currentStandOf } from "@/hooks/useReports";

/** Auf der Aufgabenseite: Rückweg zur Meldung, aus der die Aufgabe entstanden ist. */
export function TodoReportLink({ sourceType, sourceId }: { sourceType?: string | null; sourceId?: string | null }) {
  const enabled = sourceType === "report" && !!sourceId;
  const { data: report } = useQuery({
    queryKey: ["reports", "one-lite", sourceId],
    enabled,
    queryFn: async () => {
      const { data } = await reportsDb
        .from("reports")
        .select("id, report_number, title, status, current_step")
        .eq("id", sourceId!)
        .maybeSingle();
      return data;
    },
  });
  if (!enabled || !report) return null;
  return (
    <Link
      to={`/postfach?meldung=${report.id}`}
      className="flex items-center gap-2.5 rounded-[11px] border border-primary/25 bg-primary/5 px-4 py-2.5 text-[13px] transition-colors hover:bg-primary/10"
    >
      <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">
        Aus Meldung <span className="font-semibold">{report.report_number}</span> · {report.title}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{currentStandOf(report)} · zur Meldung</span>
    </Link>
  );
}
