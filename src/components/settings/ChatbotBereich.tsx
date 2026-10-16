/**
 * Einstellungen › Chatbot: Verhalten (Anweisung), Wissen und bisherige
 * Gespräche des Assistenten im Eigentümer- und Mieterportal.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, Download, Loader2, MessageCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { KnowledgeDocumentsManager } from "@/components/chatbot/KnowledgeDocumentsManager";

const STANDARD = "Sie sind ein hilfreicher Assistent für die Immobilienverwaltung.";

interface Gespraech {
  id: string;
  started_at: string;
  management_mode: "rent" | "weg";
  person: string;
  email?: string;
  haus?: string;
  nachrichten: number;
}

async function gespraecheLaden(): Promise<Gespraech[]> {
  const { data: s } = await supabase.from("chatbot_sessions").select("id, started_at, user_id, building_id, management_mode").order("started_at", { ascending: false }).limit(300);
  if (!s?.length) return [];
  const [{ data: p }, { data: b }, { data: m }] = await Promise.all([
    supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", [...new Set(s.map((x) => x.user_id))]),
    supabase.from("buildings").select("id, name").in("id", [...new Set(s.map((x) => x.building_id).filter(Boolean) as string[])]),
    supabase.from("chatbot_messages").select("session_id").in("session_id", s.map((x) => x.id)),
  ]);
  const anzahl: Record<string, number> = {};
  (m ?? []).forEach((x) => (anzahl[x.session_id] = (anzahl[x.session_id] ?? 0) + 1));
  return s.map((x) => {
    const pr = p?.find((y) => y.user_id === x.user_id);
    return {
      id: x.id,
      started_at: x.started_at,
      management_mode: x.management_mode as "rent" | "weg",
      person: pr ? [pr.first_name, pr.last_name].filter(Boolean).join(" ") || pr.email : "Unbekannt",
      email: pr?.email,
      haus: b?.find((y) => y.id === x.building_id)?.name,
      nachrichten: anzahl[x.id] ?? 0,
    };
  });
}

export function ChatbotBereich() {
  const [anweisung, setAnweisung] = useState(STANDARD);
  const [gespeichert, setGespeichert] = useState(STANDARD);
  const [suche, setSuche] = useState("");
  const [auswahl, setAuswahl] = useState<Gespraech | null>(null);

  useEffect(() => {
    supabase
      .from("chatbot_settings")
      .select("system_prompt")
      .eq("management_mode", "weg")
      .maybeSingle()
      .then(({ data }) => {
        const t = data?.system_prompt || STANDARD;
        setAnweisung(t);
        setGespeichert(t);
      });
  }, []);

  const speichern = async () => {
    const { error } = await supabase.from("chatbot_settings").upsert(
      [
        { system_prompt: anweisung, management_mode: "weg" as const },
        { system_prompt: anweisung, management_mode: "rent" as const },
      ],
      { onConflict: "management_mode" },
    );
    if (error) return toast.error("Speichern fehlgeschlagen: " + error.message);
    setGespeichert(anweisung);
    toast.success("Anweisung gespeichert");
  };

  const { data: gespraeche = [], isLoading } = useQuery({ queryKey: ["chatbot-gespraeche"], queryFn: gespraecheLaden });
  const { data: nachrichten = [], isFetching: laedtNachrichten } = useQuery({
    queryKey: ["chatbot-nachrichten", auswahl?.id],
    enabled: !!auswahl,
    queryFn: async () => {
      const { data } = await supabase.from("chatbot_messages").select("id, content, role, created_at").eq("session_id", auswahl!.id).order("created_at");
      return data ?? [];
    },
  });

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return s ? gespraeche.filter((g) => [g.person, g.email, g.haus].some((x) => x?.toLowerCase().includes(s))) : gespraeche;
  }, [gespraeche, suche]);

  const exportieren = async () => {
    const ids = gespraeche.map((g) => g.id);
    if (!ids.length) return;
    const { data: alle } = await supabase.from("chatbot_messages").select("session_id, role, content, created_at").in("session_id", ids).order("created_at");
    const zeilen = [["Datum", "Person", "E-Mail", "Bereich", "Liegenschaft", "Von", "Nachricht"]];
    gespraeche.forEach((g) =>
      (alle ?? [])
        .filter((n) => n.session_id === g.id)
        .forEach((n) =>
          zeilen.push([
            format(new Date(n.created_at), "dd.MM.yyyy HH:mm"),
            g.person,
            g.email ?? "",
            g.management_mode === "rent" ? "Miete" : "WEG",
            g.haus ?? "",
            n.role === "user" ? "Person" : "Chatbot",
            `"${n.content.replace(/"/g, '""')}"`,
          ]),
        ),
    );
    const blob = new Blob(["﻿" + zeilen.map((z) => z.join(";")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chatbot-gespraeche-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">So soll sich der Chatbot verhalten</CardTitle>
          <CardDescription>Eine kurze Anweisung in eigenen Worten, z. B. Ton, Rolle und was er nicht beantworten soll. Gilt für Eigentümer und Mieter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={anweisung} onChange={(e) => setAnweisung(e.target.value)} rows={5} />
          <div className="flex justify-end">
            <Button onClick={speichern} disabled={anweisung === gespeichert || !anweisung.trim()}>
              Speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      <KnowledgeDocumentsManager />

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4" /> Gespräche
            </CardTitle>
            <CardDescription>{gespraeche.length} Gespräche, neueste zuerst</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportieren} disabled={!gespraeche.length}>
            <Download className="h-4 w-4" /> Als Tabelle (CSV)
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid border-t md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className={cn("border-r", auswahl && "hidden md:block")}>
              <div className="relative border-b p-3">
                <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name, E-Mail oder Liegenschaft" className="pl-9" />
              </div>
              <div className="max-h-[440px] overflow-y-auto">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : gefiltert.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Keine Gespräche</div>
                ) : (
                  gefiltert.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setAuswahl(g)}
                      className={cn(
                        "block w-full border-b px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/40",
                        auswahl?.id === g.id && "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{g.person}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(g.started_at), "dd.MM.yy HH:mm", { locale: de })}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {g.management_mode === "rent" ? "Miete" : "WEG"}
                        {g.haus ? ` · ${g.haus}` : ""} · {g.nachrichten} Nachrichten
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className={cn("min-h-[300px]", !auswahl && "hidden md:block")}>
              {auswahl ? (
                <div>
                  <div className="flex items-center gap-2 border-b px-4 py-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setAuswahl(null)} aria-label="Zurück">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{auswahl.person}</div>
                      <div className="truncate text-xs text-muted-foreground">{auswahl.email}</div>
                    </div>
                  </div>
                  <div className="max-h-[440px] space-y-4 overflow-y-auto p-4">
                    {laedtNachrichten ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      nachrichten.map((n) => (
                        <ChatMessage key={n.id} message={{ id: n.id, content: n.content, isBot: n.role === "assistant", timestamp: new Date(n.created_at) }} />
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground">Links ein Gespräch auswählen</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
