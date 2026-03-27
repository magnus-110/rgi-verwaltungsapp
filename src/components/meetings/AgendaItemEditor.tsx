import { useState, useRef } from "react";
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
import { Plus, GripVertical, Trash2, Pencil, Upload, FileText, X, Wand2, Loader2, Check } from "lucide-react";

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
}

const votingPrinciples = [
  { value: "mea", label: "MEA (Wertprinzip)" },
  { value: "headcount", label: "Kopfprinzip" },
  { value: "double_qualified", label: "Doppelt qualifizierte Mehrheit" },
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

  // New item form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newResolution, setNewResolution] = useState("");
  const [newPrinciple, setNewPrinciple] = useState("mea");
  const [newCategory, setNewCategory] = useState("sonstiges");
  const [newFiles, setNewFiles] = useState<File[]>([]);

  // AI suggestion state (unified design like email)
  const [newAiSuggestion, setNewAiSuggestion] = useState<string | null>(null);
  const [isGeneratingNew, setIsGeneratingNew] = useState(false);
  const [editAiSuggestion, setEditAiSuggestion] = useState<string | null>(null);
  const [isGeneratingEdit, setIsGeneratingEdit] = useState(false);

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
      const attachmentPaths = await uploadFiles(newFiles);
      const { error } = await supabase.from("etv_agenda_items").insert({
        meeting_id: meetingId,
        sort_order: items.length + 1,
        title: newTitle,
        description: newDescription || null,
        resolution_text: newResolution || null,
        voting_principle: newPrinciple,
        category: newCategory,
        attachment_paths: attachmentPaths.length > 0 ? attachmentPaths : null,
      });
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
      setNewAiSuggestion(null);
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

  const updateMutation = useMutation({
    mutationFn: async (item: Partial<AgendaItem> & { id: string }) => {
      const { id, ...update } = item;
      const { error } = await supabase.from("etv_agenda_items").update(update).eq("id", id);
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
  };

  const saveEdit = async () => {
    if (!editingItemId || !editItemTitle) return;
    
    // Upload new files
    let allPaths = [...editItemExistingPaths];
    if (editNewFiles.length > 0) {
      const newPaths = await uploadFiles(editNewFiles);
      allPaths = [...allPaths, ...newPaths];
    }

    updateMutation.mutate({
      id: editingItemId,
      title: editItemTitle,
      description: editItemDescription || null,
      resolution_text: editItemResolution || null,
      voting_principle: editItemPrinciple,
      category: editItemCategory,
      attachment_paths: allPaths.length > 0 ? allPaths : null,
    });
    setEditingItemId(null);
    setEditNewFiles([]);
    setEditAiSuggestion(null);
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

  // Unified AI suggestion component (same design as email)
  const AiSuggestionBox = ({
    suggestion,
    onAccept,
    onDismiss,
    onChange,
  }: {
    suggestion: string;
    onAccept: () => void;
    onDismiss: () => void;
    onChange: (text: string) => void;
  }) => (
    <div className="border border-primary/30 bg-primary/5 rounded-md p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-primary flex items-center gap-1">
          <Wand2 className="h-3 w-3" />
          KI-Vorschlag
        </span>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={onAccept}
            title="Übernehmen"
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-destructive hover:bg-destructive/10"
            onClick={onDismiss}
            title="Verwerfen"
          >
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

  // Attachment section for edit mode
  const EditAttachments = () => (
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => editFileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Dateien hinzufügen
        </Button>
        {/* Existing attachments */}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => removeExistingPath(i)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {/* New files */}
        {editNewFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {editNewFiles.map((file, i) => (
              <div key={`new-${i}`} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                <span className="flex items-center gap-1 truncate">
                  <FileText className="h-3 w-3 flex-shrink-0" />
                  {file.name}
                  <Badge variant="secondary" className="text-[9px] h-4">Neu</Badge>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setEditNewFiles(prev => prev.filter((_, j) => j !== i))}
                >
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
      {/* Existing items */}
      {items.map((item, idx) => (
        <Card key={item.id} className="relative">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-2 text-muted-foreground pt-1">
                <GripVertical className="h-4 w-4" />
                <span className="text-sm font-mono font-bold">TOP {idx + 1}</span>
              </div>
              <div className="flex-1 space-y-2">
                {editingItemId === item.id ? (
                  /* Edit mode */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Titel *</Label>
                        <Input value={editItemTitle} onChange={(e) => setEditItemTitle(e.target.value)} />
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1 space-y-1.5">
                          <Label className="text-xs">Abstimmung</Label>
                          <Select value={editItemPrinciple} onValueChange={setEditItemPrinciple}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {votingPrinciples.map((v) => (
                                <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 space-y-1.5">
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
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Erläuterung</Label>
                      <Textarea value={editItemDescription} onChange={(e) => setEditItemDescription(e.target.value)} rows={2} />
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
                      {editAiSuggestion !== null && (
                        <AiSuggestionBox
                          suggestion={editAiSuggestion}
                          onAccept={() => { setEditItemResolution(editAiSuggestion!); setEditAiSuggestion(null); }}
                          onDismiss={() => setEditAiSuggestion(null)}
                          onChange={setEditAiSuggestion}
                        />
                      )}
                    </div>
                    <EditAttachments />
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
                        <Badge variant="outline" className="text-xs">
                          {votingPrinciples.find((v) => v.value === item.voting_principle)?.label || item.voting_principle}
                        </Badge>
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
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                    {item.resolution_text && (
                      <div className="bg-muted/50 rounded-md p-3 border">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Beschlusstext:</p>
                        <p className="text-sm">{item.resolution_text}</p>
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
      ))}

      {/* Add new item form */}
      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">Neuen TOP hinzufügen</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Titel *</Label>
              <Input
                placeholder="z.B. Genehmigung der Jahresabrechnung"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Abstimmung</Label>
                <Select value={newPrinciple} onValueChange={setNewPrinciple}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {votingPrinciples.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1.5">
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
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Erläuterung</Label>
            <Textarea
              placeholder="Beschreibung des Tagesordnungspunkts..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs">Beschlusstext (optional)</Label>
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
            {newAiSuggestion !== null && (
              <AiSuggestionBox
                suggestion={newAiSuggestion}
                onAccept={() => { setNewResolution(newAiSuggestion!); setNewAiSuggestion(null); }}
                onDismiss={() => setNewAiSuggestion(null)}
                onChange={setNewAiSuggestion}
              />
            )}
          </div>
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Dateien auswählen
              </Button>
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
    </div>
  );
};
