import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, AlertTriangle, Check, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface BillingAiAnalysisProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

interface AiRecommendation {
  severity: "error" | "warning" | "info" | "success";
  area: string;
  title: string;
  description: string;
  suggestion: string;
}

export function BillingAiAnalysis({ buildingId, periodId, fiscalYear }: BillingAiAnalysisProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);

  const startAnalysis = async () => {
    setIsAnalyzing(true);
    setRecommendations([]);
    setSummary("");

    try {
      const { data, error } = await supabase.functions.invoke("analyze-billing", {
        body: { buildingId, periodId, fiscalYear },
      });

      if (error) throw error;

      if (data?.error) {
        if (data.error.includes("Rate limit") || data.error.includes("429")) {
          toast.error("Zu viele Anfragen — bitte versuche es in einer Minute erneut.");
        } else if (data.error.includes("402") || data.error.includes("Payment")) {
          toast.error("KI-Guthaben aufgebraucht. Bitte Guthaben aufladen.");
        } else {
          toast.error(data.error);
        }
        return;
      }

      setRecommendations(data?.recommendations || []);
      setSummary(data?.summary || "");
      setLastAnalyzed(new Date());
      toast.success("KI-Analyse abgeschlossen");
    } catch (e: any) {
      console.error("AI analysis error:", e);
      toast.error("Fehler bei der KI-Analyse: " + (e.message || "Unbekannter Fehler"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const SeverityIcon = ({ severity }: { severity: string }) => {
    switch (severity) {
      case "error": return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
      case "success": return <Check className="h-4 w-4 text-green-600 shrink-0" />;
      default: return <Bot className="h-4 w-4 text-blue-600 shrink-0" />;
    }
  };

  const severityBg: Record<string, string> = {
    error: "bg-red-50 border-red-200",
    warning: "bg-amber-50 border-amber-200",
    success: "bg-green-50 border-green-200",
    info: "bg-blue-50 border-blue-200",
  };

  const errorCount = recommendations.filter((r) => r.severity === "error").length;
  const warningCount = recommendations.filter((r) => r.severity === "warning").length;
  const successCount = recommendations.filter((r) => r.severity === "success").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-5 w-5" /> KI-Fehleranalyse
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Automatische Prüfung aller Abrechnungsdaten mit KI-Unterstützung
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastAnalyzed && (
            <span className="text-xs text-muted-foreground">
              Letzte Analyse: {lastAnalyzed.toLocaleTimeString("de-DE")}
            </span>
          )}
          <Button onClick={startAnalysis} disabled={isAnalyzing} size="sm">
            {isAnalyzing ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analysiere...</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-1" /> KI-Analyse starten</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isAnalyzing && (
          <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">KI analysiert Buchungen, Salden, Brennstoff und Verteilerschlüssel...</span>
          </div>
        )}

        {!isAnalyzing && recommendations.length === 0 && !summary && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Klicke "KI-Analyse starten", um alle Abrechnungsdaten automatisch prüfen zu lassen.
          </p>
        )}

        {summary && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm prose prose-sm max-w-none">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex gap-2 mb-2">
              {errorCount > 0 && <Badge className="bg-red-100 text-red-800">{errorCount} Fehler</Badge>}
              {warningCount > 0 && <Badge className="bg-amber-100 text-amber-800">{warningCount} Warnungen</Badge>}
              {successCount > 0 && <Badge className="bg-green-100 text-green-800">{successCount} OK</Badge>}
            </div>

            {recommendations.map((rec, i) => (
              <div key={i} className={`p-3 rounded-lg border ${severityBg[rec.severity] || severityBg.info}`}>
                <div className="flex items-start gap-2">
                  <SeverityIcon severity={rec.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{rec.title}</span>
                      <Badge variant="outline" className="text-[10px]">{rec.area}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.description}</p>
                    {rec.suggestion && (
                      <p className="text-sm mt-1 font-medium">💡 {rec.suggestion}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
