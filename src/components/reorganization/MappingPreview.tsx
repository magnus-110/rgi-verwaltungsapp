import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  X,
  FileText,
  Loader2,
  Play,
} from "lucide-react";

interface AgentResult {
  agent_id: string;
  found_pages: number[];
  confidence_scores: Record<string, number>;
  justifications: Record<string, string>;
  agent?: {
    id: string;
    name: string;
    icon: string;
  };
}

interface MappingPreviewProps {
  jobId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MappingPreview({ jobId, onConfirm, onCancel }: MappingPreviewProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<AgentResult[]>([]);
  const [unassignedPages, setUnassignedPages] = useState<number[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadResults();
  }, [jobId]);

  const loadResults = async () => {
    setLoading(true);
    try {
      // Load job details
      const { data: job } = await supabase
        .from("reorganization_jobs")
        .select("total_pages, unassigned_pages")
        .eq("id", jobId)
        .single();

      if (job) {
        setTotalPages(job.total_pages || 0);
        setUnassignedPages(Array.isArray(job.unassigned_pages) ? job.unassigned_pages : []);
      }

      // Load agent search results with agent details
      const { data: searchResults } = await supabase
        .from("agent_search_results")
        .select(`
          agent_id,
          found_pages,
          confidence_scores,
          justifications,
          agent:reorganization_agents(id, name, icon)
        `)
        .eq("job_id", jobId)
        .eq("status", "complete");

      if (searchResults) {
        // Filter out agents with no pages found
        const filtered = searchResults
          .filter((r: any) => r.found_pages && r.found_pages.length > 0)
          .map((r: any) => ({
            agent_id: r.agent_id,
            found_pages: r.found_pages || [],
            confidence_scores: r.confidence_scores || {},
            justifications: r.justifications || {},
            agent: r.agent,
          }));
        setResults(filtered);
        
        // Auto-expand agents with low confidence pages
        const toExpand = new Set<string>();
        filtered.forEach((r: AgentResult) => {
          const hasLowConfidence = r.found_pages.some(
            p => (r.confidence_scores[String(p)] || 0) < 0.7
          );
          if (hasLowConfidence) {
            toExpand.add(r.agent_id);
          }
        });
        setExpandedAgents(toExpand);
      }
    } catch (error) {
      console.error("Error loading results:", error);
      toast({
        title: "Fehler",
        description: "Ergebnisse konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      // Update job to proceed with splitting
      await supabase
        .from("reorganization_jobs")
        .update({
          awaiting_review: false,
          status: "splitting",
          current_phase: "PDFs werden erstellt...",
          progress: 90,
        })
        .eq("id", jobId);

      // Trigger the split function
      await supabase.functions.invoke("split-merge-pdf", {
        body: { jobId },
      });

      toast({
        title: "PDF-Erstellung gestartet",
        description: "Die Dokumente werden jetzt erstellt.",
      });

      onConfirm();
    } catch (error) {
      console.error("Error confirming:", error);
      toast({
        title: "Fehler",
        description: "Konnte nicht fortfahren",
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-green-600";
    if (confidence >= 0.7) return "text-yellow-600";
    return "text-red-600";
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.9) return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (confidence >= 0.7) return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    return <HelpCircle className="h-4 w-4 text-red-600" />;
  };

  const toggleExpanded = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const assignedCount = results.reduce((sum, r) => sum + r.found_pages.length, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Mapping-Vorschau</CardTitle>
            <CardDescription>
              Überprüfen Sie die Zuordnungen bevor die PDFs erstellt werden
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              {assignedCount} von {totalPages} Seiten zugeordnet
            </div>
            <Progress 
              value={(assignedCount / Math.max(totalPages, 1)) * 100} 
              className="w-32"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-3">
            {results.map((result) => {
              const isExpanded = expandedAgents.has(result.agent_id);
              const avgConfidence = result.found_pages.length > 0
                ? result.found_pages.reduce((sum, p) => 
                    sum + (result.confidence_scores[String(p)] || 0), 0
                  ) / result.found_pages.length
                : 0;

              return (
                <Collapsible
                  key={result.agent_id}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(result.agent_id)}
                >
                  <div className="border rounded-lg">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium">
                            {result.agent?.name || "Unbekannter Agent"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {result.found_pages.length} Seiten gefunden
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="secondary" 
                            className={getConfidenceColor(avgConfidence)}
                          >
                            Ø {Math.round(avgConfidence * 100)}%
                          </Badge>
                          {avgConfidence < 0.7 && (
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t px-4 py-3 space-y-2 bg-muted/20">
                        {result.found_pages.map((page) => {
                          const confidence = result.confidence_scores[String(page)] || 0;
                          const justification = result.justifications[String(page)] || "Keine Begründung verfügbar";

                          return (
                            <div
                              key={page}
                              className="flex items-start gap-3 p-3 bg-background rounded-lg border"
                            >
                              <div className="flex items-center gap-2 min-w-[80px]">
                                {getConfidenceIcon(confidence)}
                                <span className="font-mono text-sm">S. {page}</span>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Progress 
                                    value={confidence * 100} 
                                    className="h-2 w-20"
                                  />
                                  <span className={`text-sm font-medium ${getConfidenceColor(confidence)}`}>
                                    {Math.round(confidence * 100)}%
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {justification}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}

            {/* Unassigned pages */}
            {unassignedPages.length > 0 && (
              <Collapsible defaultOpen={unassignedPages.length <= 10}>
                <div className="border rounded-lg border-dashed border-yellow-500/50">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <div className="w-8 h-8 rounded bg-yellow-500/10 flex items-center justify-center text-yellow-600">
                        <HelpCircle className="h-4 w-4" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-yellow-700">
                          Nicht zugeordnet
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {unassignedPages.length} Seiten ohne Kategorie
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t px-4 py-3 bg-yellow-500/5">
                      <p className="text-sm text-muted-foreground mb-2">
                        Diese Seiten wurden keiner Kategorie zugeordnet:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {unassignedPages.slice(0, 50).map((page) => (
                          <Badge key={page} variant="outline" className="font-mono">
                            {page}
                          </Badge>
                        ))}
                        {unassignedPages.length > 50 && (
                          <Badge variant="secondary">
                            +{unassignedPages.length - 50} weitere
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            {confirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird erstellt...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                PDFs erstellen
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}