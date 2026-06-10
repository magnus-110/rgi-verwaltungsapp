import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface BuildingNotesTabProps {
  buildingId: string;
}

const STANDARD_CATEGORIES = [
  { value: "etv", label: "ETV" },
  { value: "buchhaltung", label: "Buchhaltung" },
  { value: "technik", label: "Technik" },
];

interface NoteRow {
  id: string;
  building_id: string;
  category: string;
  content: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface CategoryRow {
  id: string;
  value: string;
  label: string;
}

export const BuildingNotesTab = ({ buildingId }: BuildingNotesTabProps) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>("etv");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [draft, setDraft] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: customCategories = [] } = useQuery({
    queryKey: ["building-note-categories", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_note_categories")
        .select("id, value, label")
        .eq("building_id", buildingId)
        .order("label");
      if (error) throw error;
      return data as CategoryRow[];
    },
  });

  const allCategories = [
    ...STANDARD_CATEGORIES,
    ...customCategories.map((c) => ({ value: c.value, label: c.label })),
  ];

  const { data: notes = [] } = useQuery({
    queryKey: ["building-notes", buildingId, activeCategory],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_notes")
        .select("*")
        .eq("building_id", buildingId)
        .eq("category", activeCategory)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as NoteRow[];
    },
  });

  const createNote = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("building_notes").insert({
        building_id: buildingId,
        category: activeCategory,
        content,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["building-notes", buildingId, activeCategory] });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase.from("building_notes").update({ content }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["building-notes", buildingId, activeCategory] });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("building_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["building-notes", buildingId, activeCategory] });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const addCategory = useMutation({
    mutationFn: async (label: string) => {
      const value = label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (!value) throw new Error("Bitte einen gültigen Namen eingeben");
      const { error } = await supabase
        .from("building_note_categories")
        .insert({ building_id: buildingId, value, label: label.trim() });
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      setNewCategoryLabel("");
      setNewCategoryOpen(false);
      setActiveCategory(value);
      qc.invalidateQueries({ queryKey: ["building-note-categories", buildingId] });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <div className="flex items-center gap-2 flex-wrap">
          <TabsList>
            {allCategories.map((c) => (
              <TabsTrigger key={c.value} value={c.value}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button variant="outline" size="sm" onClick={() => setNewCategoryOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tab
          </Button>
        </div>

        {allCategories.map((c) => (
          <TabsContent key={c.value} value={c.value} className="mt-4 space-y-4">
            <Card className="p-3 space-y-2">
              <Textarea
                placeholder={`Neue Notiz für ${c.label}...`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => createNote.mutate(draft)}
                  disabled={!draft.trim() || createNote.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" /> Notiz hinzufügen
                </Button>
              </div>
            </Card>

            <div className="space-y-2">
              {notes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Noch keine Notizen in diesem Tab.
                </p>
              )}
              {notes.map((note) => {
                const isOpen = openIds.has(note.id);
                const preview = note.content.split("\n")[0].slice(0, 80);
                const isEditing = editingId === note.id;
                return (
                  <Collapsible key={note.id} open={isOpen} onOpenChange={() => toggleOpen(note.id)}>
                    <Card className="overflow-hidden">
                      <div className="flex items-center gap-2 p-3">
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-2 flex-1 text-left min-w-0">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 flex-shrink-0" />
                            )}
                            <span className="text-sm font-medium truncate">
                              {preview || "(leer)"}
                            </span>
                            <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
                              {new Date(note.updated_at).toLocaleDateString("de-DE")}
                            </span>
                          </button>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 space-y-2 border-t pt-3">
                          {isEditing ? (
                            <>
                              <Textarea
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                rows={5}
                              />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                  <X className="h-4 w-4 mr-1" /> Abbrechen
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    updateNote.mutate({ id: note.id, content: editingContent })
                                  }
                                  disabled={updateNote.isPending}
                                >
                                  <Check className="h-4 w-4 mr-1" /> Speichern
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingId(note.id);
                                    setEditingContent(note.content);
                                  }}
                                >
                                  <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeleteId(note.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" /> Löschen
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen Tab anlegen</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Name des Tabs (z. B. Versicherung)"
            value={newCategoryLabel}
            onChange={(e) => setNewCategoryLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCategoryLabel.trim()) addCategory.mutate(newCategoryLabel);
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewCategoryOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => addCategory.mutate(newCategoryLabel)}
              disabled={!newCategoryLabel.trim() || addCategory.isPending}
            >
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notiz löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteNote.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
