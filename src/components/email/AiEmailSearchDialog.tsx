import { useState } from "react";
import { Sparkles, Loader2, Search, Building2, User, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Match {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  date: string | null;
  building_name: string | null;
  contact_name: string | null;
  reason: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountIds: string[] | null;
  onSelectEmail: (emailId: string) => void;
}

export const AiEmailSearchDialog = ({ open, onOpenChange, accountIds, onSelectEmail }: Props) => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Match[]>([]);
  const [searched, setSearched] = useState(false);

  const reset = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (q.length < 3) {
      toast.error("Bitte beschreibe die gesuchte E-Mail (mind. 3 Zeichen).");
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search-emails", {
        body: { query: q, accountIds: accountIds ?? undefined },
      });
      if (error) throw error;
      const matches: Match[] = (data as any)?.matches || [];
      setResults(matches);
      if (matches.length === 0) toast.info("Keine passenden E-Mails gefunden.");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message?.includes("429")
        ? "KI ist überlastet — bitte kurz warten."
        : e?.message?.includes("402")
          ? "KI-Guthaben aufgebraucht."
          : `Fehler: ${e?.message || "Unbekannt"}`;
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            KI-Suche im Archiv
          </DialogTitle>
          <DialogDescription>
            Beschreibe Inhalt, Absender oder Liegenschaft — die KI durchsucht dein Archiv.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            placeholder="z.B. „Rechnung vom Heizungsmonteur für Liegenschaft Hauptstraße 5, irgendwann letzten Sommer""
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSearch();
              }
            }}
          />
          <div className="flex justify-end">
            <Button onClick={handleSearch} disabled={loading || query.trim().length < 3} size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Suchen
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              KI durchsucht das Archiv …
            </div>
          )}
          {!loading && searched && results.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Keine passenden E-Mails gefunden.
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className="space-y-2 pb-2">
              {results.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onSelectEmail(m.id)}
                  className="w-full text-left border rounded-md p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-sm flex items-center gap-1.5 flex-1 min-w-0">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{m.subject || "(Kein Betreff)"}</span>
                    </div>
                    {m.date && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(m.date).toLocaleDateString("de-DE")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mb-1 truncate">
                    {m.from_name || m.from_address}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {m.building_name && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {m.building_name}
                      </span>
                    )}
                    {m.contact_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {m.contact_name}
                      </span>
                    )}
                  </div>
                  {m.reason && (
                    <div className="mt-1.5 text-xs italic text-primary/80">
                      „{m.reason}"
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
