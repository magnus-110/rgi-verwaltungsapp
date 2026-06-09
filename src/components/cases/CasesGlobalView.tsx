import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAllCases, useUpdateCase, useDeleteCase, CASE_STATUS_LABEL, CaseStatus, CaseWithBuilding } from "@/hooks/useCases";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CaseDetailView } from "./CaseDetailView";
import { CreateCaseDialog } from "./CreateCaseDialog";
import { Search, LayoutList, Columns, Plus, Building2, Clock, MessageSquare, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow, format, isPast } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type ViewMode = "list" | "board";

const STATUS_ORDER: CaseStatus[] = ["open", "in_progress", "waiting_external", "waiting_owner", "resolved"];

const STATUS_DOT: Record<CaseStatus, string> = {
  open: "bg-destructive",
  in_progress: "bg-primary",
  waiting_external: "bg-warning",
  waiting_owner: "bg-warning",
  resolved: "bg-success",
  archived: "bg-muted-foreground",
};

const STATUS_BADGE: Record<CaseStatus, string> = {
  open: "bg-destructive/10 text-destructive border-destructive/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  waiting_external: "bg-muted text-muted-foreground border-border",
  waiting_owner: "bg-muted text-muted-foreground border-border",
  resolved: "bg-success/10 text-success border-success/30",
  archived: "bg-muted text-muted-foreground border-border",
};

const useBuildingsForFilter = (managementMode: "weg" | "rent") => {
  return useQuery({
    queryKey: ["buildings-tickets-filter", managementMode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name")
        .eq("management_mode", managementMode)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
};

export const CasesGlobalView = () => {
  const { managementMode } = useManagementMode();
  const navigate = useNavigate();
  const { data: cases = [], isLoading } = useAllCases(managementMode);
  const { data: buildings = [] } = useBuildingsForFilter(managementMode);
  const updateCase = useUpdateCase();
  const deleteCase = useDeleteCase();
  const [deleteTarget, setDeleteTarget] = useState<CaseWithBuilding | null>(null);

  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all_open");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBuildingId, setCreateBuildingId] = useState<string>("");

  const filtered = useMemo(() => {
    const list = cases.filter((c) => {
      if (buildingFilter !== "all" && c.building_id !== buildingFilter) return false;
      if (statusFilter === "all_open" && c.status === "resolved") return false;
      if (statusFilter !== "all_open" && statusFilter !== "all" && c.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const hay = `${c.title} ${c.description || ""} ${c.buildings?.name || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const aOver = a.due_at && isPast(new Date(a.due_at)) && a.status !== "resolved" && a.status !== "archived" ? 1 : 0;
      const bOver = b.due_at && isPast(new Date(b.due_at)) && b.status !== "resolved" && b.status !== "archived" ? 1 : 0;
      if (aOver !== bOver) return bOver - aOver;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [cases, buildingFilter, statusFilter, search]);

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    cases.forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    });
    return byStatus;
  }, [cases]);

  const openCreate = () => {
    setCreateBuildingId(buildingFilter !== "all" ? buildingFilter : "");
    setCreateOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Vorgänge durchsuchen…"
            className="pl-9 h-10"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="h-10 w-[180px]"><SelectValue placeholder="Gebäude" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gebäude</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all_open">Aktive (ohne Erledigt)</SelectItem>
              <SelectItem value="all">Alle Status</SelectItem>
              {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>



          {/* View toggle */}
          <div className="flex border border-border rounded-md overflow-hidden h-10">
            <Button
              type="button"
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none h-full px-3"
              onClick={() => setView("list")}
            >
              <LayoutList className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Liste</span>
            </Button>
            <Button
              type="button"
              variant={view === "board" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none h-full px-3 border-l border-border"
              onClick={() => setView("board")}
            >
              <Columns className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Board</span>
            </Button>
          </div>

          <Button className="h-10" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Neuer Vorgang</span>
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {STATUS_ORDER.map((s) => (
          <Card key={s} className="px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{CASE_STATUS_LABEL[s]}</div>
            <div className="text-xl font-semibold mt-0.5">{counts[s] || 0}</div>
          </Card>
        ))}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Keine Vorgänge gefunden.
            {cases.length === 0 && " Lege den ersten Vorgang an."}
          </p>
        </Card>
      ) : view === "list" ? (
        <CasesList items={filtered} onOpen={setSelectedCaseId} onChangeStatus={(id, status) => updateCase.mutate({ id, status })} onDelete={(c) => setDeleteTarget(c)} />
      ) : (
        <CasesBoard items={filtered} onOpen={setSelectedCaseId} onChangeStatus={(id, status) => updateCase.mutate({ id, status })} onDelete={(c) => setDeleteTarget(c)} />
      )}

      <CaseDetailView caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} />

      <CreateCaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        buildingId={createBuildingId || undefined}
        managementMode={managementMode}
        onCreated={(c) => setSelectedCaseId(c.id)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorgang löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>„{deleteTarget.title}" wird unwiderruflich gelöscht – inklusive aller Verlaufseinträge und KI-Zusammenfassungen.</>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteCase.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ======================== List ========================
interface ListProps {
  items: CaseWithBuilding[];
  onOpen: (id: string) => void;
  onChangeStatus: (id: string, status: CaseStatus) => void;
  onDelete: (c: CaseWithBuilding) => void;
}

const CasesList = ({ items, onOpen, onChangeStatus, onDelete }: ListProps) => {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {items.map((c) => {
          const overdue = c.due_at && isPast(new Date(c.due_at)) && c.status !== "resolved" && c.status !== "archived";
          const summary = c.ai_summary
            ? c.ai_summary.replace(/^#{1,6}\s+/gm, "").replace(/\*\*?/g, "").split("\n").find((l) => l.trim())
            : null;
          return (
            <div
              key={c.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer group"
              onClick={() => onOpen(c.id)}
            >
              <span
                className={cn("h-2.5 w-2.5 rounded-full shrink-0 mt-2", STATUS_DOT[c.status])}
                title={CASE_STATUS_LABEL[c.status]}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold leading-snug truncate">{c.title}</h3>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Select value={c.status} onValueChange={(v) => onChangeStatus(c.id, v as CaseStatus)}>
                      <SelectTrigger className={cn("h-7 text-xs border px-2 gap-1 w-auto", STATUS_BADGE[c.status])}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onDelete(c)}
                      aria-label="Vorgang löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{c.buildings?.name || "—"}{c.unit_number ? ` · WE ${c.unit_number}` : ""}</span>
                  </span>
                  {c.events_count > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />{c.events_count}
                    </span>
                  )}
                  {c.due_at && (
                    <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}>
                      <Clock className="h-3.5 w-3.5" />
                      {overdue ? "Überfällig " : "Fällig "}
                      {format(new Date(c.due_at), "dd.MM.yy", { locale: de })}
                    </span>
                  )}
                  <span>· aktualisiert {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: de })}</span>
                </div>
                {summary && (
                  <p className="text-xs text-muted-foreground/90 truncate mt-1">{summary}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// ======================== Board ========================
const CasesBoard = ({ items, onOpen, onChangeStatus, onDelete }: ListProps) => {
  const grouped = useMemo(() => {
    const g: Record<CaseStatus, CaseWithBuilding[]> = {
      open: [], in_progress: [], waiting_external: [], waiting_owner: [], resolved: [], archived: [],
    };
    items.forEach((c) => g[c.status]?.push(c));
    return g;
  }, [items]);

  return (
    <div className="grid grid-flow-col auto-cols-[280px] gap-3 overflow-x-auto pb-2 lg:auto-cols-fr">
      {STATUS_ORDER.map((status) => {
        const list = grouped[status];
        return (
          <div key={status} className="flex flex-col bg-muted/30 rounded-lg border border-border min-h-[120px]">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between sticky top-0 bg-muted/30 backdrop-blur z-10">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CASE_STATUS_LABEL[status]}
              </div>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{list.length}</Badge>
            </div>
            <div className="p-2 space-y-2 flex-1">
              {list.map((c) => {
                const overdue = c.due_at && isPast(new Date(c.due_at)) && status !== "resolved";
                return (
                  <Card
                    key={c.id}
                    className="p-2.5 cursor-pointer hover:shadow-md transition-shadow group relative"
                    onClick={() => onOpen(c.id)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); onDelete(c); }}
                      aria-label="Vorgang löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex items-start gap-2 pr-6">
                      <span className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", STATUS_DOT[c.status])} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug line-clamp-2">{c.title}</div>
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground min-w-0">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{c.buildings?.name || "—"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-2 text-[11px]">
                      {c.events_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />{c.events_count}
                        </span>
                      )}
                      {c.due_at && (
                        <span className={cn("inline-flex items-center gap-0.5", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                          <Clock className="h-3 w-3" />
                          {format(new Date(c.due_at), "dd.MM.", { locale: de })}
                        </span>
                      )}
                    </div>
                    {/* Quick status change */}
                    <div onClick={(e) => e.stopPropagation()} className="mt-2">
                      <Select value={c.status} onValueChange={(v) => onChangeStatus(c.id, v as CaseStatus)}>
                        <SelectTrigger className="h-7 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </Card>
                );
              })}
              {list.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-6">Keine Vorgänge</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
