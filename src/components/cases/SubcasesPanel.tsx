import { useState } from "react";
import { Plus, GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubcases, CASE_STATUS_LABEL, CaseStatus, ManagementMode } from "@/hooks/useCases";
import { CreateCaseDialog } from "./CreateCaseDialog";
import { cn } from "@/lib/utils";

interface Props {
  parentCaseId: string;
  buildingId: string;
  managementMode: ManagementMode;
  onOpenSubcase: (id: string) => void;
}

const STATUS_DOT: Record<CaseStatus, string> = {
  open: "bg-destructive",
  in_progress: "bg-primary",
  waiting_external: "bg-muted-foreground",
  waiting_owner: "bg-muted-foreground",
  resolved: "bg-success",
  archived: "bg-muted-foreground",
};

export const SubcasesPanel = ({ parentCaseId, buildingId, managementMode, onOpenSubcase }: Props) => {
  const { data: subs = [], isLoading } = useSubcases(parentCaseId);
  const [createOpen, setCreateOpen] = useState(false);

  const openCount = subs.filter((s) => s.status !== "resolved" && s.status !== "archived").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="h-4 w-4 text-primary" />
          Teilvorgänge
          {subs.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {openCount}/{subs.length}
            </Badge>
          )}
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCreateOpen(true)} title="Teilvorgang anlegen">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : subs.length === 0 ? (
        <p className="text-xs text-muted-foreground bg-card p-3 rounded-lg border">
          Keine Teilvorgänge. Lege bei Bedarf einen separaten Strang an (z.B. Versicherung, Handwerker).
        </p>
      ) : (
        <div className="space-y-1 bg-card rounded-lg border overflow-hidden">
          {subs.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpenSubcase(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 text-left transition-colors border-b last:border-b-0"
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT[s.status])} />
              <span className="text-sm truncate flex-1">{s.title}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{CASE_STATUS_LABEL[s.status]}</span>
            </button>
          ))}
        </div>
      )}

      <CreateCaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        buildingId={buildingId}
        managementMode={managementMode}
        forcedParentId={parentCaseId}
        onCreated={(c) => onOpenSubcase(c.id)}
      />
    </div>
  );
};
