import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Send, MessageCircle, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface Props {
  caseId: string;
  buildingId: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export const CaseAskAi = ({ caseId, buildingId }: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const ask = async () => {
    const question = q.trim();
    if (!question || loading) return;
    setLoading(true);
    setMessages((m) => [...m, { role: "user", content: question }]);
    setQ("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

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

      const fullQuestion = caseContext
        ? `Vorgangs-Kontext:\n${caseContext}\n\nFrage: ${question}`
        : question;

      const { data, error } = await supabase.functions.invoke("query-documents", {
        body: {
          sessionId: sessionIdRef.current,
          question: fullQuestion,
          buildingId: buildingId,
          buildingIds: [buildingId],
          includeGeneral: true,
          userId: user.id,
        },
      });
      if (error) throw error;
      const answer = (data as any)?.answer || (data as any)?.response || (data as any)?.message || "Keine Antwort.";
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Fehler: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="lg"
        className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg h-14 w-14 p-0"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-3rem)] bg-card border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-primary text-primary-foreground">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">Frag den Vorgang</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20" onClick={() => setOpen(false)}>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-muted/30">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground mt-8 px-4">
            Stelle Fragen zum Vorgang, z.B. „Wer ist der Versicherer?" oder „Was sind die nächsten Schritte?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2"
              )}
            >
              {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t bg-card">
        <div className="flex gap-1.5">
          <Input
            placeholder="Frage stellen..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), ask())}
            disabled={loading}
            className="text-sm"
          />
          <Button size="icon" onClick={ask} disabled={loading || !q.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
