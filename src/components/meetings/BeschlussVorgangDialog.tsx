import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { CASE_STATUS_LABEL } from "@/hooks/useCases";
import { cn } from "@/lib/utils";

export interface GewaehlterVorgang {
  id: string;
  title: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildingId?: string | null;
  /** Beschluss- oder TOP-Text, um passende Vorgaenge oben anzuzeigen */
  text?: string | null;
  /** Aktuell verknuepfter Vorgang (wird hervorgehoben) */
  aktuellerVorgangId?: string | null;
  /** null = neuen Vorgang automatisch anlegen lassen */
  onPick: (vorgang: GewaehlterVorgang | null) => void;
  busy?: boolean;
  /** false = nur vorhandene Vorgaenge (z. B. beim Aendern einer Verknuepfung) */
  neuErlaubt?: boolean;
}

// Woerter ohne Aussagekraft fuer den Vergleich Beschluss <-> Vorgangstitel
const FUELLWOERTER = new Set([
  "der", "die", "das", "den", "dem", "des", "und", "oder", "mit", "von", "für", "fuer", "auf", "aus",
  "bei", "zum", "zur", "ein", "eine", "einer", "eines", "wird", "werden", "beschließen", "beschliessen",
  "wohnungseigentümer", "eigentümer", "eigentümergemeinschaft", "verwaltung", "beauftragt", "ermächtigt",
  "gemäß", "angebot", "kosten", "euro", "brutto", "netto", "durch", "sowie", "nach", "über", "ueber",
]);

const woerter = (t: string) =>
  (t || "")
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 3 && !FUELLWOERTER.has(w));

/** Wie gut passt ein Vorgangstitel zum Beschlusstext? Gleiche Wortstaemme zaehlen. */
function passung(titel: string, text: string): number {
  const t = woerter(text);
  if (!t.length) return 0;
  let punkte = 0;
  for (const w of woerter(titel)) {
    const stamm = w.slice(0, Math.max(5, Math.ceil(w.length * 0.7)));
    if (t.some((x) => x.startsWith(stamm) || w.startsWith(x.slice(0, Math.max(5, Math.ceil(x.length * 0.7)))))) punkte++;
  }
  return punkte;
}

/**
 * Beschluss zur Umsetzung: einen vorhandenen Vorgang des Gebaeudes waehlen oder einen
 * neuen anlegen lassen. Verhindert doppelte Vorgaenge zum selben Thema.
 */
export function BeschlussVorgangDialog({ open, onOpenChange, buildingId, text, aktuellerVorgangId, onPick, busy, neuErlaubt = true }: Props) {
  const [suche, setSuche] = useState("");

  const { data: vorgaenge = [], isLoading } = useQuery({
    queryKey: ["vorgaenge-fuer-beschluss", buildingId],
    enabled: open && !!buildingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, title, status, updated_at")
        .eq("building_id", buildingId!)
        .not("status", "in", "(archived,resolved)")
        .order("updated_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data || []) as { id: string; title: string; status: string; updated_at: string }[];
    },
  });

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return vorgaenge
      .filter((v) => !q || v.title.toLowerCase().includes(q))
      .map((v) => ({ ...v, punkte: passung(v.title, text || "") }))
      .sort((a, b) => b.punkte - a.punkte);
  }, [vorgaenge, suche, text]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vorgang für die Umsetzung</DialogTitle>
          <DialogDescription>
            Gibt es zum Thema schon einen Vorgang, verknüpfe ihn. Sonst wird ein neuer angelegt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {neuErlaubt && <button
            type="button"
            disabled={busy}
            onClick={() => onPick(null)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-dashed p-3 text-left text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-60"
          >
            <Plus className="h-4 w-4 shrink-0 text-primary" />
            <span>
              Neuen Vorgang anlegen
              <span className="block text-xs text-muted-foreground">Der kurze Titel wird automatisch vergeben.</span>
            </span>
          </button>}

          {!buildingId ? (
            <p className="text-sm text-muted-foreground">Ohne Gebäude können keine vorhandenen Vorgänge angezeigt werden.</p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Vorhandenen Vorgang suchen …" className="pl-9" />
              </div>
              <ScrollArea className="h-[260px] rounded-md border">
                {isLoading ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden …
                  </div>
                ) : liste.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Keine offenen Vorgänge in diesem Gebäude.</p>
                ) : (
                  <div className="divide-y">
                    {liste.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        disabled={busy}
                        onClick={() => onPick({ id: v.id, title: v.title })}
                        className={cn(
                          "flex w-full items-start gap-2.5 p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60",
                          aktuellerVorgangId === v.id && "bg-primary/5",
                        )}
                      >
                        <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{v.title}</p>
                          {v.punkte > 0 && (
                            <p className="flex items-center gap-1 text-[11px] text-primary">
                              <Sparkles className="h-3 w-3" /> passt vermutlich zum Beschluss
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[10.5px] text-muted-foreground">
                          {(CASE_STATUS_LABEL as Record<string, string>)[v.status] || v.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
