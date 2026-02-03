import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useSubtasks, useCreateSubtask, useToggleSubtask, useDeleteSubtask, useUpdateSubtask, TodoSubtask } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface TodoSubtasksProps {
  todoId: string;
  readOnly?: boolean;
}

export function TodoSubtasks({ todoId, readOnly = false }: TodoSubtasksProps) {
  const { data: subtasks = [], isLoading } = useSubtasks(todoId);
  const createSubtask = useCreateSubtask();
  const toggleSubtask = useToggleSubtask();
  const deleteSubtask = useDeleteSubtask();
  const updateSubtask = useUpdateSubtask();
  const [newSubtask, setNewSubtask] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const completedCount = subtasks.filter(s => s.is_completed).length;
  const totalCount = subtasks.length;

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    createSubtask.mutate({ todoId, title: newSubtask.trim() });
    setNewSubtask("");
  };

  const handleToggle = (subtask: TodoSubtask) => {
    toggleSubtask.mutate({
      id: subtask.id,
      todoId,
      isCompleted: !subtask.is_completed,
    });
  };

  const handleDelete = (subtaskId: string) => {
    deleteSubtask.mutate({ id: subtaskId, todoId });
  };

  const handleStartEdit = (subtask: TodoSubtask) => {
    if (readOnly) return;
    setEditingId(subtask.id);
    setEditText(subtask.title);
  };

  const handleSaveEdit = (subtaskId: string) => {
    if (editText.trim() && editText.trim() !== subtasks.find(s => s.id === subtaskId)?.title) {
      updateSubtask.mutate({ id: subtaskId, todoId, title: editText.trim() });
    }
    setEditingId(null);
    setEditText("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          Checkliste {totalCount > 0 && <span className="text-muted-foreground">({completedCount}/{totalCount})</span>}
        </h4>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      {/* Subtasks list */}
      <div className="space-y-1">
        {subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className={cn(
              "flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group",
              subtask.is_completed && "opacity-60"
            )}
          >
            <Checkbox
              checked={subtask.is_completed}
              onCheckedChange={() => handleToggle(subtask)}
              disabled={readOnly}
            />
            
            {/* Inline editable text */}
            {editingId === subtask.id ? (
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => handleSaveEdit(subtask.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveEdit(subtask.id);
                  }
                  if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                autoFocus
                className="flex-1 text-sm h-7 py-0"
              />
            ) : (
              <span 
                className={cn(
                  "flex-1 text-sm cursor-text hover:bg-muted/50 rounded px-1 py-0.5",
                  subtask.is_completed && "line-through text-muted-foreground",
                  !readOnly && "hover:ring-1 hover:ring-border"
                )}
                onClick={() => handleStartEdit(subtask)}
              >
                {subtask.title}
              </span>
            )}
            
            {subtask.completed_user && subtask.is_completed && (
              <span className="text-xs text-muted-foreground">
                ({subtask.completed_user.first_name})
              </span>
            )}
            
            {!readOnly && editingId !== subtask.id && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Punkt löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dieser Checklistenpunkt wird unwiderruflich gelöscht.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => handleDelete(subtask.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ))}
      </div>

      {/* Add new subtask */}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            placeholder="Neuen Punkt hinzufügen..."
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
            className="text-sm"
          />
          <Button 
            size="sm" 
            onClick={handleAddSubtask}
            disabled={!newSubtask.trim() || createSubtask.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Inline subtask creator for the todo dialog
interface InlineSubtasksCreatorProps {
  subtasks: string[];
  onChange: (subtasks: string[]) => void;
}

export function InlineSubtasksCreator({ subtasks, onChange }: InlineSubtasksCreatorProps) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    if (!newItem.trim()) return;
    onChange([...subtasks, newItem.trim()]);
    setNewItem("");
  };

  const removeItem = (index: number) => {
    onChange(subtasks.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, value: string) => {
    const updated = [...subtasks];
    updated[index] = value;
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Checkliste (optional)</label>
      
      {subtasks.length > 0 && (
        <div className="space-y-1">
          {subtasks.map((item, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md group">
              <Input
                value={item}
                onChange={(e) => updateItem(index, e.target.value)}
                className="text-sm flex-1 h-7 py-0"
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Punkt entfernen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dieser Punkt wird aus der Checkliste entfernt.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => removeItem(index)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Entfernen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Punkt hinzufügen..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
