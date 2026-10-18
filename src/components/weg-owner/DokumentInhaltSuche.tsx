/**
 * Intelligente Suche in Dokumenten: sucht im TEXT der Dokumente (gleiche Suche wie „Fragen“),
 * zeigt die Fundstelle mit markierten Wörtern und öffnet das Dokument auf der richtigen Seite.
 * Die Rechte prüft die Datenbank: Es kommen nur Dokumente, die die Person sehen darf.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Treffer {
  fileId: string | null;
  fileName: string;
  folderPath: string[];
  pageNumber: number | null;
  content: string;
}

const STOPP = new Set(["der", "die", "das", "und", "oder", "ich", "wir", "sie", "ein", "eine", "einen", "darf", "kann", "muss", "mein", "meine", "meinem", "meiner", "auf", "für", "mit", "von", "zum", "zur", "den", "dem", "des", "ist", "sind", "was", "wie", "wo", "wann", "steht", "etwas", "gibt", "es", "an", "in", "im", "bei"]);

function woerter(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/i)
    .filter((w) => w.length >= 3 && !STOPP.has(w));
}

// Ausschnitt rund um das erste gefundene Wort, Wörter markiert.
function Ausschnitt({ text, suche }: { text: string; suche: string[] }) {
  const sauber = text.replace(/\s+/g, " ").trim();
  const klein = sauber.toLowerCase();
  let pos = -1;
  for (const w of suche) {
    pos = klein.indexOf(w.slice(0, Math.max(4, w.length - 2)));
    if (pos >= 0) break;
  }
  const start = Math.max(0, (pos < 0 ? 0 : pos) - 80);
  const stueck = (start > 0 ? "… " : "") + sauber.slice(start, start + 220) + (start + 220 < sauber.length ? " …" : "");
  if (!suche.length) return <>{stueck}</>;
  const muster = new RegExp(`((?:${suche.map((w) => w.slice(0, Math.max(4, w.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})[a-zäöüß]*)`, "gi");
  return (
    <>
      {stueck.split(muster).map((teil, i) =>
        i % 2 === 1 ? <mark key={i} className="bg-primary/20 text-foreground rounded-[3px] px-0.5">{teil}</mark> : <span key={i}>{teil}</span>,
      )}
    </>
  );
}

export function DokumentInhaltSuche({
  suchtext,
  buildingIds,
  onTreffer,
}: {
  suchtext: string;
  buildingIds: string[];
  onTreffer?: (t: { id: string | null; name: string }[]) => void;
}) {
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [gesucht, setGesucht] = useState("");
  const [oeffnet, setOeffnet] = useState<string | null>(null);
  const lauf = useRef(0);
  const suchWoerter = useMemo(() => woerter(gesucht), [gesucht]);

  useEffect(() => {
    const frage = suchtext.trim();
    if (frage.length < 4) {
      setTreffer([]);
      setGesucht("");
      onTreffer?.([]);
      return;
    }
    const nr = ++lauf.current;
    const t = setTimeout(async () => {
      setLaedt(true);
      try {
        const { data, error } = await supabase.functions.invoke("query-documents", {
          body: { question: frage, buildingIds: buildingIds.length ? buildingIds : undefined, matchCount: 8 },
        });
        if (nr !== lauf.current) return;
        if (error) throw error;
        const roh: Treffer[] = Array.isArray(data?.sources) ? data.sources : [];
        // Pro Dokument nur die beste Fundstelle.
        // Jedes Dokument nur einmal – auch wenn es mehrfach abgelegt ist (gleicher Name).
        const gesehen = new Set<string>();
        const eindeutig = roh.filter((q) => {
          const schluessel = [q.fileId ? `id:${q.fileId}` : null, `name:${(q.fileName || "").trim().toLowerCase()}`].filter(Boolean) as string[];
          if (schluessel.some((k) => gesehen.has(k))) return false;
          schluessel.forEach((k) => gesehen.add(k));
          return true;
        }).slice(0, 5);
        setTreffer(eindeutig);
        onTreffer?.(eindeutig.map((q) => ({ id: q.fileId, name: (q.fileName || "").trim().toLowerCase() })));
        setGesucht(frage);
      } catch (e) {
        if (nr === lauf.current) {
          console.error("Dokumentsuche:", e);
          setTreffer([]);
          setGesucht(frage);
          onTreffer?.([]);
        }
      } finally {
        if (nr === lauf.current) setLaedt(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [suchtext, buildingIds.join(",")]);

  const oeffnen = async (q: Treffer) => {
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
      toast.error("Dokument konnte nicht geöffnet werden");
    } finally {
      setOeffnet(null);
    }
  };

  if (suchtext.trim().length < 4) return null;

  return (
    <section aria-live="polite">
      <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-1 mb-2">
        {laedt ? "Suche im Text der Dokumente …" : treffer.length ? `${treffer.length} Treffer im Text Ihrer Dokumente` : "Im Text der Dokumente"}
      </h2>
      {laedt && treffer.length === 0 ? (
        <div className="bg-card rounded-[14px] border border-border/60 shadow-sm p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Einen Moment …
        </div>
      ) : treffer.length === 0 ? (
        gesucht && (
          <div className="bg-card rounded-[14px] border border-border/60 shadow-sm p-4 text-sm text-muted-foreground">
            Im Text der Dokumente wurde dazu nichts gefunden. Unten sehen Sie Treffer im Dateinamen.
          </div>
        )
      ) : (
        <div className="bg-card rounded-[14px] border border-border/60 overflow-hidden shadow-sm divide-y divide-foreground/[0.055]">
          {treffer.map((q, i) => (
            <div key={(q.fileId ?? q.fileName) + i} className="px-4 py-3.5 space-y-2">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-[10px] bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-[18px] w-[18px] text-primary" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold leading-tight truncate">{q.fileName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[q.folderPath?.join(" › "), q.pageNumber ? `Seite ${q.pageNumber}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">
                <Ausschnitt text={q.content || ""} suche={suchWoerter} />
              </p>
              {q.fileId && (
                <button
                  type="button"
                  onClick={() => oeffnen(q)}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-border/60 bg-background text-sm font-medium hover:bg-muted/50"
                >
                  {oeffnet === q.fileId && <Loader2 className="h-4 w-4 animate-spin" />}
                  {q.pageNumber ? `Auf Seite ${q.pageNumber} öffnen` : "Öffnen"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
