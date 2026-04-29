import { useMemo, useState } from "react";
import { Plus, Search, Sparkles, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { useCases, CASE_STATUS_LABEL, CASE_PRIORITY_LABEL, CASE_CATEGORY_LABEL, CaseStatus, CasePriority } from "@/hooks/useCases";
import { CreateCaseDialog } from "@/components/cases/CreateCaseDialog";
import { CaseDetailView } from "@/components/cases/CaseDetailView";

interface Props {
  buildingId: string;
  managementMode: "weg" | "rent";
}

const PRIORITY_VARIANT: Record<CasePriority, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
};

const STATUS_DOT: Record<CaseStatus, string> = {
  open: "bg-blue-500",
  in_progress: "bg-amber-500",
  waiting_external: "bg-purple-500",
  waiting_owner: "bg-pink-500",
  resolved: "bg-green-500",
  archived: "bg-muted-foreground",
};

export const BuildingCasesTab = ({ buildingId, managementMode }: Props) => {
  const { data: cases = [], isLoading } = useCases(buildingId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (c.parent_case_id) return false; // Sub-Vorgänge in Buildings-Liste immer ausgeblendet
      if (statusFilter === "active" && (c.status === "resolved" || c.status === "archived")) return false;
      if (statusFilter !== "all" && statusFilter !== "active" && c.status !== statusFilter) return false;
      if (search && !`${c.title} ${c.description || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [cases, search, statusFilter]);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Vorgänge suchen..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Nur aktive</SelectItem>
                <SelectItem value="all">Alle</SelectItem>
                {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Neuer Vorgang
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Laden...</div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {cases.length === 0 ? "Noch keine Vorgänge. Lege den ersten an." : "Keine Vorgänge passen zum Filter."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <Card
                key={c.id}
                className="p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setSelectedId(c.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[c.status]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.title}</span>
                      {c.ai_summary && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            <p className="text-xs whitespace-pre-wrap">{c.ai_summary.substring(0, 400)}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{CASE_CATEGORY_LABEL[c.category]}</Badge>
                      <Badge variant="outline" className="text-xs">{CASE_STATUS_LABEL[c.status]}</Badge>
                      <Badge variant={PRIORITY_VARIANT[c.priority]} className="text-xs">{CASE_PRIORITY_LABEL[c.priority]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Aktiv {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: de })}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <CreateCaseDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          buildingId={buildingId}
          managementMode={managementMode}
          onCreated={(c) => setSelectedId(c.id)}
        />
        <CaseDetailView caseId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    </TooltipProvider>
  );
};
