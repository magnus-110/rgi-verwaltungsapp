/**
 * Eigentümerportal › Fragen: Fragen zum Haus, beantwortet aus den Unterlagen.
 * Das ganze Gespräch geht als Zusammenhang mit (die Edge Function lädt den Verlauf der Sitzung).
 * Jede Antwort lässt sich mit einem Klick an die Verwaltung weitergeben.
 */
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AlertCircle, ArrowUp, Building2, Check, FileText, Loader2, MessageCircleQuestion, Plus, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { reportsDb } from "@/integrations/supabase/reports";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VoiceInputButton } from "@/components/shared/VoiceInputButton";
import { PortalSeitenkopf } from "@/components/weg-owner/PortalListe";
import type { ChatSource, ReportDraft } from "@/components/chat/ChatMessage";

interface Nachricht {
  id: string;
  text: string;
  vonMir: boolean;
  quellen?: ChatSource[];
  entwurf?: ReportDraft | null;
  entwurfStatus?: "gesendet" | "fehler";
  weitergegeben?: "gesendet" | "fehler";
  fehler?: boolean;
}

interface Gebaeude {
  id: string;
  name: string;
}

export const WegOwnerChatbot = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [sitzung, setSitzung] = useState<string>();
  const [gebaeude, setGebaeude] = useState<Gebaeude[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string>("");
  const [eingabe, setEingabe] = useState("");
  const [arbeitetAn, setArbeitetAn] = useState<string | null>(null);
  const [oeffnet, setOeffnet] = useState<string | null>(null);
  const endeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile?.user_id) return;
    supabase
      .from("weg_owner_buildings")
      .select("building_id, buildings!inner(id, name)")
      .eq("user_id", profile.user_id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const liste = (data ?? []).map((z: any) => ({ id: z.building_id, name: z.buildings?.name ?? "Gebäude" }));
        setGebaeude(liste);
        if (liste.length) setGewaehlt((g) => g || liste[0].id);
      });
  }, [profile?.user_id]);

  useEffect(() => {
    endeRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [nachrichten, laedt]);

  const neuesGespraech = () => {
    setNachrichten([]);
    setSitzung(undefined);
  };

  const gebaeudeWechseln = (id: string) => {
    if (id === gewaehlt) return;
    setGewaehlt(id);
    neuesGespraech();
  };

  const senden = async (text?: string) => {
    const frage = (text ?? eingabe).trim();
    if (!frage || laedt || !profile?.user_id) return;
    setEingabe("");
    setNachrichten((n) => [...n, { id: `u${Date.now()}`, text: frage, vonMir: true }]);
    setLaedt(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-with-ai", {
        body: { message: frage, userId: profile.user_id, managementMode: "weg", buildingId: gewaehlt || null, sessionId: sitzung },
      });
      if (error) throw error;
      if (data?.sessionId && !sitzung) setSitzung(data.sessionId);
      setNachrichten((n) => [
        ...n,
        {
          id: `a${Date.now()}`,
          text: data?.response || "Dazu konnte ich gerade keine Antwort finden.",
          vonMir: false,
          quellen: Array.isArray(data?.sources) ? data.sources : undefined,
          entwurf: data?.reportDraft ?? null,
        },
      ]);
    } catch (e) {
      console.error("Fragen fehlgeschlagen:", e);
      setNachrichten((n) => [
        ...n,
        {
          id: `a${Date.now()}`,
          text: "Das hat gerade nicht geklappt. Bitte versuchen Sie es gleich noch einmal – oder geben Sie die Frage mit dem Knopf unten an die Verwaltung weiter.",
          vonMir: false,
          fehler: true,
        },
      ]);
    } finally {
      setLaedt(false);
    }
  };

  const kontakt = () => ({
    contact_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email,
    contact_email: profile?.email,
    contact_phone: (profile as any)?.phone || null,
  });

  // Meldungen legt der Browser an (RLS greift), nie die Edge Function – es entsteht nichts ohne Klick.
  const entwurfAbsenden = async (id: string, entwurf: ReportDraft) => {
    if (!profile?.user_id) return;
    setArbeitetAn(id);
    try {
      const { error } = await reportsDb.from("reports").insert([{
        management_mode: "weg",
        channel: "chatbot",
        title: entwurf.title,
        description: entwurf.description,
        reported_by: profile.user_id,
        building_id: entwurf.buildingId || gewaehlt || gebaeude[0]?.id || null,
        ...kontakt(),
      }]);
      if (error) throw error;
      setNachrichten((n) => n.map((m) => (m.id === id ? { ...m, entwurfStatus: "gesendet" } : m)));
    } catch (e) {
      console.error(e);
      setNachrichten((n) => n.map((m) => (m.id === id ? { ...m, entwurfStatus: "fehler" } : m)));
    } finally {
      setArbeitetAn(null);
    }
  };

  // Frage samt bisherigem Gespräch an die Verwaltung (als Meldung im Postfach der Verwaltung).
  const weitergeben = async (id: string) => {
    if (!profile?.user_id) return;
    const bis = nachrichten.findIndex((m) => m.id === id);
    const verlauf = nachrichten.slice(0, bis + 1);
    const letzteFrage = [...verlauf].reverse().find((m) => m.vonMir)?.text ?? "Frage aus dem Portal";
    const protokoll = verlauf.map((m) => `${m.vonMir ? "Eigentümer" : "Assistent"}: ${m.text}`).join("\n\n");
    setArbeitetAn(id);
    try {
      const { error } = await reportsDb.from("reports").insert([{
        management_mode: "weg",
        channel: "chatbot",
        title: `Frage: ${letzteFrage.slice(0, 90)}`,
        description: `Weitergegeben aus „Fragen“ im Portal.\n\n${protokoll}`,
        reported_by: profile.user_id,
        building_id: gewaehlt || gebaeude[0]?.id || null,
        ...kontakt(),
      }]);
      if (error) throw error;
      setNachrichten((n) => n.map((m) => (m.id === id ? { ...m, weitergegeben: "gesendet" } : m)));
    } catch (e) {
      console.error(e);
      setNachrichten((n) => n.map((m) => (m.id === id ? { ...m, weitergegeben: "fehler" } : m)));
    } finally {
      setArbeitetAn(null);
    }
  };

  // Fenster sofort öffnen, damit Safari es nicht als Pop-up blockiert; get-building-file-url prüft die Freigabe.
  const quelleOeffnen = async (q: ChatSource) => {
    if (!q.fileId) return;
    const fenster = window.open("", "_blank");
    setOeffnet(q.fileId);
    try {
      const { data, error } = await supabase.functions.invoke("get-building-file-url", { body: { fileId: q.fileId } });
      if (error || !data?.signedUrl) throw error || new Error("Kein Link");
      const ziel = q.pageNumber ? `${data.signedUrl}#page=${q.pageNumber}` : data.signedUrl;
      if (fenster) fenster.location.href = ziel;
      else window.location.href = ziel;
    } catch {
      fenster?.close();
      toast({ title: "Dokument konnte nicht geöffnet werden", description: "Sie finden es auch unter „Dokumente“.", variant: "destructive" });
    } finally {
      setOeffnet(null);
    }
  };

  const gewaehltName = gebaeude.find((g) => g.id === gewaehlt)?.name;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl md:max-w-2xl mx-auto px-4 pt-5 pb-48 space-y-4">
        <PortalSeitenkopf
          titel="Fragen"
          text="Zu Ihrem Haus, aus Ihren Unterlagen. Sie können jederzeit nachfragen."
          rechts={
            nachrichten.length > 0 ? (
              <Button variant="outline" className="h-11 gap-1.5 rounded-[10px] bg-card" onClick={neuesGespraech}>
                <Plus className="h-4 w-4" /> Neu
              </Button>
            ) : undefined
          }
        />

        {gebaeude.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Gebäude wählen">
            {gebaeude.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={g.id === gewaehlt}
                onClick={() => gebaeudeWechseln(g.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 min-h-[40px] rounded-full px-3.5 text-[13px] border transition-colors",
                  g.id === gewaehlt ? "bg-foreground text-background border-foreground" : "bg-card border-border/60 text-foreground hover:bg-muted/50",
                )}
              >
                <Building2 className="h-3.5 w-3.5" /> {g.name}
              </button>
            ))}
          </div>
        ) : gewaehltName ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[13px] text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> {gewaehltName}
          </span>
        ) : null}

        {nachrichten.length === 0 && !laedt && (
          <div className="bg-card rounded-[14px] border border-border/60 shadow-sm p-5 flex gap-4 items-start">
            <span className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <MessageCircleQuestion className="h-5 w-5 text-primary" />
            </span>
            <p className="text-[15px] leading-relaxed text-foreground">
              Stellen Sie unten Ihre Frage. Die Antwort kommt aus den Unterlagen Ihres Hauses – mit Angabe, wo es steht.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3" aria-live="polite">
          {nachrichten.map((m) =>
            m.vonMir ? (
              <div key={m.id} className="self-end max-w-[85%] bg-foreground text-background rounded-[14px] rounded-br-[4px] px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="max-w-[94%] bg-card rounded-[14px] rounded-tl-[4px] border border-border/60 shadow-sm px-4 py-3.5 space-y-3">
                <div className="text-[15px] leading-relaxed text-foreground prose prose-sm max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-1.5 prose-strong:text-foreground">
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </div>

                {m.entwurf && (
                  <div className="rounded-[10px] border border-border/60 bg-muted/40 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">Meldung an die Verwaltung</p>
                    <p className="text-sm font-medium">{m.entwurf.title}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.entwurf.description}</p>
                    {m.entwurfStatus === "gesendet" ? (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-green-700 pt-1"><Check className="h-3.5 w-3.5" /> Gesendet – Sie finden sie unter „Meldungen“.</p>
                    ) : m.entwurfStatus === "fehler" ? (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-destructive pt-1"><AlertCircle className="h-3.5 w-3.5" /> Hat nicht geklappt. Bitte unter „Meldungen“ anlegen.</p>
                    ) : (
                      <Button size="sm" className="mt-1 h-10" disabled={arbeitetAn === m.id} onClick={() => entwurfAbsenden(m.id, m.entwurf!)}>
                        {arbeitetAn === m.id ? "Wird gesendet…" : "Meldung absenden"}
                      </Button>
                    )}
                  </div>
                )}

                {!!m.quellen?.length && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">Grundlage dieser Antwort</p>
                    {m.quellen
                      .filter((q, i, alle) => alle.findIndex((a) => (a.fileId && q.fileId && a.fileId === q.fileId) || (a.fileName || "").trim().toLowerCase() === (q.fileName || "").trim().toLowerCase()) === i)
                      .map((q, i) => (
                        <button
                          key={q.fileId || i}
                          type="button"
                          disabled={!q.fileId}
                          onClick={() => quelleOeffnen(q)}
                          className="w-full flex items-center gap-2.5 min-h-[40px] px-2.5 rounded-[10px] bg-background text-left text-[13px] text-foreground hover:bg-muted/60 disabled:cursor-default"
                        >
                          {oeffnet === q.fileId ? <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" /> : <FileText className="h-4 w-4 text-primary shrink-0" />}
                          <span className="flex-1 min-w-0 truncate">
                            {q.fileName}
                            {q.pageNumber ? ` · Seite ${q.pageNumber}` : ""}
                          </span>
                        </button>
                      ))}
                  </div>
                )}

                <div className="pt-1 border-t border-foreground/[0.055]">
                  {m.weitergegeben === "gesendet" ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-green-700 pt-2"><Check className="h-3.5 w-3.5" /> An die Verwaltung weitergegeben. Sie finden es unter „Meldungen“.</p>
                  ) : m.weitergegeben === "fehler" ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive pt-2"><AlertCircle className="h-3.5 w-3.5" /> Weitergeben hat nicht geklappt. Bitte unter „Meldungen“ schreiben.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => weitergeben(m.id)}
                      disabled={arbeitetAn === m.id}
                      className="inline-flex items-center gap-1.5 min-h-[40px] pt-1 text-[13px] font-medium text-[#B35500] hover:underline underline-offset-2"
                    >
                      <Send className="h-3.5 w-3.5" /> {arbeitetAn === m.id ? "Wird weitergegeben…" : "An die Verwaltung weitergeben"}
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
          {laedt && (
            <div className="max-w-[94%] bg-card rounded-[14px] rounded-tl-[4px] border border-border/60 shadow-sm px-4 py-3.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Ich schaue in Ihren Unterlagen nach …
            </div>
          )}
          <div ref={endeRef} />
        </div>
      </div>

      <div
        data-tour="chatbot-input"
        className="fixed left-0 right-0 z-40 bg-background border-t border-border/60"
        style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-xl md:max-w-2xl mx-auto px-4 pt-2.5 pb-2">
          <div className="flex items-end gap-1.5 bg-card rounded-[14px] border border-border shadow-sm pl-3.5 pr-1 py-1">
            <label htmlFor="frage" className="sr-only">Ihre Frage</label>
            <textarea
              id="frage"
              rows={1}
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  senden();
                }
              }}
              placeholder={nachrichten.length ? "Nachfragen oder neue Frage …" : "Ihre Frage zum Haus …"}
              disabled={laedt}
              className="flex-1 min-w-0 resize-none bg-transparent border-0 outline-none py-2.5 text-base leading-snug max-h-32 placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-1 pb-0.5">
              <VoiceInputButton onResult={(t) => setEingabe((alt) => (alt ? `${alt} ${t}` : t))} contextHint="Frage einer Eigentümerin zu ihrem Haus" />
              <Button
                size="icon"
                aria-label="Senden"
                onClick={() => senden()}
                disabled={!eingabe.trim() || laedt}
                className="h-11 w-11 rounded-[10px] bg-[#C95F00] hover:bg-[#B35500] text-white"
              >
                {laedt ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 px-1">Antworten können Fehler enthalten. Verbindlich ist die Auskunft der Verwaltung.</p>
        </div>
      </div>
    </div>
  );
};
