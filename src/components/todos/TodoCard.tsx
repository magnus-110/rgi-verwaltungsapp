import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Calendar, User, Building2, RefreshCw, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Todo, isOverdue, priorityLabels, statusLabels, useUpdateTodo, useDeleteTodo, useSubtasks } from "@/hooks/useTodos";
import { TodoSubtasks } from "./TodoSubtasks";
import { TodoComments } from "./TodoComments";
import { TodoAttachments } from "./TodoAttachments";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface TodoCardProps {
  todo: Todo;
  onEdit: (todo: Todo) => void;
}

export function TodoCard({ todo, onEdit }: TodoCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const { data: subtasks = [] } = useSubtasks(todo.id);
  
  const overdue = isOverdue(todo);
  const completedSubtasks = subtasks.filter(s => s.is_completed).length;
  const totalSubtasks = subtasks.length;

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    urgent: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  const statusColors: Record<string, string> = {
    open: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };

  const handleStatusChange = (status: string) => {
    updateTodo.mutate({ id: todo.id, status: status as Todo['status'] });
  };

  const handleDelete = () => {
    deleteTodo.mutate(todo.id);
  };

  const assignedName = todo.assigned_user 
    ? `${todo.assigned_user.first_name || ''} ${todo.assigned_user.last_name || ''}`.trim() 
    : null;

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      overdue && todo.status !== 'done' && "border-destructive/50 bg-destructive/5",
      todo.status === 'done' && "opacity-75"
    )}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer">
            <div className="flex items-start gap-3">
              {/* Task number */}
              <div className="text-sm font-mono text-muted-foreground min-w-[50px]">
                #{todo.task_number}
              </div>

              {/* Priority badge */}
              <Badge className={cn("shrink-0", priorityColors[todo.priority])}>
                {priorityLabels[todo.priority]}
              </Badge>

              {/* Title and info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{todo.title}</h3>
                
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {assignedName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {assignedName}
                    </span>
                  )}
                  {!assignedName && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <User className="h-3 w-3" />
                      Nicht zugewiesen
                    </span>
                  )}
                  
                  {todo.building && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {todo.building.name}
                    </span>
                  )}
                  
                  {totalSubtasks > 0 && (
                    <span>Checkliste: {completedSubtasks}/{totalSubtasks}</span>
                  )}
                  
                  {todo.is_recurring && (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      Wiederkehrend
                    </span>
                  )}
                </div>
              </div>

              {/* Due date */}
              <div className="flex items-center gap-2 shrink-0">
                {todo.due_date && (
                  <div className={cn(
                    "flex items-center gap-1 text-sm",
                    overdue && todo.status !== 'done' && "text-destructive font-medium"
                  )}>
                    <Calendar className="h-4 w-4" />
                    {format(new Date(todo.due_date), "dd.MM.yyyy", { locale: de })}
                  </div>
                )}
                
                {overdue && todo.status !== 'done' && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Überfällig
                  </Badge>
                )}

                {/* Expand/collapse icon */}
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t mt-2">
            {/* Description */}
            {todo.description && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Beschreibung</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {todo.description}
                </p>
              </div>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Kategorie:</span>
                {todo.category ? (
                  <div className="flex items-center gap-1 mt-1">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: todo.category.color }}
                    />
                    {todo.category.name}
                  </div>
                ) : (
                  <span className="text-muted-foreground"> -</span>
                )}
              </div>
              
              <div>
                <span className="text-muted-foreground">Erstellt:</span>
                <div className="mt-1">
                  {format(new Date(todo.created_at), "dd.MM.yyyy", { locale: de })}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground">Verantwortlich:</span>
                <div className="mt-1">
                  {assignedName || 'Nicht zugewiesen'}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground">Fällig:</span>
                <div className={cn("mt-1", overdue && todo.status !== 'done' && "text-destructive font-medium")}>
                  {todo.due_date 
                    ? format(new Date(todo.due_date), "dd.MM.yyyy", { locale: de })
                    : '-'
                  }
                </div>
              </div>
            </div>

            {/* Subtasks */}
            <TodoSubtasks todoId={todo.id} />

            {/* Attachments */}
            <TodoAttachments todo={todo} />

            {/* Comments */}
            <TodoComments todoId={todo.id} />

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Select value={todo.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    <Badge className={statusColors.open}>{statusLabels.open}</Badge>
                  </SelectItem>
                  <SelectItem value="in_progress">
                    <Badge className={statusColors.in_progress}>{statusLabels.in_progress}</Badge>
                  </SelectItem>
                  <SelectItem value="done">
                    <Badge className={statusColors.done}>{statusLabels.done}</Badge>
                  </SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(todo)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Bearbeiten
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Löschen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Aufgabe löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Diese Aktion kann nicht rückgängig gemacht werden. Die Aufgabe und alle zugehörigen Kommentare und Unteraufgaben werden gelöscht.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
