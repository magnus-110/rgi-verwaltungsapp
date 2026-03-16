import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Loader2, Mic, MicOff, Plus, Globe, Check, Star, X, FileText, ChevronLeft, SearchCheck, Pencil, ChevronRight, GripVertical, Wand2, FileSearch } from "lucide-react";
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
import { EditPromptDialog } from "./EditPromptDialog";
import { PromptEnhancerSuggestion } from "./PromptEnhancerSuggestion";
import { Scale, Receipt, Building2, MessageCircle, Folder } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

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
  sort_order?: number;
}

interface EnhancedPromptData {
  original: string;
  enhanced: string;
  categories: string[];
  features: string[];
  sourceHint: string;
  keywords: string[];
}

interface ChatInputFieldProps {
  onSend: (message: string, options?: {
    enhancedQuery?: string;
    filterCategories?: string[];
    filterFeatures?: string[];
    attachedFiles?: Array<{ file: File; storagePath: string }>;
  }) => void;
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
  const [menuView, setMenuView] = useState<'main' | 'prompts' | 'category'>('main');
  const [selectedCategory, setSelectedCategory] = useState<PromptCategory | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Prompt data
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [promptsLoading, setPromptsLoading] = useState(false);

  // Prompt enhancer state
  const [enhancedPrompt, setEnhancedPrompt] = useState<EnhancedPromptData | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    categories: string[];
    features: string[];
  } | null>(null);

  // Get initial height for max calculation (approx. 40px for single row)
  const initialHeight = 40;
  const maxHeight = initialHeight * 2; // Max double the initial size

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
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
        .select("*")
        .order("sort_order", { ascending: true });

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
    return prompts
      .filter(p => p.category_id === categoryId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };

  const getFavoritePrompts = () => {
    return prompts.filter(p => favorites.has(p.id));
  };

  const handleCategoryClick = (category: PromptCategory) => {
    setSelectedCategory(category);
    setMenuView('category');
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !selectedCategory) return;

    const categoryPrompts = getPromptsByCategory(selectedCategory.id);
    const reordered = Array.from(categoryPrompts);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    // Update local state immediately for responsiveness
    const updatedPrompts = prompts.map(p => {
      const newIndex = reordered.findIndex(rp => rp.id === p.id);
      if (newIndex !== -1) {
        return { ...p, sort_order: newIndex };
      }
      return p;
    });
    setPrompts(updatedPrompts);

    // Update database
    try {
      await Promise.all(
        reordered.map((prompt, index) =>
          supabase
            .from("prompt_templates")
            .update({ sort_order: index })
            .eq("id", prompt.id)
        )
      );
    } catch (error) {
      console.error("Error updating prompt order:", error);
      toast({
        title: "Fehler",
        description: "Die Reihenfolge konnte nicht gespeichert werden.",
        variant: "destructive",
      });
      // Refetch to restore correct order
      fetchPromptData();
    }
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

  const handleEditPrompt = (prompt: PromptTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPrompt(prompt);
    setMenuOpen(false);
    setMenuView('main');
    setEditDialogOpen(true);
  };

  // Reset menu view when closing
  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) {
      setMenuView('main');
      setSelectedCategory(null);
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const validFiles: File[] = [];

    for (const file of Array.from(files)) {
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Ungültiges Format",
          description: `"${file.name}" wird nicht unterstützt. Erlaubt: PDF, JPEG, PNG, WebP.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: "Datei zu groß",
          description: `"${file.name}" überschreitet 20 MB.`,
          variant: "destructive",
        });
        continue;
      }
      validFiles.push(file);
    }

    if (attachedFiles.length + validFiles.length > 5) {
      toast({
        title: "Zu viele Dateien",
        description: "Maximal 5 Dateien gleichzeitig.",
        variant: "destructive",
      });
      return;
    }

    if (validFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...validFiles]);
    }
    setMenuOpen(false);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = () => {
    if ((!value.trim() && attachedFiles.length === 0) || isLoading || disabled) return;
    
    const defaultMsg = attachedFiles.length > 0
      ? `Analysiere ${attachedFiles.length === 1 ? `das Dokument "${attachedFiles[0].name}"` : `die ${attachedFiles.length} Dokumente`}`
      : "";
    const messageText = value.trim() || defaultMsg;

    if (attachedFiles.length > 0) {
      handleSendWithFiles(messageText);
      return;
    }
    
    if (activeFilters) {
      onSend(messageText, {
        filterCategories: activeFilters.categories,
        filterFeatures: activeFilters.features,
      });
      setActiveFilters(null);
    } else {
      onSend(messageText);
    }
    
    setValue("");
    setEnhancedPrompt(null);
  };

  const handleSendWithFiles = async (messageText: string) => {
    if (attachedFiles.length === 0) return;

    const timestamp = Date.now();
    const uploaded: Array<{ file: File; storagePath: string }> = [];

    try {
      for (const file of attachedFiles) {
        const storagePath = `analysis/${timestamp}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("building-documents")
          .upload(storagePath, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast({
            title: "Upload fehlgeschlagen",
            description: `${file.name}: ${uploadError.message}`,
            variant: "destructive",
          });
          return;
        }
        uploaded.push({ file, storagePath });
      }

      onSend(messageText, { attachedFiles: uploaded });
    } catch (error) {
      console.error("File upload error:", error);
      toast({
        title: "Fehler",
        description: "Dateien konnten nicht hochgeladen werden.",
        variant: "destructive",
      });
      return;
    }

    setValue("");
    setAttachedFiles([]);
    setEnhancedPrompt(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Prompt Enhancer handlers
  const handleEnhancePrompt = async () => {
    if (!value.trim() || isEnhancing) return;
    setIsEnhancing(true);
    setEnhancedPrompt({
      original: value,
      enhanced: '',
      categories: [],
      features: [],
      sourceHint: '',
      keywords: [],
    });

    try {
      const { data, error } = await supabase.functions.invoke('enhance-prompt', {
        body: { question: value }
      });

      if (error) throw error;

      setEnhancedPrompt({
        original: value,
        enhanced: data.enhanced_query || value,
        categories: data.categories || [],
        features: data.features || [],
        sourceHint: data.source_hint || '',
        keywords: data.keywords || [],
      });
    } catch (error) {
      console.error('Enhance prompt error:', error);
      toast({
        title: "Fehler",
        description: "Prompt konnte nicht optimiert werden.",
        variant: "destructive",
      });
      setEnhancedPrompt(null);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleAcceptEnhanced = (editedText: string) => {
    if (enhancedPrompt) {
      setValue(editedText);
      setActiveFilters({
        categories: enhancedPrompt.categories,
        features: enhancedPrompt.features,
      });
      setEnhancedPrompt(null);
    }
  };

  const handleCloseEnhanced = () => {
    setEnhancedPrompt(null);
  };

  const hasSpeechRecognition = typeof window !== 'undefined' && 
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <>
      <div className={cn("w-full max-w-3xl mx-auto", className)}>
        {/* Prompt Enhancer Suggestion */}
        {enhancedPrompt && (
          <PromptEnhancerSuggestion
            data={enhancedPrompt}
            isLoading={isEnhancing}
            onAccept={handleAcceptEnhanced}
            onRegenerate={handleEnhancePrompt}
            onClose={handleCloseEnhanced}
          />
        )}

        <div className="px-4">
          {/* Badges (positioned above the pill) */}
          {(webSearchEnabled || deepResearchEnabled || activeFilters || attachedFiles.length > 0) && (
            <div className="mb-2 ml-1 flex flex-wrap gap-2">
              {attachedFiles.map((file, index) => (
                <button
                  key={`${file.name}-${index}`}
                  onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs hover:bg-primary/20 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[200px]">{file.name}</span>
                  <X className="h-3 w-3 ml-0.5" />
                </button>
              ))}
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
              {activeFilters && activeFilters.categories.length > 0 && (
                <button
                  onClick={() => setActiveFilters(null)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs hover:bg-primary/20 transition-colors"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Filter aktiv</span>
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

                  {/* Document Analysis */}
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <FileSearch className="h-4 w-4" />
                    <span className="text-sm flex-1 text-left">Dokument analysieren</span>
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
              ) : menuView === 'prompts' ? (
                /* Categories Overview */
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
                                    className="flex items-center justify-between w-full px-3 py-2 text-sm text-left rounded-md hover:bg-muted transition-colors group"
                                  >
                                    <span className="truncate pr-2">{prompt.title}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <Pencil
                                        onClick={(e) => handleEditPrompt(prompt, e)}
                                        className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-foreground transition-all"
                                      />
                                      <Star
                                        onClick={(e) => toggleFavorite(prompt.id, e)}
                                        className="h-4 w-4 fill-yellow-400 text-yellow-400 cursor-pointer hover:scale-110 transition-transform"
                                      />
                                    </div>
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

                        {/* Categories as clickable items */}
                        {categories.map((category) => {
                          const categoryPrompts = getPromptsByCategory(category.id);
                          
                          return (
                            <button
                              key={category.id}
                              onClick={() => handleCategoryClick(category)}
                              className="flex items-center justify-between w-full px-3 py-2.5 text-sm text-left rounded-md hover:bg-muted transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {renderIcon(category.icon)}
                                <span>{category.name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span className="text-xs">{categoryPrompts.length}</span>
                                <ChevronRight className="h-4 w-4" />
                              </div>
                            </button>
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
              ) : (
                /* Category Detail View with Drag and Drop */
                <div className="p-2">
                  {/* Back Button */}
                  <button
                    onClick={() => {
                      setMenuView('prompts');
                      setSelectedCategory(null);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 mb-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>{selectedCategory?.name || 'Zurück'}</span>
                  </button>
                  
                  <Separator className="mb-2" />

                  <ScrollArea className="max-h-[350px]">
                    {selectedCategory && (
                      <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="prompts-list">
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                            >
                              <TooltipProvider delayDuration={300}>
                                {getPromptsByCategory(selectedCategory.id).map((prompt, index) => (
                                  <Draggable key={prompt.id} draggableId={prompt.id} index={index}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={cn(
                                          "flex items-center gap-1 rounded-md transition-colors",
                                          snapshot.isDragging && "bg-muted shadow-lg"
                                        )}
                                      >
                                        <div
                                          {...provided.dragHandleProps}
                                          className="p-2 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </div>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              onClick={() => handleSelectPrompt(prompt.content)}
                                              className="flex items-center justify-between flex-1 px-2 py-2 text-sm text-left rounded-md hover:bg-muted transition-colors group"
                                            >
                                              <span className="truncate pr-2">{prompt.title}</span>
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                <Pencil
                                                  onClick={(e) => handleEditPrompt(prompt, e)}
                                                  className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-foreground transition-all"
                                                />
                                                <Star
                                                  onClick={(e) => toggleFavorite(prompt.id, e)}
                                                  className={cn(
                                                    "h-4 w-4 cursor-pointer hover:scale-110 transition-transform",
                                                    favorites.has(prompt.id)
                                                      ? "fill-yellow-400 text-yellow-400"
                                                      : "text-muted-foreground/50 hover:text-yellow-400"
                                                  )}
                                                />
                                              </div>
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="right" className="max-w-sm p-3" sideOffset={8}>
                                            <p className="text-sm whitespace-pre-wrap">{prompt.content}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </TooltipProvider>

                              {getPromptsByCategory(selectedCategory.id).length === 0 && (
                                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                                  Keine Prompts in dieser Kategorie
                                </div>
                              )}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                    )}

                    {/* Add Prompt Button */}
                    <Separator className="my-2" />
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setMenuView('main');
                        setSelectedCategory(null);
                        setAddDialogOpen(true);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left rounded-md hover:bg-muted transition-colors text-primary"
                    >
                      <Plus className="h-4 w-4" />
                      Prompt hinzufügen
                    </button>
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
              "min-h-[40px] max-h-[80px]"
            )}
          />
          
          {/* Prompt Enhancer Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={handleEnhancePrompt}
                  disabled={!value.trim() || isLoading || disabled || isEnhancing}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 rounded-full flex-shrink-0",
                    isEnhancing && "text-primary bg-primary/10"
                  )}
                >
                  {isEnhancing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Prompt optimieren</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
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
      </div>

      <AddPromptDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        categories={categories}
        onSuccess={fetchPromptData}
      />

      <EditPromptDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        prompt={editingPrompt}
        categories={categories}
        onSuccess={fetchPromptData}
      />

      {/* Hidden file input for document analysis */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />
    </>
  );
}
