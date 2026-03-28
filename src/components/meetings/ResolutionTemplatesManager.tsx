import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, BookTemplate } from "lucide-react";

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

export const ResolutionTemplatesManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [votingPrinciple, setVotingPrinciple] = useState("mea");
  const [category, setCategory] = useState("sonstiges");
  const [requiresDQ, setRequiresDQ] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
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

  const resetForm = () => {
    setTitle("");
    setResolutionText("");
    setVotingPrinciple("mea");
    setCategory("sonstiges");
    setRequiresDQ(false);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setTitle(t.title);
    setResolutionText(t.resolution_text || "");
    setVotingPrinciple(t.voting_principle || "mea");
    setCategory(t.category || "sonstiges");
    setRequiresDQ(t.requires_double_qualified || false);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        resolution_text: resolutionText || null,
        voting_principle: votingPrinciple,
        category,
        requires_double_qualified: requiresDQ,
        sort_order: editingId ? undefined : templates.length + 1,
      };

      if (editingId) {
        const { sort_order, ...updatePayload } = payload;
        const { error } = await supabase
          .from("etv_resolution_templates")
          .update(updatePayload as any)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("etv_resolution_templates")
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-resolution-templates"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editingId ? "Vorlage aktualisiert" : "Vorlage erstellt" });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BookTemplate className="h-5 w-5" />
            Beschlussvorlagen
          </h3>
          <p className="text-sm text-muted-foreground">
            Wiederverwendbare Vorlagen für häufige Beschlüsse
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Neue Vorlage
        </Button>
      </div>

      {templates.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <BookTemplate className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Noch keine Vorlagen erstellt.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {templates.map((t: any) => (
          <Card key={t.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="font-semibold text-sm">{t.title}</h4>
                  {t.resolution_text && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.resolution_text}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {votingPrinciples.find(v => v.value === t.voting_principle)?.label || t.voting_principle}
                    </Badge>
                    {t.category && (
                      <Badge variant="secondary" className="text-[10px]">
                        {categories.find(c => c.value === t.category)?.label || t.category}
                      </Badge>
                    )}
                    {t.requires_double_qualified && (
                      <Badge className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">DQ</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Vorlage bearbeiten" : "Neue Beschlussvorlage"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Titel *</Label>
              <Input placeholder="z.B. Genehmigung der Jahresabrechnung" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beschlusstext</Label>
              <Textarea placeholder="Die Eigentümer beschließen..." value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Abstimmungsmethode</Label>
                <Select value={votingPrinciple} onValueChange={setVotingPrinciple}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {votingPrinciples.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kategorie</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="tpl-dq" checked={requiresDQ} onCheckedChange={(c) => setRequiresDQ(!!c)} />
              <Label htmlFor="tpl-dq" className="text-xs cursor-pointer">Erfordert doppelt qualifizierte Mehrheit</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!title || saveMutation.isPending}>
              {editingId ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};