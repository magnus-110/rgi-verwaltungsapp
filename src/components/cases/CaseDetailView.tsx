import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, RefreshCw, Loader2, Pencil, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { useCase, useCaseEvents, useUpdateCase, useSummarizeCase, CASE_STATUS_LABEL, CASE_PRIORITY_LABEL, CASE_CATEGORY_LABEL, CaseStatus, CasePriority } from "@/hooks/useCases";
import { CaseTimeline } from "./CaseTimeline";
import { CaseQuickAdd } from "./CaseQuickAdd";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { toast } from "@/hooks/use-toast";

interface Props {
  caseId: string | null;
  onClose: () => void;
}

const PRIORITY_VARIANT: Record<CasePriority, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
};

export const CaseDetailView = ({ caseId, onClose }: Props) => {
  const { data: caseRow, isLoading } = useCase(caseId);
  const { data: events = [] } = useCaseEvents(caseId);
  const update = useUpdateCase();
  const summarize = useSummarizeCase();
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const { managementMode } = useManagementMode();
  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-case-edit", managementMode],
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

  const handleBuildingChange = async (newBuildingId: string) => {
    if (!caseRow || newBuildingId === caseRow.building_id) return;
    try {
      await update.mutateAsync({ id: caseRow.id, building_id: newBuildingId } as any);
      toast({ title: "Liegenschaft geändert" });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (caseRow && !editingMeta) {
      setDraftTitle(caseRow.title);
      setDraftDescription(caseRow.description || "");
    }
  }, [caseRow?.id, caseRow?.title, caseRow?.description, editingMeta]);

  const saveMeta = async () => {
    if (!caseRow) return;
    await update.mutateAsync({ id: caseRow.id, title: draftTitle.trim() || caseRow.title, description: draftDescription.trim() || null });
    setEditingMeta(false);
  };

  const cancelMeta = () => {
    if (caseRow) {
      setDraftTitle(caseRow.title);
      setDraftDescription(caseRow.description || "");
    }
    setEditingMeta(false);
  };

  return (
    <Sheet open={!!caseId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-5xl p-0 overflow-hidden flex flex-col">
        {isLoading || !caseRow ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editingMeta ? (
                    <div className="space-y-2">
                      <Input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="Titel"
                        className="text-base font-semibold h-9"
                      />
                      <Textarea
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        placeholder="Beschreibung (optional)"
                        rows={3}
                        className="text-sm"
                      />
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={cancelMeta}>
                          <X className="h-3 w-3 mr-1" />Abbrechen
                        </Button>
                        <Button size="sm" onClick={saveMeta} disabled={update.isPending}>
                          {update.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                          Speichern
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="group cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-muted/50 transition-colors"
                      onClick={() => setEditingMeta(true)}
                      title="Klicken zum Bearbeiten"
                    >
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold truncate">{caseRow.title}</h2>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </div>
                      {caseRow.description ? (
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{caseRow.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground/60 mt-1 italic">Beschreibung hinzufügen…</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Select value={caseRow.status} onValueChange={(v) => update.mutate({ id: caseRow.id, status: v as CaseStatus })}>
                      <SelectTrigger className="h-7 w-auto text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant={PRIORITY_VARIANT[caseRow.priority]}>{CASE_PRIORITY_LABEL[caseRow.priority]}</Badge>
                    <Badge variant="outline">{CASE_CATEGORY_LABEL[caseRow.category]}</Badge>
                    {caseRow.unit_number && <Badge variant="outline">Einheit {caseRow.unit_number}</Badge>}
                    <Select value={caseRow.building_id} onValueChange={handleBuildingChange}>
                      <SelectTrigger className="h-7 w-auto text-xs min-w-[160px]">
                        <SelectValue placeholder="Liegenschaft" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {buildings.map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_300px]">
              {/* Timeline */}
              <div className="overflow-y-auto p-4 space-y-3">
                <CaseQuickAdd caseId={caseRow.id} buildingId={caseRow.building_id} />
                <CaseTimeline events={events} caseId={caseRow.id} buildingId={caseRow.building_id} />
              </div>

              {/* Sidebar */}
              <div className="border-l bg-muted/20 overflow-y-auto p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Status
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => summarize.mutate(caseRow.id)} disabled={summarize.isPending}>
                      {summarize.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                  </div>
                  {caseRow.ai_summary ? (
                    <div className="text-sm bg-card p-3 rounded-lg border">
                      <p className="leading-snug whitespace-pre-wrap">
                        {caseRow.ai_summary
                          .split(/##\s*N[äa]chste Schritte/i)[0]
                          .replace(/##\s*Status\s*/gi, "")
                          .replace(/^#{1,6}\s+/gm, "")
                          .replace(/\*\*(.+?)\*\*/g, "$1")
                          .replace(/\*(.+?)\*/g, "$1")
                          .replace(/__(.+?)__/g, "$1")
                          .trim()}
                      </p>
                      {caseRow.ai_summary_updated_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Aktualisiert {formatDistanceToNow(new Date(caseRow.ai_summary_updated_at), { addSuffix: true, locale: de })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground bg-card p-3 rounded-lg border">
                      Noch keine Zusammenfassung. Klicke auf <RefreshCw className="h-3 w-3 inline" /> nach den ersten Ereignissen.
                    </p>
                  )}
                </div>
              </div>
            </div>

          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
