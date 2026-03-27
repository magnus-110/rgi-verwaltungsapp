import { useState } from "react";
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
import { Plus, GripVertical, Trash2, Sparkles } from "lucide-react";
import { AgendaAiAssistant } from "./AgendaAiAssistant";
import { SubmittedTopsSection } from "./SubmittedTopsSection";

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

export const AgendaItemEditor = ({ meetingId }: AgendaItemEditorProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAiFor, setShowAiFor] = useState<string | null>(null);

  // New item form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newResolution, setNewResolution] = useState("");
  const [newPrinciple, setNewPrinciple] = useState("mea");
  const [newCategory, setNewCategory] = useState("sonstiges");

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
      const { error } = await supabase.from("etv_agenda_items").insert({
        meeting_id: meetingId,
        sort_order: items.length + 1,
        title: newTitle,
        description: newDescription || null,
        resolution_text: newResolution || null,
        voting_principle: newPrinciple,
        category: newCategory,
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
      setEditingId(null);
      toast({ title: "TOP aktualisiert" });
    },
  });

  const handleAiResult = (itemId: string, text: string) => {
    updateMutation.mutate({ id: itemId, resolution_text: text });
    setShowAiFor(null);
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
                {showAiFor === item.id && (
                  <AgendaAiAssistant
                    meetingId={meetingId}
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
            <Label className="text-xs">Beschlusstext (optional)</Label>
            <Textarea
              placeholder="Die Eigentümer beschließen..."
              value={newResolution}
              onChange={(e) => setNewResolution(e.target.value)}
              rows={2}
            />
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
