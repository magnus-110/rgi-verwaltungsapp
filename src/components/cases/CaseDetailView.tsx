import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, RefreshCw, Loader2, X, ListChecks } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import { useCase, useCaseEvents, useUpdateCase, useSummarizeCase, CASE_STATUS_LABEL, CASE_PRIORITY_LABEL, CASE_CATEGORY_LABEL, CaseStatus, CasePriority } from "@/hooks/useCases";
import { CaseTimeline } from "./CaseTimeline";
import { CaseQuickAdd } from "./CaseQuickAdd";
import { CaseAskAi } from "./CaseAskAi";

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
                  <h2 className="text-lg font-semibold truncate">{caseRow.title}</h2>
                  {caseRow.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{caseRow.description}</p>
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
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_300px]">
              {/* Timeline */}
              <div className="overflow-y-auto p-4 space-y-3">
                <CaseQuickAdd caseId={caseRow.id} buildingId={caseRow.building_id} />
                <CaseTimeline events={events} />
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
                      <p className="leading-snug">{caseRow.ai_summary}</p>
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

                {caseRow.ai_next_steps && caseRow.ai_next_steps.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ListChecks className="h-4 w-4 text-primary" />
                      Nächste Schritte
                    </div>
                    <ol className="text-sm bg-card p-3 rounded-lg border space-y-1.5 list-decimal list-inside">
                      {caseRow.ai_next_steps.map((s, i) => (
                        <li key={i} className="leading-snug">{s}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {caseRow.ai_keywords && caseRow.ai_keywords.length > 0 && (
                  <div className="border-t pt-4">
                    <div className="text-sm font-medium mb-2">Schlagworte</div>
                    <div className="flex flex-wrap gap-1">
                      {caseRow.ai_keywords.map((k) => (
                        <Badge key={k} variant="outline" className="text-xs">{k}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Floating chat */}
            <CaseAskAi caseId={caseRow.id} buildingId={caseRow.building_id} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
