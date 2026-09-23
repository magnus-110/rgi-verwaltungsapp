import { useMemo, useState } from "react";
import { AdminSurvey, useAdminSurveys, useCreateSurvey } from "@/hooks/useSurveysAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EyeOff, Plus, Search } from "lucide-react";

/**
 * Die Liste der Umfragen eines Gebäudes.
 *
 * Eine Zeile je Umfrage: farbiger Punkt für den Zustand, Titel, darunter die
 * Zahlen. Vorher standen Titel über drei Zeilen und der Zustand als Etikett
 * daneben — bei fünf Umfragen war die Spalte voll.
 */

const PUNKT: Record<string, string> = {
  draft: "bg-muted-foreground/40",
  open: "bg-emerald-600",
  paused: "bg-amber-500",
  closed: "bg-slate-400",
  archived: "bg-slate-300",
};

const ZUSTAND_TEXT: Record<string, string> = {
  draft: "Entwurf",
  open: "Aktiv",
  paused: "Pausiert",
  closed: "Geschlossen",
  archived: "Archiviert",
};

export default function SurveyList({
  buildingId, selectedId, onSelect,
}: { buildingId: string; selectedId?: string; onSelect: (id: string) => void }) {
  const [showArchived, setShowArchived] = useState(false);
  const [suche, setSuche] = useState("");
  const { data = [], isLoading } = useAdminSurveys(buildingId, showArchived);
  const create = useCreateSurvey();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return data;
    return data.filter((s) => s.title.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
  }, [data, suche]);

  const handleCreate = () => {
    if (!title.trim()) return;
    create.mutate(
      { building_id: buildingId, title: title.trim(), description: desc.trim() || undefined },
      {
        onSuccess: (id) => {
          setOpen(false); setTitle(""); setDesc("");
          onSelect(id);
        },
      },
    );
  };

  return (
    <div className="space-y-2.5">
      <Button className="w-full" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Neue Umfrage
      </Button>

      {data.length > 4 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)}
            placeholder="Umfrage suchen" className="h-9 pl-8 text-[13px]" />
        </div>
      )}

      {isLoading ? (
        <p className="p-2 text-sm text-muted-foreground">Lädt …</p>
      ) : gefiltert.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-[13px] text-muted-foreground">
          {suche ? "Keine Umfrage gefunden." : "Noch keine Umfrage für dieses Gebäude."}
        </p>
      ) : (
        <div className="space-y-2">
          {gefiltert.map((s: AdminSurvey) => {
            const aktiv = selectedId === s.id;
            const fragen = s.item_count ?? 0;
            const stimmen = s.vote_count ?? 0;
            return (
              <button
                key={s.id} type="button" onClick={() => onSelect(s.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  aktiv ? "border-primary border-l-[3px] bg-primary/5" : "bg-card hover:border-primary/50"
                }`}>
                <div className="flex items-center gap-2">
                  <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${PUNKT[s.status] ?? PUNKT.draft}`} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{s.title}</span>
                  {!s.is_visible_to_owners && <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </div>
                <p className="mt-1.5 truncate text-[11.5px] text-muted-foreground">
                  {s.status === "open" || s.status === "paused" || s.status === "closed"
                    ? `${fragen} Frage${fragen === 1 ? "" : "n"} · ${stimmen} Antwort${stimmen === 1 ? "" : "en"}`
                    : `${ZUSTAND_TEXT[s.status] ?? ""} · ${fragen === 0 ? "noch keine Frage" : `${fragen} Frage${fragen === 1 ? "" : "n"}`}`}
                  {s.closes_at && (s.status === "open" || s.status === "paused") &&
                    ` · bis ${new Date(s.closes_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button" onClick={() => setShowArchived((v) => !v)}
        className="px-1 text-[11.5px] text-muted-foreground underline-offset-2 hover:underline">
        {showArchived ? "Archivierte ausblenden" : "Archivierte anzeigen"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Umfrage anlegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Instandhaltung 2026" /></div>
            <div><Label>Kurzbeschreibung (intern, optional)</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={!title.trim() || create.isPending}>Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
