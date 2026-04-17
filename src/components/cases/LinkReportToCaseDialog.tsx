import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search } from "lucide-react";
import { useAddCaseEvent, CASE_STATUS_LABEL, CaseRow } from "@/hooks/useCases";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  report: { id: string; title: string; description?: string | null; contact_name?: string | null };
  tableName: "weg_reports" | "miete_reports";
  onLinked?: () => void;
}

export const LinkReportToCaseDialog = ({ open, onOpenChange, buildingId, report, tableName, onLinked }: Props) => {
  const [search, setSearch] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const addEvent = useAddCaseEvent();
  const { toast } = useToast();

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["cases-for-link", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("building_id", buildingId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as CaseRow[];
    },
    enabled: open && !!buildingId,
  });

  const filtered = cases.filter(c =>
    !search || c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const linkToCase = async (caseRow: CaseRow) => {
    setLinkingId(caseRow.id);
    try {
      const { error } = await supabase.from(tableName).update({ case_id: caseRow.id } as any).eq("id", report.id);
      if (error) throw error;
      try {
        await addEvent.mutateAsync({
          case_id: caseRow.id,
          event_type: "note",
          title: "Meldung verknüpft",
          body: `Meldung: ${report.title}\n${report.description || ""}${report.contact_name ? `\n\nKontakt: ${report.contact_name}` : ""}`,
          source_table: tableName,
          source_id: report.id,
          trigger_summary: false,
        });
      } catch (e) { console.error(e); }
      toast({ title: "Verknüpft", description: `Meldung wurde Vorgang "${caseRow.title}" zugeordnet.` });
      onLinked?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Meldung einem Vorgang zuordnen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Vorgang suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-[360px] border rounded-md">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Laden...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                Keine Vorgänge gefunden
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => linkToCase(c)}
                    disabled={linkingId !== null}
                    className="w-full text-left p-3 hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{c.title}</p>
                        {c.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge variant="outline" className="text-[10px]">{CASE_STATUS_LABEL[c.status]}</Badge>
                        {linkingId === c.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
