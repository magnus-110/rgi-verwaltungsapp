import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useSubtasks, useCreateSubtask, useToggleSubtask, useDeleteSubtask, TodoSubtask } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

interface TodoSubtasksProps {
  todoId: string;
  readOnly?: boolean;
}

export function TodoSubtasks({ todoId, readOnly = false }: TodoSubtasksProps) {
  const { data: subtasks = [], isLoading } = useSubtasks(todoId);
  const createSubtask = useCreateSubtask();
  const toggleSubtask = useToggleSubtask();
  const deleteSubtask = useDeleteSubtask();
  const [newSubtask, setNewSubtask] = useState("");

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
      <div className="space-y-2">
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
            <span className={cn(
              "flex-1 text-sm",
              subtask.is_completed && "line-through text-muted-foreground"
            )}>
              {subtask.title}
            </span>
            {subtask.completed_user && subtask.is_completed && (
              <span className="text-xs text-muted-foreground">
                ({subtask.completed_user.first_name})
              </span>
            )}
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(subtask.id)}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
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

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Checkliste (optional)</label>
      
      {subtasks.length > 0 && (
        <div className="space-y-1">
          {subtasks.map((item, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
              <span className="text-sm flex-1">{item}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => removeItem(index)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
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
