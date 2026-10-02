import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { reportsDb } from "@/integrations/supabase/reports";
import { REPORT_FOLDER_LABEL, ReportFolder, ReportRow, currentStandOf, folderOfStatus } from "@/hooks/useReports";
import { ReportStatusBadge } from "@/components/reports/reportUi";
import { shortDate } from "@/lib/reports";

interface BuildingReportsTabProps {
  buildingId: string;
}

const ORDER: ReportFolder[] = ["open", "progress", "done"];

/**
 * Meldungen eines Gebäudes — nur zum Überblick. Bearbeitet werden sie im
 * Postfach; ein Klick öffnet die Meldung dort.
 */
export const BuildingReportsTab = ({ buildingId }: BuildingReportsTabProps) => {
  const navigate = useNavigate();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["reports", "building", buildingId],
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await reportsDb
        .from("reports")
        .select("*")
        .eq("building_id", buildingId)
        .order("last_activity_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden …
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">Keine Meldungen für dieses Gebäude.</p>
      </div>
    );
  }

  const grouped = ORDER.map((f) => ({ folder: f, items: reports.filter((r) => folderOfStatus(r.status) === f) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        {grouped.map((g) => (
          <span key={g.folder}>
            <span className="font-semibold text-foreground">{g.items.length}</span> {REPORT_FOLDER_LABEL[g.folder]}
          </span>
        ))}
      </div>

      {grouped
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.folder} className="space-y-2">
            <h4 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {REPORT_FOLDER_LABEL[g.folder]}
            </h4>
            <div className="divide-y rounded-lg border bg-card">
              {g.items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/postfach?meldung=${r.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.report_number} · {r.contact_name || "Unbekannt"} · {currentStandOf(r)}
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{shortDate(r.last_activity_at)}</span>
                  <ReportStatusBadge status={r.status} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ))}
      <p className="text-xs text-muted-foreground">Bearbeitet werden Meldungen im Postfach unter „Meldungen“.</p>
    </div>
  );
};
