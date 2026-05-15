import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Todo, CreateTodoInput, useCreateTodo, useUpdateTodo, useCategories, useAssignableUsers } from "@/hooks/useTodos";
import { useAuth } from "@/hooks/useAuth";
import { CategoryDialog } from "./CategoryDialog";
import { RecurrenceSettings } from "./RecurrenceSettings";
import { InlineSubtasksCreator } from "./TodoSubtasks";
import { InlineAttachmentCreator } from "./TodoAttachments";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

const STORAGE_KEY = 'todo_dialog_draft';

interface TodoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo?: Todo | null;
  mode: 'create' | 'edit';
}

interface DraftData {
  title: string;
  description: string;
  categoryId: string | null;
  assignees: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string | null;
  buildingIds: string[];
  isRecurring: boolean;
  recurrencePattern: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceInterval: number;
  recurrenceEndDate: string | null;
  subtasks: string[];
}

export function TodoDialog({ open, onOpenChange, todo, mode }: TodoDialogProps) {
  const { user, profile } = useAuth();
  const { data: categories = [] } = useCategories();
  const { data: users = [] } = useAssignableUsers();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [buildingIds, setBuildingIds] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  // Fetch buildings
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase
      .from('buildings')
      .select('id, name')
      .order('name')
      .then(({ data }) => setBuildings(data || []));
  }, []);

  // Load draft from localStorage for create mode
  useEffect(() => {
    if (open && mode === 'create') {
      const savedDraft = localStorage.getItem(STORAGE_KEY);
      if (savedDraft) {
        try {
          const draft: DraftData = JSON.parse(savedDraft);
          setTitle(draft.title || '');
          setDescription(draft.description || '');
          setCategoryId(draft.categoryId);
          setAssignees(draft.assignees || []);
          setPriority(draft.priority || 'medium');
          setDueDate(draft.dueDate);
          setBuildingIds(draft.buildingIds || []);
          setIsRecurring(draft.isRecurring || false);
          setRecurrencePattern(draft.recurrencePattern || 'weekly');
          setRecurrenceInterval(draft.recurrenceInterval || 1);
          setRecurrenceEndDate(draft.recurrenceEndDate);
          setSubtasks(draft.subtasks || []);
        } catch (e) {
          // Invalid draft, ignore
        }
      }
    }
  }, [open, mode]);

  // Save draft to localStorage (debounced)
  const saveDraft = useCallback(() => {
    if (mode === 'create') {
      const draft: DraftData = {
        title,
        description,
        categoryId,
        assignees,
        priority,
        dueDate,
        buildingIds,
        isRecurring,
        recurrencePattern,
        recurrenceInterval,
        recurrenceEndDate,
        subtasks,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }
  }, [mode, title, description, categoryId, assignees, priority, dueDate, buildingIds, isRecurring, recurrencePattern, recurrenceInterval, recurrenceEndDate, subtasks]);

  useEffect(() => {
    if (mode === 'create' && open) {
      const timeout = setTimeout(saveDraft, 500);
      return () => clearTimeout(timeout);
    }
  }, [saveDraft, mode, open]);

  // Reset form when dialog opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && todo) {
        setTitle(todo.title);
        setDescription(todo.description || '');
        setCategoryId(todo.category_id);
        if (todo.assignees && todo.assignees.length > 0) {
          setAssignees(todo.assignees.map(a => a.user?.user_id).filter(Boolean) as string[]);
        } else if (todo.assigned_to) {
          setAssignees([todo.assigned_to]);
        } else {
          setAssignees([]);
        }
        setDueDate(todo.due_date);
        setPriority(todo.priority);
        if (todo.buildings && todo.buildings.length > 0) {
          setBuildingIds(todo.buildings.map(b => b.building?.id).filter(Boolean) as string[]);
        } else if (todo.building_id) {
          setBuildingIds([todo.building_id]);
        } else {
          setBuildingIds([]);
        }
        setIsRecurring(todo.is_recurring);
        setIsInternal((todo as any).is_internal || false);
        setRecurrencePattern(todo.recurrence_pattern || 'weekly');
        setRecurrenceInterval(todo.recurrence_interval || 1);
        setRecurrenceEndDate(todo.recurrence_end_date);
        setSubtasks([]);
        setFiles([]);
      } else if (mode === 'create') {
        // Don't reset if we're loading from draft
        // The useEffect above will handle loading the draft
      }
    }
  }, [open, mode, todo]);

  const clearForm = () => {
    setTitle("");
    setDescription("");
    setCategoryId(null);
    setAssignees([]);
    setDueDate(null);
    setPriority('medium');
    setBuildingIds([]);
    setIsRecurring(false);
    setIsInternal(false);
    setRecurrencePattern('weekly');
    setRecurrenceInterval(1);
    setRecurrenceEndDate(null);
    setSubtasks([]);
    setFiles([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || isPending) return;

    try {
      if (mode === 'create') {
        const input: CreateTodoInput = {
          title: title.trim(),
          description: description.trim() || undefined,
          category_id: categoryId || undefined,
          assigned_to: assignees.length === 1 ? assignees[0] : undefined,
          assignees: assignees.length > 0 ? assignees : undefined,
          due_date: dueDate || undefined,
          priority,
          building_id: buildingIds.length === 1 ? buildingIds[0] : undefined,
          building_ids: buildingIds.length > 0 ? buildingIds : undefined,
          is_recurring: isRecurring,
          is_internal: isInternal,
          recurrence_pattern: isRecurring ? recurrencePattern : undefined,
          recurrence_interval: isRecurring ? recurrenceInterval : undefined,
          recurrence_end_date: isRecurring ? recurrenceEndDate || undefined : undefined,
          subtasks: subtasks.length > 0 ? subtasks : undefined,
        };

        const newTodo = await createTodo.mutateAsync(input);

        // Upload files after todo is created
        if (files.length > 0 && newTodo) {
          setUploading(true);
          try {
            const uploadedAttachments: any[] = [];
            for (const file of files) {
              const fileExt = file.name.split('.').pop();
              const fileName = `${newTodo.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
              const { error } = await supabase.storage
                .from('todo-attachments')
                .upload(fileName, file);
              if (!error) {
                uploadedAttachments.push({
                  name: file.name,
                  path: fileName,
                  size: file.size,
                  type: file.type,
                });
              }
            }
            if (uploadedAttachments.length > 0) {
              await supabase
                .from('todos')
                .update({ attachments: uploadedAttachments })
                .eq('id', newTodo.id);
            }
          } finally {
            setUploading(false);
          }
        }
        clearForm();
        onOpenChange(false);
      } else if (mode === 'edit' && todo) {
        const updatePayload: any = {
          id: todo.id,
          title: title.trim(),
          description: description.trim() || null,
          category_id: categoryId,
          assigned_to: assignees.length === 1 ? assignees[0] : null,
          due_date: dueDate,
          priority,
          building_id: buildingIds.length === 1 ? buildingIds[0] : null,
          is_recurring: isRecurring,
          is_internal: isInternal,
          recurrence_pattern: isRecurring ? recurrencePattern : null,
          recurrence_interval: isRecurring ? recurrenceInterval : null,
          recurrence_end_date: isRecurring ? recurrenceEndDate : null,
        };
        updatePayload.assignees = assignees;
        updatePayload.building_ids = buildingIds;

        await updateTodo.mutateAsync(updatePayload);
        onOpenChange(false);
      }
    } catch (err) {
      console.error('TodoDialog submit failed:', err);
      setUploading(false);
    }
  };

  const toggleAssignee = (userId: string) => {
    setAssignees(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleBuilding = (buildingId: string) => {
    setBuildingIds(prev => 
      prev.includes(buildingId) 
        ? prev.filter(id => id !== buildingId)
        : [...prev, buildingId]
    );
  };

  const isPending = createTodo.isPending || updateTodo.isPending || uploading;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Neue Aufgabe erstellen' : 'Aufgabe bearbeiten'}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-150px)]">
            <form onSubmit={handleSubmit} className="space-y-4 pr-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Aufgabentitel eingeben..."
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detaillierte Beschreibung..."
                  rows={3}
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label>Kategorie</Label>
                <div className="flex gap-2">
                  <Select 
                    value={categoryId || 'none'} 
                    onValueChange={(v) => setCategoryId(v === 'none' ? null : v)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine Kategorie</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCategoryDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Assignees - Multi-select */}
              <div className="space-y-2">
                <Label>Verantwortliche</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      {assignees.length > 0 
                        ? `${assignees.length} Person${assignees.length > 1 ? 'en' : ''} ausgewählt`
                        : 'Optional - Nicht zugewiesen'
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-2" align="start">
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {users.map((u) => (
                        <div 
                          key={u.user_id} 
                          className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                          onClick={() => toggleAssignee(u.user_id)}
                        >
                          <Checkbox checked={assignees.includes(u.user_id)} />
                          <span className="text-sm">{u.first_name} {u.last_name}</span>
                          <span className="text-xs text-muted-foreground">({u.role})</span>
                        </div>
                      ))}
                    </div>
                    {assignees.length > 0 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="w-full mt-2"
                        onClick={() => setAssignees([])}
                      >
                        Auswahl aufheben
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priorität</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Niedrig</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="high">Hoch</SelectItem>
                    <SelectItem value="urgent">Dringend</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Due date */}
              <div className="space-y-2">
                <Label>Fälligkeitsdatum</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(new Date(dueDate), "dd.MM.yyyy", { locale: de }) : "Optional"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dueDate ? new Date(dueDate) : undefined}
                      onSelect={(date) => setDueDate(date ? format(date, 'yyyy-MM-dd') : null)}
                      initialFocus
                      locale={de}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Buildings - Multi-select */}
              <div className="space-y-2">
                <Label>Gebäude</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      {buildingIds.length > 0 
                        ? `${buildingIds.length} Gebäude ausgewählt`
                        : 'Optional...'
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-2" align="start">
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {buildings.map((b) => (
                        <div 
                          key={b.id} 
                          className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                          onClick={() => toggleBuilding(b.id)}
                        >
                          <Checkbox checked={buildingIds.includes(b.id)} />
                          <span className="text-sm">{b.name}</span>
                        </div>
                      ))}
                    </div>
                    {buildingIds.length > 0 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="w-full mt-2"
                        onClick={() => setBuildingIds([])}
                      >
                        Auswahl aufheben
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Internal flag - only for admins */}
              {profile?.role === 'admin' && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <Checkbox
                    id="is_internal"
                    checked={isInternal}
                    onCheckedChange={(checked) => setIsInternal(checked === true)}
                  />
                  <div>
                    <Label htmlFor="is_internal" className="cursor-pointer font-medium text-sm">
                      Interne Aufgabe
                    </Label>
                    <p className="text-xs text-muted-foreground">Nur für Admins sichtbar, nicht für Mitarbeiter</p>
                  </div>
                </div>
              )}

              {/* Recurrence settings (discreet) */}
              <RecurrenceSettings
                isRecurring={isRecurring}
                pattern={recurrencePattern}
                interval={recurrenceInterval}
                endDate={recurrenceEndDate}
                onIsRecurringChange={setIsRecurring}
                onPatternChange={setRecurrencePattern}
                onIntervalChange={setRecurrenceInterval}
                onEndDateChange={setRecurrenceEndDate}
              />

              {/* Subtasks (only for create mode) */}
              {mode === 'create' && (
                <InlineSubtasksCreator subtasks={subtasks} onChange={setSubtasks} />
              )}

              {/* Attachments (only for create mode) */}
              {mode === 'create' && (
                <InlineAttachmentCreator files={files} onChange={setFiles} />
              )}
            </form>
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={!title.trim() || isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'create' ? 'Erstellen' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoryDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} />
    </>
  );
}
