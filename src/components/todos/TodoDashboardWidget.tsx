import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckSquare, ArrowRight, AlertTriangle, Clock, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTodos, isOverdue, TodoFilters } from "@/hooks/useTodos";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Default filters for widget - show all open/in_progress tasks
const widgetFilters: TodoFilters = {
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

// Priority colors: Low = Green, Medium = Orange, High = Red, Urgent = Dark Red
const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: 'Niedrig', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  medium: { label: 'Mittel', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  high: { label: 'Hoch', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  urgent: { label: 'Dringend', className: 'bg-red-200 text-red-950 dark:bg-red-950 dark:text-red-100' },
};

export function TodoDashboardWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: allTodos = [], isLoading } = useTodos(widgetFilters);

  // Filter for active todos (not done)
  const activeTodos = allTodos.filter(t => t.status !== 'done');
  
  // Sort by priority and due date
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortedTodos = [...activeTodos].sort((a, b) => {
    const aOverdue = isOverdue(a);
    const bOverdue = isOverdue(b);
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Take top 5 tasks
  const displayTodos = sortedTodos.slice(0, 5);

  // Count stats
  const openCount = activeTodos.filter(t => t.status === 'open').length;
  const inProgressCount = activeTodos.filter(t => t.status === 'in_progress').length;
  const overdueCount = activeTodos.filter(t => isOverdue(t)).length;
  const unassignedCount = activeTodos.filter(t => !t.assigned_to).length;

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const today = new Date();
    const days = differenceInDays(date, today);
    
    if (days < 0) return { text: 'überfällig', isOverdue: true };
    if (days === 0) return { text: 'heute', isOverdue: false };
    if (days === 1) return { text: 'morgen', isOverdue: false };
    if (days <= 7) return { text: `in ${days} Tagen`, isOverdue: false };
    return { text: format(date, "dd.MM.yyyy", { locale: de }), isOverdue: false };
  };

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Aufgaben
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Laden...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full hover:shadow-elegant transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <CheckSquare className="h-5 w-5" />
          Aufgaben
          {overdueCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {overdueCount} überfällig
            </Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/todos')} className="gap-1">
          Alle anzeigen
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeTodos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Keine offenen Aufgaben
          </p>
        ) : (
          <>
            {/* Task list */}
            <div className="space-y-2">
              {displayTodos.map(todo => {
                const dueInfo = formatDueDate(todo.due_date);
                const overdue = isOverdue(todo);
                const config = priorityConfig[todo.priority];
                
                return (
                  <div 
                    key={todo.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors",
                      overdue && "border-l-4 border-destructive bg-destructive/5"
                    )}
                    onClick={() => navigate('/todos')}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        #{todo.task_number}
                      </span>
                      <Badge className={cn("shrink-0 text-xs", config.className)}>
                        {config.label}
                      </Badge>
                      <span className="text-sm font-medium truncate">{todo.title}</span>
                    </div>
                    {dueInfo && (
                      <div className={cn(
                        "flex items-center gap-1 text-xs shrink-0 ml-2",
                        dueInfo.isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                      )}>
                        <Calendar className="h-3 w-3" />
                        {dueInfo.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Show more indicator */}
            {sortedTodos.length > 5 && (
              <p className="text-sm text-muted-foreground text-center">
                + {sortedTodos.length - 5} weitere Aufgaben
              </p>
            )}
          </>
        )}

        {/* Stats footer */}
        <div className="pt-3 border-t flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {openCount} offen
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            {inProgressCount} in Bearbeitung
          </span>
          {unassignedCount > 0 && (
            <span className="text-muted-foreground">
              ({unassignedCount} nicht zugewiesen)
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
