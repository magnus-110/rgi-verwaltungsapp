import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PromptCategory {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
}

interface PromptTemplate {
  id: string;
  category_id: string;
  title: string;
  content: string;
}

interface EditPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: PromptTemplate | null;
  categories: PromptCategory[];
  onSuccess: () => void;
}

export function EditPromptDialog({
  open,
  onOpenChange,
  prompt,
  categories,
  onSuccess,
}: EditPromptDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (prompt) {
      setTitle(prompt.title);
      setContent(prompt.content);
      setCategoryId(prompt.category_id || "");
    }
  }, [prompt]);

  const handleSubmit = async () => {
    if (!prompt || !title.trim() || !content.trim() || !categoryId) {
      toast({
        title: "Fehlende Eingaben",
        description: "Bitte füllen Sie alle Felder aus.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("prompt_templates")
        .update({
          title: title.trim(),
          content: content.trim(),
          category_id: categoryId,
        })
        .eq("id", prompt.id);

      if (error) throw error;

      toast({
        title: "Prompt aktualisiert",
        description: "Der Prompt wurde erfolgreich gespeichert.",
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error updating prompt:", error);
      toast({
        title: "Fehler",
        description: "Der Prompt konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!prompt) return;

    setIsSubmitting(true);
    try {
      // First delete any favorites referencing this prompt
      await supabase
        .from("prompt_favorites")
        .delete()
        .eq("prompt_id", prompt.id);

      // Then delete the prompt itself
      const { error } = await supabase
        .from("prompt_templates")
        .delete()
        .eq("id", prompt.id);

      if (error) throw error;

      toast({
        title: "Prompt gelöscht",
        description: "Der Prompt wurde erfolgreich entfernt.",
      });

      setDeleteDialogOpen(false);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error deleting prompt:", error);
      toast({
        title: "Fehler",
        description: "Der Prompt konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prompt bearbeiten</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Titel</Label>
              <Input
                id="edit-title"
                placeholder="z.B. Mietminderung prüfen"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-content">Prompt-Text</Label>
              <Textarea
                id="edit-content"
                placeholder="Der vollständige Text, der ins Eingabefeld übernommen wird..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label>Kategorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={isSubmitting}
              className="sm:mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Löschen
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Speichere..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prompt löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie den Prompt "{prompt?.title}" wirklich löschen? 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
