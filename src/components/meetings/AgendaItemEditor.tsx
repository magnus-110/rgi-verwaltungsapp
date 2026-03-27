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
import { Plus, GripVertical, Trash2, Sparkles, Upload, FileText, X, Wand2, Loader2 } from "lucide-react";
import { AgendaAiAssistant } from "./AgendaAiAssistant";

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
  const [showAiFor, setShowAiFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New item form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newResolution, setNewResolution] = useState("");
  const [newPrinciple, setNewPrinciple] = useState("mea");
  const [newCategory, setNewCategory] = useState("sonstiges");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [showNewAi, setShowNewAi] = useState(false);
  const [isGeneratingNew, setIsGeneratingNew] = useState(false);

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

  const addMutation = useMutation({
    mutationFn: async () => {
      // Upload files
      let attachmentPaths: string[] = [];
      for (const file of newFiles) {
        const path = `etv-attachments/${buildingId || "general"}/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("building-files").upload(path, file);
        if (uploadErr) throw uploadErr;
        attachmentPaths.push(path);
      }

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
      setShowNewAi(false);
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

  const handleAiResult = (itemId: string, text: string) => {
    updateMutation.mutate({ id: itemId, resolution_text: text });
    setShowAiFor(null);
  };

  const handleGenerateNewResolution = async () => {
    if (!newTitle) return;
    setIsGeneratingNew(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-with-ai", {
        body: {
          message: `Formuliere einen rechtssicheren Beschlusstext für eine WEG-Eigentümerversammlung zum folgenden Tagesordnungspunkt:

Titel: ${newTitle}
${newDescription ? `Erläuterung: ${newDescription}` : ""}

Der Beschlusstext MUSS folgende Elemente enthalten:
1. WER: Beginne mit "Die Eigentümer beschließen..."
2. WAS: Konkreter Beschlussgegenstand
3. WIE: Umsetzungsweise, ggf. Beauftragung der Verwaltung mit der Durchführung
4. WANN: Zeitrahmen für die Umsetzung (konkretes Datum oder "unverzüglich" oder "bis spätestens...")

Zusätzliche Anforderungen:
- Rechtlich korrekt nach WEG-Recht formuliert
- Klar und eindeutig
- Der Verwaltung soll ein angemessener Handlungsspielraum bei der Umsetzung eingeräumt werden (z.B. "Die Verwaltung wird ermächtigt, die erforderlichen Maßnahmen zu veranlassen und Angebote bis zu einem angemessenen Rahmen einzuholen"), ohne dies explizit als "finanziellen Spielraum" zu benennen.

Antworte NUR mit dem Beschlusstext, ohne zusätzliche Erklärungen.`,
          buildingId: buildingId,
          managementMode: "weg",
        },
      });
      if (error) throw error;
      const responseText = typeof data === "string"
        ? data
        : data?.response || data?.message || data?.choices?.[0]?.message?.content || "";
      if (responseText) {
        setNewResolution(responseText);
      }
    } catch (err: any) {
      toast({ title: "KI-Fehler", description: err.message, variant: "destructive" });
    } finally {
      setIsGeneratingNew(false);
    }
  };

  const getFileDownloadUrl = async (path: string) => {
    const { data } = await supabase.storage.from("building-files").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowAiFor(showAiFor === item.id ? null : item.id)}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMutation.mutate(item.id)}
                    >
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
                {/* Attachments */}
                {item.attachment_paths && item.attachment_paths.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.attachment_paths.map((path, i) => {
                      const fileName = path.split("/").pop() || path;
                      return (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => getFileDownloadUrl(path)}
                        >
                          <FileText className="h-3 w-3" />
                          {fileName.replace(/^\d+-/, "")}
                        </Button>
                      );
                    })}
                  </div>
                )}
                {showAiFor === item.id && (
                  <AgendaAiAssistant
                    meetingId={meetingId}
                    buildingId={buildingId}
                    itemTitle={item.title}
                    itemDescription={item.description || ""}
                    onResult={(text) => handleAiResult(item.id, text)}
                    onClose={() => setShowAiFor(null)}
                  />
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
            <div className="flex items-center justify-between">
              <Label className="text-xs">Beschlusstext (optional)</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-amber-600 hover:text-amber-700"
                onClick={handleGenerateNewResolution}
                disabled={!newTitle || isGeneratingNew}
              >
                {isGeneratingNew ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                KI generieren
              </Button>
            </div>
            <Textarea
              placeholder="Die Eigentümer beschließen..."
              value={newResolution}
              onChange={(e) => setNewResolution(e.target.value)}
              rows={3}
            />
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
