import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Loader2, Mic, MicOff, Plus, Globe, Check, Star, X, FileText, ChevronLeft, SearchCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AddPromptDialog } from "./AddPromptDialog";
import { Scale, Receipt, Building2, MessageCircle, Folder } from "lucide-react";

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

interface ChatInputFieldProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  className?: string;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: () => void;
  deepResearchEnabled?: boolean;
  onDeepResearchToggle?: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  scale: Scale,
  receipt: Receipt,
  'building-2': Building2,
  'message-circle': MessageCircle,
  folder: Folder,
};

export function ChatInputField({
  onSend,
  isLoading,
  disabled,
  className,
  webSearchEnabled = false,
  onWebSearchToggle,
  deepResearchEnabled = false,
  onDeepResearchToggle,
}: ChatInputFieldProps) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'prompts'>('main');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Prompt data
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [promptsLoading, setPromptsLoading] = useState(false);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  // Fetch prompts when menu opens
  useEffect(() => {
    if (menuOpen) {
      fetchPromptData();
    }
  }, [menuOpen]);

  const fetchPromptData = async () => {
    setPromptsLoading(true);
    try {
      const { data: categoriesData } = await supabase
        .from("prompt_categories")
        .select("*")
        .order("sort_order");

      const { data: promptsData } = await supabase
        .from("prompt_templates")
        .select("*");

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
      setPromptsLoading(false);
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

  const handleSelectPrompt = (content: string) => {
    setValue(content);
    setMenuOpen(false);
    setMenuView('main');
  };

  // Reset menu view when closing
  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) {
      setMenuView('main');
    }
  };

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'de-DE';

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setValue(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'not-allowed') {
          toast({
            title: "Mikrofon-Zugriff verweigert",
            description: "Bitte erlauben Sie den Zugriff auf das Mikrofon in Ihren Browser-Einstellungen.",
            variant: "destructive",
          });
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [toast]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast({
        title: "Nicht unterstützt",
        description: "Spracherkennung wird von Ihrem Browser nicht unterstützt.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Failed to start recognition:', error);
      }
    }
  };

  const handleSend = () => {
    if (!value.trim() || isLoading || disabled) return;
    onSend(value.trim());
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasSpeechRecognition = typeof window !== 'undefined' && 
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <>
      <div className={cn("w-full max-w-3xl mx-auto px-4", className)}>
        {/* Badges (positioned above the pill) */}
        {(webSearchEnabled || deepResearchEnabled) && (
          <div className="mb-2 ml-1 flex gap-2">
            {webSearchEnabled && (
              <button
                onClick={onWebSearchToggle}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-xs hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Suche</span>
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
              {deepResearchEnabled && (
                <button
                  onClick={onDeepResearchToggle}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs hover:bg-muted/80 transition-colors"
                >
                  <SearchCheck className="h-3.5 w-3.5" />
                  <span>Tiefenrecherche</span>
                  <X className="h-3 w-3 ml-0.5" />
                </button>
              )}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-full border border-border bg-muted/50 shadow-sm px-4 py-2">
          {/* Plus Menu */}
          <Popover open={menuOpen} onOpenChange={handleMenuOpenChange}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isLoading || disabled}
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
              {menuView === 'main' ? (
                /* Main Menu View */
                <div className="p-2">
                  {/* Internet Search Toggle */}
                  <button
                    onClick={() => {
                      onWebSearchToggle?.();
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                    <span className="text-sm flex-1 text-left">Internetsuche</span>
                    {webSearchEnabled && <Check className="h-4 w-4 text-primary" />}
                  </button>

                  {/* Deep Research Toggle */}
                    <button
                      onClick={() => {
                        onDeepResearchToggle?.();
                        setMenuOpen(false);
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md hover:bg-muted transition-colors"
                    >
                      <SearchCheck className="h-4 w-4" />
                      <span className="flex-1 text-left text-sm">Tiefenrecherche</span>
                      {deepResearchEnabled && <Check className="h-4 w-4 text-primary" />}
                    </button>

                  {/* Prompts Menu Item */}
                  <button
                    onClick={() => setMenuView('prompts')}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="text-sm flex-1 text-left">Prompt-Vorlagen</span>
                  </button>
                </div>
              ) : (
                /* Prompts View */
                <div className="p-2">
                  {/* Back Button */}
                  <button
                    onClick={() => setMenuView('main')}
                    className="flex items-center gap-2 w-full px-3 py-2 mb-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Zurück</span>
                  </button>
                  
                  <Separator className="mb-2" />

                  <ScrollArea className="max-h-[350px]">
                    {promptsLoading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                        Laden...
                      </div>
                    ) : (
                      <TooltipProvider delayDuration={300}>
                        {/* Favorites Section */}
                        {getFavoritePrompts().length > 0 && (
                          <div className="mb-3">
                            <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                              Favoriten
                            </div>
                            {getFavoritePrompts().map((prompt) => (
                              <Tooltip key={prompt.id}>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleSelectPrompt(prompt.content)}
                                    className="flex items-center justify-between w-full px-3 py-2 text-sm text-left rounded-md hover:bg-muted transition-colors"
                                  >
                                    <span className="truncate pr-2">{prompt.title}</span>
                                    <Star
                                      onClick={(e) => toggleFavorite(prompt.id, e)}
                                      className="h-4 w-4 flex-shrink-0 fill-yellow-400 text-yellow-400 cursor-pointer hover:scale-110 transition-transform"
                                    />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-sm p-3" sideOffset={8}>
                                  <p className="text-sm whitespace-pre-wrap">{prompt.content}</p>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                            <Separator className="my-2" />
                          </div>
                        )}

                        {/* Categories */}
                        {categories.map((category) => {
                          const categoryPrompts = getPromptsByCategory(category.id);
                          if (categoryPrompts.length === 0) return null;

                          return (
                            <div key={category.id} className="mb-3">
                              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {renderIcon(category.icon)}
                                {category.name}
                              </div>
                              {categoryPrompts.map((prompt) => (
                                <Tooltip key={prompt.id}>
                                  <TooltipTrigger asChild>
                                    <button
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
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-sm p-3" sideOffset={8}>
                                    <p className="text-sm whitespace-pre-wrap">{prompt.content}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          );
                        })}

                        {/* Add Prompt Button */}
                        <Separator className="my-2" />
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            setMenuView('main');
                            setAddDialogOpen(true);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left rounded-md hover:bg-muted transition-colors text-primary"
                        >
                          <Plus className="h-4 w-4" />
                          Prompt hinzufügen
                        </button>
                      </TooltipProvider>
                    )}
                  </ScrollArea>
                </div>
              )}
            </PopoverContent>
          </Popover>
          
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stellen Sie eine Frage..."
            disabled={isLoading || disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent py-2 text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "min-h-[40px] max-h-[200px]"
            )}
          />
          
          {/* Voice Input Button */}
          {hasSpeechRecognition && (
            <Button
              type="button"
              onClick={toggleListening}
              disabled={isLoading || disabled}
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 rounded-full flex-shrink-0",
                isListening && "text-destructive bg-destructive/10"
              )}
            >
              {isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          )}
          
          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={!value.trim() || isLoading || disabled}
            size="icon"
            className="h-9 w-9 rounded-full flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <AddPromptDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        categories={categories}
        onSuccess={fetchPromptData}
      />
    </>
  );
}
