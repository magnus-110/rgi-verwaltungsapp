import { AdminSurvey, useAdminSurveys, useCreateSurvey } from "@/hooks/useSurveysAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, ChevronRight, EyeOff } from "lucide-react";
import { useState } from "react";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:    { label: "Entwurf",    cls: "bg-muted text-muted-foreground" },
  open:     { label: "Aktiv",      cls: "bg-emerald-100 text-emerald-700" },
  paused:   { label: "Pausiert",   cls: "bg-amber-100 text-amber-800" },
  closed:   { label: "Geschlossen", cls: "bg-slate-200 text-slate-700" },
  archived: { label: "Archiviert", cls: "bg-slate-200 text-slate-500" },
};

export default function SurveyList({
  buildingId, selectedId, onSelect,
}: { buildingId: string; selectedId?: string; onSelect: (id: string) => void }) {
  const [showArchived, setShowArchived] = useState(false);
  const { data = [], isLoading } = useAdminSurveys(buildingId, showArchived);
  const create = useCreateSurvey();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} id="arch" />
          <label htmlFor="arch" className="text-muted-foreground cursor-pointer">Archivierte anzeigen</label>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Neue Umfrage</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Neue Umfrage anlegen</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Titel</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Instandhaltung 2026" /></div>
              <div><Label>Kurzbeschreibung (intern, optional)</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={!title.trim() || create.isPending}>Anlegen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="p-4 text-muted-foreground">Lädt …</div>
      ) : data.length === 0 ? (
        <Card><CardContent className="p-6 text-muted-foreground text-sm">
          Noch keine Umfrage für dieses Gebäude. Legen Sie oben eine neue an.
        </CardContent></Card>
      ) : (
        data.map((s: AdminSurvey) => {
          const st = STATUS_LABEL[s.status] ?? STATUS_LABEL.draft;
          const active = selectedId === s.id;
          return (
            <Card key={s.id}
              className={`cursor-pointer transition ${active ? "border-primary" : "hover:border-primary/50"}`}
              onClick={() => onSelect(s.id)}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.title}</span>
                    <Badge className={st.cls + " hover:" + st.cls}>{st.label}</Badge>
                    {!s.is_visible_to_owners && (
                      <Badge variant="outline" className="text-xs"><EyeOff className="h-3 w-3 mr-1" />ausgeblendet</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {s.item_count ?? 0} Punkt(e) · {s.vote_count ?? 0} Stimme(n)
                    {s.closes_at && <> · Frist {new Date(s.closes_at).toLocaleDateString("de-DE")}</>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
