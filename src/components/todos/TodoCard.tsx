import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Calendar, User, Building2, RefreshCw, Pencil, Trash2, AlertTriangle, CalendarPlus } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Todo, isOverdue, priorityLabels, statusLabels, useUpdateTodo, useDeleteTodo, useSubtasks } from "@/hooks/useTodos";
import { TodoSubtasks } from "./TodoSubtasks";
import { TodoComments } from "./TodoComments";
import { TodoAttachments } from "./TodoAttachments";
import { AddToCalendarDialog } from "./AddToCalendarDialog";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface TodoCardProps {
  todo: Todo;
  onEdit: (todo: Todo) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function TodoCard({ todo, onEdit, isExpanded, onToggle }: TodoCardProps) {
  // Fallback to internal state if no controlled props provided
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isExpanded !== undefined ? isExpanded : internalOpen;
  const handleToggle = onToggle || (() => setInternalOpen(!internalOpen));
   const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const { data: subtasks = [] } = useSubtasks(todo.id);
  
  const overdue = isOverdue(todo);
  const completedSubtasks = subtasks.filter(s => s.is_completed).length;
  const totalSubtasks = subtasks.length;

  // Priority colors: Low = Green, Medium = Orange, High = Red, Urgent = Dark Red
  const priorityColors: Record<string, string> = {
    low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    urgent: 'bg-red-200 text-red-950 dark:bg-red-950 dark:text-red-100',
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

  // Get assigned names - support both legacy and multi-assign
  const getAssignedNames = () => {
    if (todo.assignees && todo.assignees.length > 0) {
      return todo.assignees.map(a => 
        `${a.user?.first_name || ''} ${a.user?.last_name || ''}`.trim()
      ).filter(Boolean).join(', ');
    }
    if (todo.assigned_user) {
      return `${todo.assigned_user.first_name || ''} ${todo.assigned_user.last_name || ''}`.trim();
    }
    return null;
  };

  // Get building names - support both legacy and multi-assign
  const getBuildingNames = () => {
    if (todo.buildings && todo.buildings.length > 0) {
      return todo.buildings.map(b => b.building?.name).filter(Boolean).join(', ');
    }
    if (todo.building) {
      return todo.building.name;
    }
    return null;
  };

  const assignedNames = getAssignedNames();
  const buildingNames = getBuildingNames();

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      overdue && todo.status !== 'done' && "border-destructive/50 bg-destructive/5",
      todo.status === 'done' && "opacity-75"
    )}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-3 sm:p-4 cursor-pointer">
            {/* Mobile-optimized layout */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
              {/* First row: Number + Priority + Date (mobile) */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">
                  #{todo.task_number}
                </span>
                <Badge className={cn("text-xs px-1.5 py-0", priorityColors[todo.priority])}>
                  {priorityLabels[todo.priority]}
                </Badge>
                {todo.due_date && (
                  <span className={cn(
                    "text-xs flex items-center gap-1",
                    overdue && todo.status !== 'done' ? "text-destructive font-medium" : "text-muted-foreground"
                  )}>
                    <Calendar className="h-3 w-3" />
                    {format(new Date(todo.due_date), "dd.MM.", { locale: de })}
                  </span>
                )}
                {overdue && todo.status !== 'done' && (
                  <Badge variant="destructive" className="text-xs px-1 py-0">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    Überfällig
                  </Badge>
                )}
              </div>

              {/* Title */}
              <h3 className="font-medium text-sm sm:text-base line-clamp-2 sm:flex-1">
                {todo.title}
              </h3>

              {/* Chevron (desktop) */}
              <div className="hidden sm:block shrink-0">
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Metadata row - compact on mobile */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              {assignedNames && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {assignedNames}
                </span>
              )}
              {!assignedNames && (
                <span className="flex items-center gap-1 text-amber-600">
                  <User className="h-3 w-3" />
                  Nicht zugewiesen
                </span>
              )}
              
              {buildingNames && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {buildingNames}
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
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-3 sm:px-4 space-y-4 border-t mt-2">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-sm">
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
                  {assignedNames || 'Nicht zugewiesen'}
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
              <Select value={todo.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
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
                 <Button 
                   variant="outline" 
                   size="sm" 
                   className="flex-1 sm:flex-none"
                   onClick={() => setCalendarDialogOpen(true)}
                 >
                   <CalendarPlus className="h-4 w-4 mr-1" />
                   <span className="hidden sm:inline">Kalender</span>
                 </Button>
                <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => onEdit(todo)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Bearbeiten
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1 sm:flex-none text-destructive hover:text-destructive">
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
       
       <AddToCalendarDialog 
         todo={todo} 
         open={calendarDialogOpen} 
         onOpenChange={setCalendarDialogOpen} 
       />
    </Card>
  );
}
