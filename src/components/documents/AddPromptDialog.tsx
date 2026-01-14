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
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NewCategoryDialog } from "./NewCategoryDialog";

interface PromptCategory {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
}

interface AddPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: PromptCategory[];
  onSuccess: () => void;
}

export function AddPromptDialog({
  open,
  onOpenChange,
  categories,
  onSuccess,
}: AddPromptDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCategoryDialogOpen, setNewCategoryDialogOpen] = useState(false);
  const [localCategories, setLocalCategories] = useState<PromptCategory[]>(categories);

  // Update local categories when props change
  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || !categoryId) {
      toast({
        title: "Fehlende Eingaben",
        description: "Bitte füllen Sie alle Felder aus.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("prompt_templates").insert({
        title: title.trim(),
        content: content.trim(),
        category_id: categoryId,
      });

      if (error) throw error;

      toast({
        title: "Prompt erstellt",
        description: "Der Prompt wurde erfolgreich hinzugefügt.",
      });

      // Reset form
      setTitle("");
      setContent("");
      setCategoryId("");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error creating prompt:", error);
      toast({
        title: "Fehler",
        description: "Der Prompt konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewCategory = (newCategory: PromptCategory) => {
    setLocalCategories(prev => [...prev, newCategory]);
    setCategoryId(newCategory.id);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neuen Prompt hinzufügen</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel</Label>
              <Input
                id="title"
                placeholder="z.B. Mietminderung prüfen"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Prompt-Text</Label>
              <Textarea
                id="content"
                placeholder="Der vollständige Text, der ins Eingabefeld übernommen wird..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Kategorie</Label>
              <div className="flex gap-2">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Kategorie auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {localCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setNewCategoryDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Speichere..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewCategoryDialog
        open={newCategoryDialogOpen}
        onOpenChange={setNewCategoryDialogOpen}
        onSuccess={handleNewCategory}
      />
    </>
  );
}
