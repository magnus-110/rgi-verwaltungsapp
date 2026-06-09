import { useState, useRef, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, GripVertical, Trash2, Pencil, Upload, FileText, X, Wand2, Loader2, Check, BookTemplate, ChevronDown, ChevronUp, Settings, Gavel, Info, FolderOpen, Wrench } from "lucide-react";
import { DmsFilePickerDialog } from "./DmsFilePickerDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface AgendaItemEditorProps {
  meetingId: string;
  buildingId?: string;
}

interface AgendaItem {
  id: string;
  sort_order: number;
  title: string;
  description: string | null;
  resolution_text: string | null;
  voting_principle: string;
  category: string | null;
  status: string | null;
  attachment_paths: string[] | null;
  requires_double_qualified: boolean;
  double_qualified_relevant: boolean;
  requires_resolution: boolean;
  is_actionable: boolean;
}

const votingPrinciples = [
  { value: "mea", label: "MEA (Wertprinzip)" },
  { value: "headcount", label: "Kopfprinzip" },
  { value: "sqm", label: "Quadratmeter" },
];

const categories = [
  { value: "baulich", label: "Baulich" },
  { value: "finanziell", label: "Finanziell" },
  { value: "verwaltung", label: "Verwaltung" },
  { value: "sonstiges", label: "Sonstiges" },
];

export const AgendaItemEditor = ({ meetingId, buildingId }: AgendaItemEditorProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemDescription, setEditItemDescription] = useState("");
  const [editItemResolution, setEditItemResolution] = useState("");
  const [editItemPrinciple, setEditItemPrinciple] = useState("mea");
  const [editItemCategory, setEditItemCategory] = useState("sonstiges");
  const [editItemExistingPaths, setEditItemExistingPaths] = useState<string[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [editRequiresDQ, setEditRequiresDQ] = useState(false);
  const [editDQRelevant, setEditDQRelevant] = useState(false);
  const [editRequiresResolution, setEditRequiresResolution] = useState(true);
  const [editIsActionable, setEditIsActionable] = useState(false);

  // New item form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newResolution, setNewResolution] = useState("");
  const [newPrinciple, setNewPrinciple] = useState("mea");
  const [newCategory, setNewCategory] = useState("sonstiges");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newRequiresDQ, setNewRequiresDQ] = useState(false);
  const [newDQRelevant, setNewDQRelevant] = useState(false);
  const [newRequiresResolution, setNewRequiresResolution] = useState(true);
  const [newIsActionable, setNewIsActionable] = useState(false);

  // AI suggestion state
  const [newAiSuggestion, setNewAiSuggestion] = useState<string | null>(null);
  const [isGeneratingNew, setIsGeneratingNew] = useState(false);
  const [editAiSuggestion, setEditAiSuggestion] = useState<string | null>(null);
  const [isGeneratingEdit, setIsGeneratingEdit] = useState(false);

  // DMS picker state
  const [newDmsOpen, setNewDmsOpen] = useState(false);
  const [editDmsOpen, setEditDmsOpen] = useState(false);
  const [newDmsPaths, setNewDmsPaths] = useState<string[]>([]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["etv-agenda-items", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as AgendaItem[];
    },
  });

  // Load resolution templates
  const { data: templates = [] } = useQuery({
    queryKey: ["etv-resolution-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_resolution_templates")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const paths: string[] = [];
    for (const file of files) {
      const path = `etv-attachments/${buildingId || "general"}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("building-files").upload(path, file);
      if (uploadErr) throw uploadErr;
      paths.push(path);
    }
    return paths;
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const uploadedPaths = await uploadFiles(newFiles);
      const attachmentPaths = [...newDmsPaths, ...uploadedPaths];
      const { error } = await supabase.from("etv_agenda_items").insert({
        meeting_id: meetingId,
        sort_order: items.length + 1,
        title: newTitle,
        description: newDescription || null,
        resolution_text: newRequiresResolution ? (newResolution || null) : null,
        voting_principle: newPrinciple,
        category: newCategory,
        attachment_paths: attachmentPaths.length > 0 ? attachmentPaths : null,
        requires_double_qualified: newRequiresResolution ? newRequiresDQ : false,
        double_qualified_relevant: newRequiresResolution ? newDQRelevant : false,
        requires_resolution: newRequiresResolution,
        is_actionable: newRequiresResolution ? newIsActionable : false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
      setNewTitle("");
      setNewDescription("");
      setNewResolution("");
      setNewPrinciple("mea");
      setNewCategory("sonstiges");
      setNewFiles([]);
      setNewDmsPaths([]);
      setNewAiSuggestion(null);
      setNewRequiresDQ(false);
      setNewDQRelevant(false);
      setNewRequiresResolution(true);
      setNewIsActionable(false);
      toast({ title: "TOP hinzugefügt" });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("etv_agenda_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
      toast({ title: "TOP gelöscht" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderedItems: { id: string; sort_order: number }[]) => {
      for (const item of reorderedItems) {
        const { error } = await supabase
          .from("etv_agenda_items")
          .update({ sort_order: item.sort_order } as any)
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
    },
  });

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = Array.from(items);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const updates = reordered.map((item, idx) => ({ id: item.id, sort_order: idx + 1 }));
    reorderMutation.mutate(updates);
  }, [items, reorderMutation]);

  const updateMutation = useMutation({
    mutationFn: async (item: Partial<AgendaItem> & { id: string }) => {
      const { id, ...update } = item;
      const { error } = await supabase.from("etv_agenda_items").update(update as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
      toast({ title: "TOP aktualisiert" });
    },
  });

  const startEditing = (item: AgendaItem) => {
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
    setEditItemDescription(item.description || "");
    setEditItemResolution(item.resolution_text || "");
    setEditItemPrinciple(item.voting_principle);
    setEditItemCategory(item.category || "sonstiges");
    setEditItemExistingPaths(item.attachment_paths || []);
    setEditNewFiles([]);
    setEditAiSuggestion(null);
    setEditRequiresDQ(item.requires_double_qualified || false);
    setEditDQRelevant(item.double_qualified_relevant || false);
    setEditRequiresResolution(item.requires_resolution !== false);
    setEditIsActionable((item as any).is_actionable || false);
  };

  const saveEdit = async () => {
    if (!editingItemId || !editItemTitle) return;
    
    let allPaths = [...editItemExistingPaths];
    if (editNewFiles.length > 0) {
      const newPaths = await uploadFiles(editNewFiles);
      allPaths = [...allPaths, ...newPaths];
    }

    updateMutation.mutate({
      id: editingItemId,
      title: editItemTitle,
      description: editItemDescription || null,
      resolution_text: editRequiresResolution ? (editItemResolution || null) : null,
      voting_principle: editItemPrinciple,
      category: editItemCategory,
      attachment_paths: allPaths.length > 0 ? allPaths : null,
      requires_double_qualified: editRequiresResolution ? editRequiresDQ : false,
      double_qualified_relevant: editRequiresResolution ? editDQRelevant : false,
      requires_resolution: editRequiresResolution,
      is_actionable: editRequiresResolution ? editIsActionable : false,
    } as any);
    setEditingItemId(null);
    setEditNewFiles([]);
    setEditAiSuggestion(null);
  };

  const applyTemplate = (template: any, target: "new" | "edit") => {
    if (target === "new") {
      setNewTitle(template.title);
      setNewDescription(template.description || "");
      setNewResolution(template.resolution_text || "");
      setNewPrinciple(template.voting_principle || "mea");
      setNewCategory(template.category || "sonstiges");
      setNewRequiresDQ(template.requires_double_qualified || false);
      setNewDQRelevant(template.double_qualified_relevant || false);
      setNewRequiresResolution(template.requires_resolution !== false);
      setNewIsActionable(template.is_actionable || false);
    } else {
      setEditItemTitle(template.title);
      setEditItemDescription(template.description || "");
      setEditItemResolution(template.resolution_text || "");
      setEditItemPrinciple(template.voting_principle || "mea");
      setEditItemCategory(template.category || "sonstiges");
      setEditRequiresDQ(template.requires_double_qualified || false);
      setEditDQRelevant(template.double_qualified_relevant || false);
      setEditRequiresResolution(template.requires_resolution !== false);
      setEditIsActionable(template.is_actionable || false);
    }
    toast({ title: "Vorlage übernommen" });
  };

  const generateResolution = async (
    title: string,
    description: string,
    setLoading: (v: boolean) => void,
    setSuggestion: (v: string | null) => void
  ) => {
    if (!title) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-resolution-text", {
        body: { title, description: description || undefined },
      });
      if (error) throw error;
      if (data?.resolutionText) {
        setSuggestion(data.resolutionText);
      } else {
        throw new Error("Keine Antwort erhalten");
      }
    } catch (err: any) {
      toast({ title: "KI-Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getFileDownloadUrl = async (path: string) => {
    const { data } = await supabase.storage.from("building-files").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const removeExistingPath = (index: number) => {
    setEditItemExistingPaths(prev => prev.filter((_, i) => i !== index));
  };

  const renderAiSuggestion = (
    suggestion: string | null,
    onAccept: () => void,
    onDismiss: () => void,
    onChange: (text: string) => void,
  ) => {
    if (!suggestion) return null;
    return (
      <div className="border border-primary/30 bg-primary/5 rounded-md p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-primary flex items-center gap-1">
            <Wand2 className="h-3 w-3" />
            KI-Vorschlag
          </span>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-5 w-5 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={onAccept} title="Übernehmen">
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:bg-destructive/10" onClick={onDismiss} title="Verwerfen">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <Textarea
          value={suggestion}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[100px] resize-y text-sm bg-transparent border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    );
  };

  const renderDoubleQualifiedCheckboxes = (
    requiresDQ: boolean,
    setRequiresDQ: (v: boolean) => void,
    dqRelevant: boolean,
    setDQRelevant: (v: boolean) => void,
  ) => (
    <div className="space-y-2 border rounded-md p-3 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground">Doppelt qualifizierte Mehrheit</p>
      <div className="flex items-center gap-2">
        <Checkbox id="req-dq" checked={requiresDQ} onCheckedChange={(c) => setRequiresDQ(!!c)} />
        <Label htmlFor="req-dq" className="text-xs cursor-pointer">Erfordert doppelt qualifizierte Mehrheit</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="dq-rel" checked={dqRelevant} onCheckedChange={(c) => setDQRelevant(!!c)} />
        <Label htmlFor="dq-rel" className="text-xs cursor-pointer">Doppelt qualifizierte Mehrheit relevant (Ergebnis anzeigen)</Label>
      </div>
    </div>
  );

  const renderTemplateDropdown = (target: "new" | "edit") => {
    if (templates.length === 0) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs">
            <BookTemplate className="h-3.5 w-3.5" />
            Vorlage
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">TOP-Vorlage wählen</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {templates.map((t: any) => (
            <DropdownMenuItem key={t.id} onClick={() => applyTemplate(t, target)} className="text-xs">
              {t.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderEditAttachments = () => (
    <div className="space-y-1.5">
      <Label className="text-xs">Anhänge</Label>
      <div className="border border-dashed rounded-md p-3">
        <input
          ref={editFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              setEditNewFiles(prev => [...prev, ...Array.from(e.target.files!)]);
            }
          }}
        />
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => editFileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Vom Computer
          </Button>
          <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => setEditDmsOpen(true)}>
            <FolderOpen className="h-4 w-4" />
            Aus DMS
          </Button>
        </div>
        {editItemExistingPaths.length > 0 && (
          <div className="mt-2 space-y-1">
            {editItemExistingPaths.map((path, i) => {
              const fileName = path.split("/").pop() || path;
              return (
                <div key={`existing-${i}`} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                  <span className="flex items-center gap-1 truncate">
                    <FileText className="h-3 w-3 flex-shrink-0" />
                    {fileName.replace(/^\d+-/, "")}
                  </span>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeExistingPath(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {editNewFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {editNewFiles.map((file, i) => (
              <div key={`new-${i}`} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                <span className="flex items-center gap-1 truncate">
                  <FileText className="h-3 w-3 flex-shrink-0" />
                  {file.name}
                  <Badge variant="secondary" className="text-[9px] h-4">Neu</Badge>
                </span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditNewFiles(prev => prev.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Existing items with drag & drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="agenda-items">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
              {items.map((item, idx) => (
                <Draggable key={item.id} draggableId={item.id} index={idx} isDragDisabled={!!editingItemId}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.draggableProps}>
                      <Card className={`relative ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : ""}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex items-center gap-2 text-muted-foreground pt-1">
                              <div {...provided.dragHandleProps}>
                                <GripVertical className="h-4 w-4 cursor-grab" />
                              </div>
                              <span className="text-sm font-mono font-bold">TOP {idx + 1}</span>
                            </div>
                            <div className="flex-1 space-y-2">
                              {editingItemId === item.id ? (
                                /* Edit mode */
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold">TOP bearbeiten</Label>
                                    {editRequiresResolution && renderTemplateDropdown("edit")}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Titel *</Label>
                                      <Input value={editItemTitle} onChange={(e) => setEditItemTitle(e.target.value)} />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Kategorie</Label>
                                      <Select value={editItemCategory} onValueChange={setEditItemCategory}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {categories.map((c) => (
                                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Beschreibung</Label>
                                    <Textarea value={editItemDescription} onChange={(e) => setEditItemDescription(e.target.value)} rows={6} placeholder="Ausführliche Beschreibung des Tagesordnungspunkts..." />
                                  </div>
                                  <div className="flex items-center justify-between rounded-md border p-3 bg-muted/20">
                                    <div className="space-y-0.5">
                                      <Label className="text-xs font-medium flex items-center gap-1.5">
                                        <Gavel className="h-3.5 w-3.5" /> Beschluss erforderlich
                                      </Label>
                                      <p className="text-[11px] text-muted-foreground">
                                        Aktivieren, falls über diesen TOP abgestimmt werden soll. Andernfalls rein informativ.
                                      </p>
                                    </div>
                                    <Switch checked={editRequiresResolution} onCheckedChange={setEditRequiresResolution} />
                                  </div>
                                  {editRequiresResolution ? (
                                    <>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs">Abstimmungsmethode</Label>
                                        <Select value={editItemPrinciple} onValueChange={setEditItemPrinciple}>
                                          <SelectTrigger><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {votingPrinciples.map((v) => (
                                              <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Label className="text-xs">Beschlusstext</Label>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-muted-foreground hover:text-primary"
                                            onClick={() => generateResolution(editItemTitle, editItemDescription, setIsGeneratingEdit, setEditAiSuggestion)}
                                            disabled={isGeneratingEdit || !editItemTitle}
                                            title="Beschlusstext mit KI generieren"
                                          >
                                            {isGeneratingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                                          </Button>
                                        </div>
                                        <Textarea value={editItemResolution} onChange={(e) => setEditItemResolution(e.target.value)} rows={3} placeholder="Die Eigentümer beschließen..." />
                                        {renderAiSuggestion(
                                          editAiSuggestion,
                                          () => { setEditItemResolution(editAiSuggestion!); setEditAiSuggestion(null); },
                                          () => setEditAiSuggestion(null),
                                          setEditAiSuggestion,
                                        )}
                                      </div>
                                      {renderDoubleQualifiedCheckboxes(editRequiresDQ, setEditRequiresDQ, editDQRelevant, setEditDQRelevant)}
                                      <div className="flex items-center justify-between rounded-md border p-3 bg-muted/10">
                                        <div className="space-y-0.5">
                                          <Label className="text-xs font-medium flex items-center gap-1.5">
                                            <Wrench className="h-3.5 w-3.5" /> Beschluss ist umzusetzen
                                          </Label>
                                          <p className="text-[11px] text-muted-foreground">
                                            Erstellt nach der Versammlung automatisch einen Vorgang zur Nachverfolgung. Eigentümer sehen ihn auf der Beschlüsse-Seite und im Dashboard.
                                          </p>
                                        </div>
                                        <Switch checked={editIsActionable} onCheckedChange={setEditIsActionable} />
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-3 border">
                                      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                      <span>Dieser TOP ist rein informativ — kein Beschluss, keine Abstimmung.</span>
                                    </div>
                                  )}
                                  {renderEditAttachments()}
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => { setEditingItemId(null); setEditAiSuggestion(null); }}>Abbrechen</Button>
                                    <Button size="sm" onClick={saveEdit} disabled={!editItemTitle || updateMutation.isPending}>Speichern</Button>
                                  </div>
                                </div>
                              ) : (
                                /* View mode */
                                <>
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-semibold text-foreground">{item.title}</h4>
                                    <div className="flex items-center gap-2">
                                      {item.requires_resolution === false ? (
                                        <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 dark:text-blue-300">
                                          <Info className="h-3 w-3 mr-1" /> Informativ
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">
                                          {votingPrinciples.find((v) => v.value === item.voting_principle)?.label || item.voting_principle}
                                        </Badge>
                                      )}
                                      {item.requires_resolution !== false && item.requires_double_qualified && (
                                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                          DQ erforderlich
                                        </Badge>
                                      )}
                                      {item.category && (
                                        <Badge variant="secondary" className="text-xs">
                                          {categories.find((c) => c.value === item.category)?.label || item.category}
                                        </Badge>
                                      )}
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditing(item)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                  {item.description && (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
                                  )}
                                  {item.resolution_text && (
                                    <div className="bg-muted/50 rounded-md p-3 border">
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Beschlusstext:</p>
                                      <p className="text-sm whitespace-pre-wrap">{item.resolution_text}</p>
                                    </div>
                                  )}
                                  {item.attachment_paths && item.attachment_paths.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {item.attachment_paths.map((path, i) => {
                                        const fileName = path.split("/").pop() || path;
                                        return (
                                          <Button key={i} variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => getFileDownloadUrl(path)}>
                                            <FileText className="h-3 w-3" />
                                            {fileName.replace(/^\d+-/, "")}
                                          </Button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add new item form */}
      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-muted-foreground">Neuen TOP hinzufügen</h4>
            {newRequiresResolution && renderTemplateDropdown("new")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Titel *</Label>
              <Input
                placeholder="z.B. Bericht der Verwaltung über das Geschäftsjahr"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kategorie</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Beschreibung</Label>
            <Textarea
              placeholder="Ausführliche Beschreibung des Tagesordnungspunkts..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={6}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Gavel className="h-3.5 w-3.5" /> Beschluss erforderlich
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Aktivieren, falls über diesen TOP abgestimmt werden soll. Andernfalls rein informativ (z.B. Verwaltungsbericht).
              </p>
            </div>
            <Switch checked={newRequiresResolution} onCheckedChange={setNewRequiresResolution} />
          </div>
          {newRequiresResolution ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Abstimmungsmethode</Label>
                <Select value={newPrinciple} onValueChange={setNewPrinciple}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {votingPrinciples.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs">Beschlusstext</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-primary"
                    onClick={() => generateResolution(newTitle, newDescription, setIsGeneratingNew, setNewAiSuggestion)}
                    disabled={isGeneratingNew || !newTitle}
                    title="Beschlusstext mit KI generieren"
                  >
                    {isGeneratingNew ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  </Button>
                </div>
                <Textarea
                  placeholder="Die Eigentümer beschließen..."
                  value={newResolution}
                  onChange={(e) => setNewResolution(e.target.value)}
                  rows={3}
                />
                {renderAiSuggestion(
                  newAiSuggestion,
                  () => { setNewResolution(newAiSuggestion!); setNewAiSuggestion(null); },
                  () => setNewAiSuggestion(null),
                  setNewAiSuggestion,
                )}
              </div>
              {renderDoubleQualifiedCheckboxes(newRequiresDQ, setNewRequiresDQ, newDQRelevant, setNewDQRelevant)}
              <div className="flex items-center justify-between rounded-md border p-3 bg-muted/10">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5" /> Beschluss ist umzusetzen
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Erstellt nach der Versammlung automatisch einen Vorgang zur Nachverfolgung. Eigentümer sehen ihn auf der Beschlüsse-Seite und im Dashboard.
                  </p>
                </div>
                <Switch checked={newIsActionable} onCheckedChange={setNewIsActionable} />
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-3 border">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Dieser TOP ist rein informativ — kein Beschluss, keine Abstimmung.</span>
            </div>
          )}
          {/* File upload */}
          <div className="space-y-1.5">
            <Label className="text-xs">Anhänge (optional)</Label>
            <div className="border border-dashed rounded-md p-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setNewFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  }
                }}
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Vom Computer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={() => setNewDmsOpen(true)}
                >
                  <FolderOpen className="h-4 w-4" />
                  Aus DMS
                </Button>
              </div>
              {newDmsPaths.length > 0 && (
                <div className="mt-2 space-y-1">
                  {newDmsPaths.map((path, i) => {
                    const fileName = (path.split("/").pop() || path).replace(/^\d+-/, "");
                    return (
                      <div key={`dms-${i}`} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                        <span className="flex items-center gap-1 truncate">
                          <FileText className="h-3 w-3 flex-shrink-0" />
                          {fileName}
                          <Badge variant="secondary" className="text-[9px] h-4">DMS</Badge>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setNewDmsPaths((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {newFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {newFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                      <span className="flex items-center gap-1 truncate">
                        <FileText className="h-3 w-3 flex-shrink-0" />
                        {file.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!newTitle || addMutation.isPending}
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              TOP hinzufügen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inline Template Management */}
      <TemplateManager templates={templates} queryClient={queryClient} toast={toast} />

      {/* DMS Picker Dialogs */}
      <DmsFilePickerDialog
        open={newDmsOpen}
        onOpenChange={setNewDmsOpen}
        buildingId={buildingId}
        excludePaths={newDmsPaths}
        onSelect={(paths) => setNewDmsPaths((prev) => [...prev, ...paths])}
      />
      <DmsFilePickerDialog
        open={editDmsOpen}
        onOpenChange={setEditDmsOpen}
        buildingId={buildingId}
        excludePaths={editItemExistingPaths}
        onSelect={(paths) => setEditItemExistingPaths((prev) => [...prev, ...paths])}
      />
    </div>
  );
};

// ============ INLINE TEMPLATE MANAGER ============
const TemplateManager = ({ templates, queryClient, toast }: { templates: any[]; queryClient: any; toast: any }) => {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [votingPrinciple, setVotingPrinciple] = useState("mea");
  const [category, setCategory] = useState("sonstiges");
  const [requiresResolution, setRequiresResolution] = useState(true);
  const [requiresDQ, setRequiresDQ] = useState(false);
  const [dqRelevant, setDqRelevant] = useState(false);
  const [tplIsActionable, setTplIsActionable] = useState(false);

  const votingPrinciples = [
    { value: "mea", label: "MEA (Wertprinzip)" },
    { value: "headcount", label: "Kopfprinzip" },
    { value: "sqm", label: "Quadratmeter" },
  ];
  const categories = [
    { value: "baulich", label: "Baulich" },
    { value: "finanziell", label: "Finanziell" },
    { value: "verwaltung", label: "Verwaltung" },
    { value: "sonstiges", label: "Sonstiges" },
  ];

  const resetForm = () => {
    setTitle(""); setDescription(""); setResolutionText(""); setVotingPrinciple("mea");
    setCategory("sonstiges"); setRequiresResolution(true);
    setRequiresDQ(false); setDqRelevant(false); setTplIsActionable(false); setEditingId(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (t: any) => {
    setEditingId(t.id);
    setTitle(t.title);
    setDescription(t.description || "");
    setResolutionText(t.resolution_text || "");
    setVotingPrinciple(t.voting_principle || "mea");
    setCategory(t.category || "sonstiges");
    setRequiresResolution(t.requires_resolution !== false);
    setRequiresDQ(t.requires_double_qualified || false);
    setDqRelevant(t.double_qualified_relevant || false);
    setTplIsActionable(t.is_actionable || false);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description: description || null,
        resolution_text: requiresResolution ? (resolutionText || null) : null,
        voting_principle: votingPrinciple,
        category,
        requires_resolution: requiresResolution,
        requires_double_qualified: requiresResolution ? requiresDQ : false,
        double_qualified_relevant: requiresResolution ? dqRelevant : false,
        is_actionable: requiresResolution ? tplIsActionable : false,
      } as any;
      if (editingId) {
        const { error } = await supabase.from("etv_resolution_templates").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("etv_resolution_templates").insert({ ...payload, sort_order: templates.length + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-resolution-templates"] });
      setDialogOpen(false); resetForm();
      toast({ title: editingId ? "Vorlage aktualisiert" : "Vorlage erstellt" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("etv_resolution_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-resolution-templates"] });
      toast({ title: "Vorlage gelöscht" });
    },
  });

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className="border-dashed border-muted-foreground/30">
          <CollapsibleTrigger asChild>
            <CardContent className="p-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  TOP-Vorlagen verwalten ({templates.length})
                </span>
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardContent>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-3 px-3 space-y-2">
              {templates.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded border text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{t.title}</span>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {t.requires_resolution === false ? (
                        <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 dark:text-blue-300">Informativ</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          {votingPrinciples.find(v => v.value === t.voting_principle)?.label || t.voting_principle}
                        </Badge>
                      )}
                      {t.requires_resolution !== false && t.requires_double_qualified && (
                        <Badge className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">DQ</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(t.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> Neue Vorlage
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Vorlage bearbeiten" : "Neue TOP-Vorlage"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Titel *</Label>
              <Input placeholder="z.B. Genehmigung der Jahresabrechnung" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beschreibung</Label>
              <Textarea
                placeholder="Hintergrund, Erläuterungen, Kontext zum TOP..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kategorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Beschluss erforderlich */}
            <div className="border rounded-md p-3 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Gavel className="h-3.5 w-3.5" /> Beschluss erforderlich
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Aus = rein informativer TOP (keine Abstimmung).</p>
                </div>
                <Checkbox checked={requiresResolution} onCheckedChange={(c) => setRequiresResolution(!!c)} />
              </div>

              {requiresResolution ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Beschlusstext</Label>
                    <Textarea
                      placeholder="Die Eigentümer beschließen..."
                      value={resolutionText}
                      onChange={(e) => setResolutionText(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Abstimmungsmethode</Label>
                    <Select value={votingPrinciple} onValueChange={setVotingPrinciple}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {votingPrinciples.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="tpl-dq" checked={requiresDQ} onCheckedChange={(c) => setRequiresDQ(!!c)} />
                    <Label htmlFor="tpl-dq" className="text-xs cursor-pointer">Erfordert doppelt qualifizierte Mehrheit</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="tpl-dq-rel" checked={dqRelevant} onCheckedChange={(c) => setDqRelevant(!!c)} />
                    <Label htmlFor="tpl-dq-rel" className="text-xs cursor-pointer">Doppelt qualifizierte Mehrheit relevant (Ergebnis anzeigen)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="tpl-actionable" checked={tplIsActionable} onCheckedChange={(c) => setTplIsActionable(!!c)} />
                    <Label htmlFor="tpl-actionable" className="text-xs cursor-pointer flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" /> Beschluss ist umzusetzen (Vorgang automatisch anlegen)
                    </Label>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-background rounded-md p-3 border">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Rein informativer TOP — kein Beschluss, keine Abstimmung.</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!title || saveMutation.isPending}>{editingId ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
