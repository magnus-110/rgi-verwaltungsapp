import { useState } from "react";
import { Sparkles, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

interface Props {
  caseId: string;
  buildingId: string;
}

export const CaseAskAi = ({ caseId, buildingId }: Props) => {
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setA(null);
    try {
      // Build local case context
      const { data: events } = await supabase
        .from("case_events")
        .select("event_type, occurred_at, title, body")
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: true })
        .limit(50);

      const caseContext = (events || [])
        .map((e: any) => `[${new Date(e.occurred_at).toLocaleDateString("de-DE")}] ${e.event_type}: ${e.title || ""}${e.body ? " — " + e.body : ""}`)
        .join("\n")
        .substring(0, 4000);

      const { data, error } = await supabase.functions.invoke("query-documents", {
        body: {
          query: q,
          building_id: buildingId,
          additional_context: `Vorgangs-Kontext:\n${caseContext}`,
          case_id: caseId,
        },
      });
      if (error) throw error;
      setA((data as any)?.answer || (data as any)?.response || "Keine Antwort.");
    } catch (e: any) {
      setA(`Fehler: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        Frag den Vorgang
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="z.B. Wer ist der Versicherer?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          disabled={loading}
        />
        <Button size="icon" onClick={ask} disabled={loading || !q.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {a && (
        <div className="text-sm bg-muted p-3 rounded-lg prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown>{a}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};
