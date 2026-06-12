import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Info, Save, Loader2, Flame, MapPin, StickyNote, Plus, Trash2, Pencil, X, Check, Landmark, CalendarRange } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  buildingId: string;
  managementMode?: 'weg' | 'rent';
}

interface Note {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export const BuildingGeneralInfoCard = ({ buildingId, managementMode = 'weg' }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ---- Stammfelder (ETV-Ort, Heizung) ----
  const { data: building } = useQuery({
    queryKey: ["building-general-info", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("etv_default_location, heating_type, creditor_id, fiscal_year_start_month, fiscal_year_start_day")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data as {
        etv_default_location: string | null;
        heating_type: string | null;
        creditor_id: string | null;
        fiscal_year_start_month: number;
        fiscal_year_start_day: number;
      };
    },
  });

  const [etv, setEtv] = useState("");
  const [heating, setHeating] = useState("");
  const [fyMonth, setFyMonth] = useState<number>(1);
  const [fyDay, setFyDay] = useState<number>(1);
  const [savingMain, setSavingMain] = useState(false);

  useEffect(() => {
    if (building) {
      setEtv(building.etv_default_location || "");
      setHeating(building.heating_type || "");
      setFyMonth(building.fiscal_year_start_month ?? 1);
      setFyDay(building.fiscal_year_start_day ?? 1);
    }
  }, [building]);

  const isMainDirty =
    (building?.etv_default_location || "") !== etv ||
    (building?.heating_type || "") !== heating ||
    (building?.fiscal_year_start_month ?? 1) !== fyMonth ||
    (building?.fiscal_year_start_day ?? 1) !== fyDay;

  const handleSaveMain = async () => {
    setSavingMain(true);
    const { error } = await supabase
      .from("buildings")
      .update({
        etv_default_location: etv || null,
        heating_type: heating || null,
        fiscal_year_start_month: fyMonth,
        fiscal_year_start_day: fyDay,
      })
      .eq("id", buildingId);
    setSavingMain(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    qc.invalidateQueries({ queryKey: ["building-general-info", buildingId] });
    qc.invalidateQueries({ queryKey: ["building-detail", buildingId] });
    qc.invalidateQueries({ queryKey: ["building-fy-cfg", buildingId] });
    qc.invalidateQueries({ queryKey: ["annual-cycle-timeline", buildingId] });
    qc.invalidateQueries({ queryKey: ["annual-cycle", buildingId] });
  };

  // ---- Notizen-Liste ----
  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["building-notes", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_notes")
        .select("id, title, content, created_at, updated_at")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Note[];
    },
  });

  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const refreshNotes = () => qc.invalidateQueries({ queryKey: ["building-notes", buildingId] });

  const handleAdd = async () => {
    if (!draftContent.trim()) return;
    setAdding(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("building_notes").insert({
      building_id: buildingId,
      title: draftTitle.trim() || null,
      content: draftContent.trim(),
      created_by: userRes?.user?.id || null,
    });
    setAdding(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    setDraftTitle("");
    setDraftContent("");
    setShowDraft(false);
    refreshNotes();
  };

  const startEdit = (n: Note) => {
    setEditingId(n.id);
    setEditTitle(n.title || "");
    setEditContent(n.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from("building_notes")
      .update({ title: editTitle.trim() || null, content: editContent.trim() })
      .eq("id", editingId);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    setEditingId(null);
    refreshNotes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Diese Notiz wirklich löschen?")) return;
    const { error } = await supabase.from("building_notes").delete().eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    refreshNotes();
  };

  return (
    <Card>
      <CardHeader className="p-3 md:p-4 pb-2">
        <CardTitle className="text-sm md:text-base flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          Allgemeine Infos
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-1 space-y-4">
        {/* ETV-Ort + Heizung */}
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> ETV-Ort (Standard)
            </Label>
            <Input
              value={etv}
              onChange={(e) => setEtv(e.target.value)}
              placeholder="z. B. Hotel Krone, Musterstraße 1"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <Flame className="h-3 w-3" /> Heizungsart
            </Label>
            <Input
              value={heating}
              onChange={(e) => setHeating(e.target.value)}
              placeholder="z. B. Gas, Fernwärme"
              className="h-9 text-sm"
            />
          </div>
        </div>

        {/* Wirtschaftsjahr-Beginn */}
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1.5">
            <CalendarRange className="h-3 w-3" /> Wirtschaftsjahr-Beginn
          </Label>
          <div className="flex items-center gap-2">
            <Select value={String(fyDay)} onValueChange={(v) => setFyDay(Number(v))}>
              <SelectTrigger className="h-9 w-[90px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>{d}.</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(fyMonth)} onValueChange={(v) => setFyMonth(Number(v))}>
              <SelectTrigger className="h-9 flex-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Januar","Februar","März","April","Mai","Juni",
                  "Juli","August","September","Oktober","November","Dezember",
                ].map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Wird überall für Jahreszyklus und Wirtschaftsjahr-Auswahl dieser Liegenschaft verwendet.
          </p>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSaveMain} disabled={!isMainDirty || savingMain} className="gap-1.5">
            {savingMain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Speichern
          </Button>
        </div>


        {/* Gläubiger-ID */}
        <div className="border-t pt-3">
          <Label className="text-xs flex items-center gap-1.5 mb-1">
            <Landmark className="h-3 w-3" /> Gläubiger-ID (SEPA)
          </Label>
          {building?.creditor_id ? (
            <p className="text-sm font-mono">{building.creditor_id}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Noch nicht hinterlegt — über „Bearbeiten" eintragen.
            </p>
          )}
        </div>

        {/* Notizen */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5">
              <StickyNote className="h-3 w-3" /> Notizen ({notes.length})
            </Label>
            {!showDraft && (
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => setShowDraft(true)}>
                <Plus className="h-3.5 w-3.5" /> Notiz hinzufügen
              </Button>
            )}
          </div>

          {showDraft && (
            <div className="space-y-2 p-2 rounded-md border bg-muted/30">
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Titel (optional)"
                className="h-8 text-sm"
              />
              <Textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="Notiz…"
                rows={3}
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setShowDraft(false); setDraftTitle(""); setDraftContent(""); }}>
                  Abbrechen
                </Button>
                <Button size="sm" onClick={handleAdd} disabled={!draftContent.trim() || adding} className="gap-1.5">
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Hinzufügen
                </Button>
              </div>
            </div>
          )}

          {notes.length === 0 && !showDraft && (
            <p className="text-xs text-muted-foreground py-1">Noch keine Notizen.</p>
          )}

          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="p-2 rounded-md border bg-background">
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titel (optional)"
                      className="h-8 text-sm"
                    />
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="text-sm"
                    />
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 px-2">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" onClick={saveEdit} disabled={!editContent.trim()} className="h-7 px-2 gap-1">
                        <Check className="h-3.5 w-3.5" /> Speichern
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {n.title && <p className="text-sm font-medium">{n.title}</p>}
                      <p className="text-sm whitespace-pre-wrap break-words">{n.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.updated_at), { locale: de, addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(n)} title="Bearbeiten">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(n.id)} title="Löschen">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
