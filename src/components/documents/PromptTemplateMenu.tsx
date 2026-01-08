import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Star, Scale, Receipt, Building2, MessageCircle, Folder } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { AddPromptDialog } from "./AddPromptDialog";

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
  isFavorite?: boolean;
}

interface PromptTemplateMenuProps {
  onSelectPrompt: (content: string) => void;
  disabled?: boolean;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  scale: Scale,
  receipt: Receipt,
  'building-2': Building2,
  'message-circle': MessageCircle,
  folder: Folder,
};

export function PromptTemplateMenu({ onSelectPrompt, disabled }: PromptTemplateMenuProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch categories
      const { data: categoriesData } = await supabase
        .from("prompt_categories")
        .select("*")
        .order("sort_order");

      // Fetch prompts
      const { data: promptsData } = await supabase
        .from("prompt_templates")
        .select("*");

      // Fetch user favorites
      const { data: favoritesData } = await supabase
        .from("prompt_favorites")
        .select("prompt_id")
        .eq("user_id", user?.id);

      if (categoriesData) setCategories(categoriesData);
      if (promptsData) setPrompts(promptsData);
      if (favoritesData) {
        setFavorites(new Set(favoritesData.map(f => f.prompt_id)));
      }
    } catch (error) {
      console.error("Error fetching prompt data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = async (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.id) return;

    const isFavorite = favorites.has(promptId);

    if (isFavorite) {
      await supabase
        .from("prompt_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("prompt_id", promptId);
      
      setFavorites(prev => {
        const next = new Set(prev);
        next.delete(promptId);
        return next;
      });
    } else {
      await supabase
        .from("prompt_favorites")
        .insert({ user_id: user.id, prompt_id: promptId });
      
      setFavorites(prev => new Set([...prev, promptId]));
    }
  };

  const handleSelectPrompt = (content: string) => {
    onSelectPrompt(content);
    setOpen(false);
  };

  const getPromptsByCategory = (categoryId: string) => {
    return prompts.filter(p => p.category_id === categoryId);
  };

  const getFavoritePrompts = () => {
    return prompts.filter(p => favorites.has(p.id));
  };

  const renderIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName] || Folder;
    return <IconComponent className="h-4 w-4" />;
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="h-9 w-9 rounded-full flex-shrink-0"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="start" 
          className="w-80 p-0"
          sideOffset={8}
        >
          <ScrollArea className="h-[400px]">
            <div className="p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  Laden...
                </div>
              ) : (
                <>
                  {/* Favorites Section */}
                  {getFavoritePrompts().length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        Favoriten
                      </div>
                      {getFavoritePrompts().map((prompt) => (
                        <button
                          key={prompt.id}
                          onClick={() => handleSelectPrompt(prompt.content)}
                          className="flex items-center justify-between w-full px-3 py-2 text-sm text-left rounded-md hover:bg-muted transition-colors"
                        >
                          <span className="truncate pr-2">{prompt.title}</span>
                          <Star
                            onClick={(e) => toggleFavorite(prompt.id, e)}
                            className="h-4 w-4 flex-shrink-0 fill-yellow-400 text-yellow-400 cursor-pointer hover:scale-110 transition-transform"
                          />
                        </button>
                      ))}
                      <div className="border-t my-2" />
                    </div>
                  )}

                  {/* Categories */}
                  {categories.map((category) => {
                    const categoryPrompts = getPromptsByCategory(category.id);
                    if (categoryPrompts.length === 0) return null;

                    return (
                      <div key={category.id} className="mb-3">
                        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground">
                          {renderIcon(category.icon)}
                          {category.name}
                        </div>
                        {categoryPrompts.map((prompt) => (
                          <button
                            key={prompt.id}
                            onClick={() => handleSelectPrompt(prompt.content)}
                            className="flex items-center justify-between w-full px-3 py-2 text-sm text-left rounded-md hover:bg-muted transition-colors"
                          >
                            <span className="truncate pr-2">{prompt.title}</span>
                            <Star
                              onClick={(e) => toggleFavorite(prompt.id, e)}
                              className={cn(
                                "h-4 w-4 flex-shrink-0 cursor-pointer hover:scale-110 transition-transform",
                                favorites.has(prompt.id)
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-muted-foreground/50 hover:text-yellow-400"
                              )}
                            />
                          </button>
                        ))}
                      </div>
                    );
                  })}

                  {/* Add Prompt Button */}
                  <div className="border-t pt-2 mt-2">
                    <button
                      onClick={() => {
                        setOpen(false);
                        setAddDialogOpen(true);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left rounded-md hover:bg-muted transition-colors text-primary"
                    >
                      <Plus className="h-4 w-4" />
                      Prompt hinzufügen
                    </button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <AddPromptDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        categories={categories}
        onSuccess={fetchData}
      />
    </>
  );
}
