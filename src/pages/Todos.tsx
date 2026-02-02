import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Download, ChevronDown, ChevronUp } from "lucide-react";
import { useTodos, Todo, TodoFilters as TodoFiltersType, isOverdue } from "@/hooks/useTodos";
import { TodoFilters } from "@/components/todos/TodoFilters";
import { TodoCard } from "@/components/todos/TodoCard";
import { TodoDialog } from "@/components/todos/TodoDialog";
import { TodoExportDialog } from "@/components/todos/TodoExportDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";

const defaultFilters: TodoFiltersType = {
  search: '',
  assignedTo: 'all',
  category: 'all',
  priority: 'all',
  status: 'all',
  dueDateFrom: '',
  dueDateTo: '',
  sortBy: 'due_date',
  sortOrder: 'asc',
};

export function Todos() {
  const [filters, setFilters] = useState<TodoFiltersType>(defaultFilters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: todos = [], isLoading } = useTodos(filters);

  // Group todos by status
  const groupedTodos = useMemo(() => {
    const open: Todo[] = [];
    const inProgress: Todo[] = [];
    const done: Todo[] = [];

    todos.forEach((todo) => {
      if (todo.status === 'done') {
        done.push(todo);
      } else if (todo.status === 'in_progress') {
        inProgress.push(todo);
      } else {
        open.push(todo);
      }
    });

    // Sort by priority within each group (urgent first)
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sortByPriority = (a: Todo, b: Todo) => {
      // Overdue first
      const aOverdue = isOverdue(a);
      const bOverdue = isOverdue(b);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      
      // Then by priority
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    };

    return {
      open: open.sort(sortByPriority),
      inProgress: inProgress.sort(sortByPriority),
      done: done,
    };
  }, [todos]);

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingTodo(null);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingTodo(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Aufgaben</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie alle Aufgaben und To-Dos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Exportieren
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Neue Aufgabe
          </Button>
        </div>
      </div>

      {/* Filters */}
      <TodoFilters filters={filters} onFiltersChange={setFilters} />

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {/* Todo lists */}
      {!isLoading && (
        <div className="space-y-6">
          {/* Open tasks */}
          {groupedTodos.open.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Offen ({groupedTodos.open.length})
              </h2>
              <div className="space-y-3">
                {groupedTodos.open.map((todo) => (
                  <TodoCard key={todo.id} todo={todo} onEdit={handleEdit} />
                ))}
              </div>
            </div>
          )}

          {/* In progress tasks */}
          {groupedTodos.inProgress.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                In Bearbeitung ({groupedTodos.inProgress.length})
              </h2>
              <div className="space-y-3">
                {groupedTodos.inProgress.map((todo) => (
                  <TodoCard key={todo.id} todo={todo} onEdit={handleEdit} />
                ))}
              </div>
            </div>
          )}

          {/* Completed tasks (collapsible) */}
          {groupedTodos.done.length > 0 && (
            <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between py-6">
                  <span className="flex items-center gap-2 text-lg font-semibold">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Erledigt ({groupedTodos.done.length})
                  </span>
                  {showCompleted ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                {groupedTodos.done.map((todo) => (
                  <TodoCard key={todo.id} todo={todo} onEdit={handleEdit} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Empty state */}
          {todos.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                Keine Aufgaben gefunden
              </p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Erste Aufgabe erstellen
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <TodoDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        todo={editingTodo}
        mode={editingTodo ? 'edit' : 'create'}
      />

      <TodoExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        filters={filters}
        todos={todos}
      />
    </div>
  );
}
