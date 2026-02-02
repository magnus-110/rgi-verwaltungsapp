import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Todo, CreateTodoInput, useCreateTodo, useUpdateTodo, useCategories, useAssignableUsers } from "@/hooks/useTodos";
import { CategoryDialog } from "./CategoryDialog";
import { RecurrenceSettings } from "./RecurrenceSettings";
import { InlineSubtasksCreator } from "./TodoSubtasks";
import { InlineAttachmentCreator } from "./TodoAttachments";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TodoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo?: Todo | null;
  mode: 'create' | 'edit';
}

export function TodoDialog({ open, onOpenChange, todo, mode }: TodoDialogProps) {
  const { user } = useAuth();
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
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
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

  // Reset form when dialog opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && todo) {
        setTitle(todo.title);
        setDescription(todo.description || '');
        setCategoryId(todo.category_id);
        setAssignedTo(todo.assigned_to);
        setDueDate(todo.due_date);
        setPriority(todo.priority);
        setBuildingId(todo.building_id);
        setIsRecurring(todo.is_recurring);
        setRecurrencePattern(todo.recurrence_pattern || 'weekly');
        setRecurrenceInterval(todo.recurrence_interval || 1);
        setRecurrenceEndDate(todo.recurrence_end_date);
        setSubtasks([]);
        setFiles([]);
      } else {
        // Reset for create mode
        setTitle("");
        setDescription("");
        setCategoryId(null);
        setAssignedTo(null);
        setDueDate(null);
        setPriority('medium');
        setBuildingId(null);
        setIsRecurring(false);
        setRecurrencePattern('weekly');
        setRecurrenceInterval(1);
        setRecurrenceEndDate(null);
        setSubtasks([]);
        setFiles([]);
      }
    }
  }, [open, mode, todo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setUploading(true);

    try {
      // Handle file uploads for new todo
      let attachments: any[] = [];
      if (files.length > 0 && mode === 'create') {
        // We'll upload files after todo is created
        // For now, just prepare the metadata
      }

      if (mode === 'create') {
        const input: CreateTodoInput = {
          title: title.trim(),
          description: description.trim() || undefined,
          category_id: categoryId || undefined,
          assigned_to: assignedTo || undefined,
          due_date: dueDate || undefined,
          priority,
          building_id: buildingId || undefined,
          is_recurring: isRecurring,
          recurrence_pattern: isRecurring ? recurrencePattern : undefined,
          recurrence_interval: isRecurring ? recurrenceInterval : undefined,
          recurrence_end_date: isRecurring ? recurrenceEndDate || undefined : undefined,
          subtasks: subtasks.length > 0 ? subtasks : undefined,
        };

        createTodo.mutate(input, {
          onSuccess: async (newTodo) => {
            // Upload files after todo is created
            if (files.length > 0 && newTodo) {
              const uploadedAttachments = [];
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
            }
            onOpenChange(false);
          },
        });
      } else if (mode === 'edit' && todo) {
        updateTodo.mutate({
          id: todo.id,
          title: title.trim(),
          description: description.trim() || null,
          category_id: categoryId,
          assigned_to: assignedTo,
          due_date: dueDate,
          priority,
          building_id: buildingId,
          is_recurring: isRecurring,
          recurrence_pattern: isRecurring ? recurrencePattern : null,
          recurrence_interval: isRecurring ? recurrenceInterval : null,
          recurrence_end_date: isRecurring ? recurrenceEndDate : null,
        }, {
          onSuccess: () => onOpenChange(false),
        });
      }
    } finally {
      setUploading(false);
    }
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

              {/* Assigned to */}
              <div className="space-y-2">
                <Label>Verantwortlich</Label>
                <Select 
                  value={assignedTo || 'none'} 
                  onValueChange={(v) => setAssignedTo(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional - Nicht zugewiesen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nicht zugewiesen</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.first_name} {u.last_name} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              {/* Building */}
              <div className="space-y-2">
                <Label>Gebäude</Label>
                <Select 
                  value={buildingId || 'none'} 
                  onValueChange={(v) => setBuildingId(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Gebäude</SelectItem>
                    {buildings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
