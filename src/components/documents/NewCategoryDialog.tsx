import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Scale, Receipt, Building2, MessageCircle, Folder, FileText, HelpCircle, Lightbulb, Home } from "lucide-react";

interface PromptCategory {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
}

interface NewCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (category: PromptCategory) => void;
}

const iconOptions = [
  { value: "folder", label: "Ordner", icon: Folder },
  { value: "scale", label: "Waage", icon: Scale },
  { value: "receipt", label: "Quittung", icon: Receipt },
  { value: "building-2", label: "Gebäude", icon: Building2 },
  { value: "message-circle", label: "Nachricht", icon: MessageCircle },
  { value: "file-text", label: "Dokument", icon: FileText },
  { value: "help-circle", label: "Hilfe", icon: HelpCircle },
  { value: "lightbulb", label: "Idee", icon: Lightbulb },
  { value: "home", label: "Haus", icon: Home },
];

export function NewCategoryDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewCategoryDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: "Fehlende Eingabe",
        description: "Bitte geben Sie einen Namen ein.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Get the highest sort_order
      const { data: maxOrder } = await supabase
        .from("prompt_categories")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();

      const newSortOrder = (maxOrder?.sort_order ?? 0) + 1;

      const { data, error } = await supabase
        .from("prompt_categories")
        .insert({
          name: name.trim(),
          icon,
          sort_order: newSortOrder,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Kategorie erstellt",
        description: "Die Kategorie wurde erfolgreich hinzugefügt.",
      });

      setName("");
      setIcon("folder");
      onOpenChange(false);
      onSuccess(data);
    } catch (error: any) {
      console.error("Error creating category:", error);
      toast({
        title: "Fehler",
        description: "Die Kategorie konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const SelectedIcon = iconOptions.find(i => i.value === icon)?.icon || Folder;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Neue Kategorie</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="categoryName">Name</Label>
            <Input
              id="categoryName"
              placeholder="z.B. Vertragsrecht"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <SelectedIcon className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {iconOptions.map((option) => {
                  const IconComponent = option.icon;
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4" />
                        {option.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Speichere..." : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
