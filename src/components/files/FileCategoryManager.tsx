import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  management_mode: string;
  sort_order: number;
}

interface FileCategoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managementMode: 'weg' | 'rent';
  onCategoriesChanged: () => void;
}

export function FileCategoryManager({ open, onOpenChange, managementMode, onCategoriesChanged }: FileCategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6B7280");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) fetchCategories();
  }, [open, managementMode]);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('building_file_categories')
      .select('*')
      .eq('management_mode', managementMode)
      .order('sort_order');
    if (data) setCategories(data as Category[]);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    const { error } = await supabase
      .from('building_file_categories')
      .insert({
        name: newName.trim(),
        color: newColor,
        management_mode: managementMode,
        sort_order: categories.length,
      });
    if (error) {
      toast.error("Fehler beim Erstellen");
    } else {
      toast.success("Kategorie erstellt");
      setNewName("");
      setNewColor("#6B7280");
      fetchCategories();
      onCategoriesChanged();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('building_file_categories')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error("Fehler beim Löschen");
    } else {
      toast.success("Kategorie gelöscht");
      fetchCategories();
      onCategoriesChanged();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Kategorien verwalten</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <Label>Neue Kategorie</Label>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name..."
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-10 h-10 rounded border cursor-pointer"
              />
              <Button size="icon" onClick={handleAdd} disabled={loading || !newName.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bestehende Kategorien</Label>
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg border">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm">{cat.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(cat.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine Kategorien vorhanden</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
