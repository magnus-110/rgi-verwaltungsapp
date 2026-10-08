import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  REPORT_FOLDER_LABEL,
  ReportFolder,
  folderOfStatus,
  useReport,
  useReportFilterOptions,
  useReportList,
  useReportSearch,
  useReportsLive,
  useStaffProfiles,
} from "@/hooks/useReports";
import { CreateReportDialog } from "./CreateReportDialog";
import { ReportDetail } from "./ReportDetail";
import { ReportList } from "./ReportList";

interface Props {
  folder: ReportFolder;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onFolderChange: (folder: ReportFolder) => void;
  onOpenEmail: (emailId: string) => void;
}

/**
 * Meldungen im Postfach: Liste links, Meldung rechts — derselbe Aufbau wie
 * bei E-Mails. Am Handy sieht man entweder die Liste oder die Meldung.
 */
export function ReportsPanel({ folder, selectedId, onSelect, onFolderChange, onOpenEmail }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Standard: nur eigene und noch nicht zugeordnete Meldungen. Abgehakt: alle.
  const [onlyMine, setOnlyMine] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [movedTo, setMovedTo] = useState<string | null>(null);
  // Filter im Ordner „Erledigt“ — dort sammeln sich mit der Zeit viele Meldungen.
  const [filterBuilding, setFilterBuilding] = useState("all");
  const [filterContact, setFilterContact] = useState("all");
  const withFilters = folder === "done";
  useEffect(() => {
    setFilterBuilding("all");
    setFilterContact("all");
  }, [folder]);
  const { data: filterOptions } = useReportFilterOptions(withFilters ? folder : null);

  useReportsLive("postfach");
  const { data: staff = [] } = useStaffProfiles();
  const staffMap = useMemo(() => new Map(staff.map((s) => [s.user_id, s])), [staff]);

  const searching = search.trim().length >= 2;
  const { data: folderReports = [], isLoading } = useReportList(
    searching ? null : folder,
    withFilters
      ? {
          buildingId: filterBuilding === "all" ? null : filterBuilding,
          contactName: filterContact === "all" ? null : filterContact,
        }
      : {},
  );
  const { data: found = [], isLoading: searchLoading } = useReportSearch(search);
  const reports = useMemo(() => {
    const base = searching ? found : folderReports;
    return onlyMine && !searching
      ? base.filter((r) => !r.assigned_to || r.assigned_to === user?.id)
      : base;
  }, [searching, found, folderReports, onlyMine, user?.id]);

  // Ändert sich durch eine Aktion der Status, wandert die Meldung in einen
  // anderen Ordner. Die Ansicht geht mit, damit man sie nicht aus den Augen verliert.
  const { data: selected } = useReport(selectedId);
  useEffect(() => {
    if (!selected || searching) return;
    const target = folderOfStatus(selected.status);
    if (target !== folder) {
      setMovedTo(REPORT_FOLDER_LABEL[target]);
      onFolderChange(target);
    }
  }, [selected?.status, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!movedTo) return;
    const t = setTimeout(() => setMovedTo(null), 4000);
    return () => clearTimeout(t);
  }, [movedTo]);

  return (
    <>
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanel
          defaultSize={35}
          minSize={20}
          maxSize={60}
          className={cn(selectedId ? "hidden md:block" : "block", "h-full overflow-hidden")}
        >
          <ReportList
            folder={folder}
            reports={reports}
            loading={searching ? searchLoading : isLoading}
            selectedId={selectedId}
            onSelect={(id) => onSelect(id)}
            staff={staffMap}
            onlyMine={onlyMine}
            onOnlyMineChange={setOnlyMine}
            search={search}
            onSearchChange={setSearch}
            onNew={() => setCreateOpen(true)}
            onSettings={() => navigate("/settings?tab=meldungen")}
            movedTo={movedTo}
            filters={
              withFilters
                ? {
                    buildingId: filterBuilding,
                    contactName: filterContact,
                    onBuildingChange: setFilterBuilding,
                    onContactChange: setFilterContact,
                    buildings: filterOptions?.buildings ?? [],
                    contacts: filterOptions?.contacts ?? [],
                  }
                : null
            }
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="hidden w-1.5 bg-border transition-colors hover:bg-primary/40 md:flex" />
        <ResizablePanel
          defaultSize={65}
          className={cn(selectedId ? "block" : "hidden md:block", "h-full min-h-0 overflow-hidden")}
        >
          {selectedId ? (
            <ReportDetail
              reportId={selectedId}
              staff={staff}
              staffMap={staffMap}
              onBack={() => onSelect(null)}
              onOpenEmail={onOpenEmail}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ClipboardList className="h-10 w-10 opacity-40" />
              <p className="text-sm">Wähle eine Meldung aus</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      <CreateReportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(r) => {
          onFolderChange("open");
          onSelect(r.id);
        }}
      />
    </>
  );
}
