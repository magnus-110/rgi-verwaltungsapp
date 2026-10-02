import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CASE_STATUS_LABEL, CaseRow } from "@/hooks/useCases";
import { CreateCaseDialog } from "@/components/cases/CreateCaseDialog";
import { cn } from "@/lib/utils";
import { Report, useLinkReportToCase } from "@/hooks/useReports";
import { errorMessage } from "@/lib/reports";

interface Props {
  report: Report;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Meldung einem Vorgang zuordnen — einem bestehenden aus demselben Gebäude
 * oder einem neuen. Melden mehrere Leute denselben Schaden, landen alle
 * Meldungen im selben Vorgang.
 */
export function ReportCaseDialog({ report, open, onOpenChange }: Props) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const link = useLinkReportToCase();

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["cases-for-report", report.building_id],
    enabled: open && !!report.building_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("building_id", report.building_id!)
        .not("status", "in", "(archived,resolved)")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as CaseRow[];
    },
  });

  const q = search.trim().toLowerCase();
  const filtered = cases.filter(
    (c) => !q || c.title.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q),
  );

  const pick = async (c: { id: string; title: string }, created = false) => {
    setBusyId(c.id);
    try {
      await link.mutateAsync({ report, caseId: c.id, caseTitle: c.title, created });
      toast.success(created ? "Vorgang angelegt und verknüpft" : `Dem Vorgang „${c.title}“ zugeordnet`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Konnte nicht zugeordnet werden"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Dialog open={open && !createOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Einem Vorgang zuordnen</DialogTitle>
            <DialogDescription>
              {report.report_number} · {report.building?.name || "ohne Gebäude"}
            </DialogDescription>
          </DialogHeader>

          {!report.building_id ? (
            <p className="text-sm text-muted-foreground">
              Die Meldung hat kein Gebäude. Vorgänge gehören immer zu einem Gebäude.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Vorgang suchen …"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Offene Vorgänge in {report.building?.name}
              </p>
              <ScrollArea className="h-[260px] rounded-md border">
                {isLoading ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden …
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Keine offenen Vorgänge.</p>
                ) : (
                  <div className="divide-y">
                    {filtered.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => pick(c)}
                        disabled={!!busyId}
                        className={cn(
                          "flex w-full items-start gap-2.5 p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60",
                          report.case_id === c.id && "bg-primary/5",
                        )}
                      >
                        <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.title}</p>
                          {c.description && (
                            <p className="line-clamp-1 text-xs text-muted-foreground">{c.description}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[10.5px] text-muted-foreground">
                          {busyId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : CASE_STATUS_LABEL[c.status]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-dashed p-3 text-left text-sm hover:border-primary hover:bg-primary/5"
              >
                <Plus className="h-4 w-4 text-primary" />
                <span>
                  Neuen Vorgang aus dieser Meldung anlegen
                  <span className="block text-xs text-muted-foreground">Titel: „{report.title}“</span>
                </span>
              </button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {createOpen && report.building_id && (
        <CreateCaseDialog
          key={report.id}
          open={createOpen}
          onOpenChange={(v) => setCreateOpen(v)}
          buildingId={report.building_id}
          lockBuilding
          managementMode={report.management_mode}
          defaults={{ title: report.title, description: report.description || "" }}
          onCreated={(c) => pick({ id: c.id, title: c.title }, true)}
        />
      )}
    </>
  );
}
