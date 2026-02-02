import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckSquare, ArrowRight, AlertTriangle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTodos, isOverdue, priorityLabels, TodoFilters } from "@/hooks/useTodos";
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
  status: 'all', // We'll filter in component
  dueDateFrom: '',
  dueDateTo: '',
  sortBy: 'due_date',
  sortOrder: 'asc',
};

export function TodoDashboardWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: allTodos = [], isLoading } = useTodos(widgetFilters);

  // Filter for active todos (not done)
  const activeTodos = allTodos.filter(t => t.status !== 'done');
  
  // Filter for user's tasks
  const myTodos = activeTodos.filter(t => t.assigned_to === user?.id);
  
  // Count unassigned
  const unassignedCount = activeTodos.filter(t => !t.assigned_to).length;

  // Group by priority
  const urgentTodos = myTodos.filter(t => t.priority === 'urgent');
  const highTodos = myTodos.filter(t => t.priority === 'high');
  const otherTodos = myTodos.filter(t => t.priority !== 'urgent' && t.priority !== 'high');

  // Count stats
  const openCount = myTodos.filter(t => t.status === 'open').length;
  const inProgressCount = myTodos.filter(t => t.status === 'in_progress').length;
  const overdueCount = myTodos.filter(t => isOverdue(t)).length;

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const today = new Date();
    const days = differenceInDays(date, today);
    
    if (days < 0) return 'überfällig';
    if (days === 0) return 'heute';
    if (days === 1) return 'morgen';
    if (days <= 7) return `in ${days} Tagen`;
    return format(date, "dd.MM.", { locale: de });
  };

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    low: 'bg-muted text-muted-foreground',
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Meine Aufgaben
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Laden...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-elegant transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <CheckSquare className="h-5 w-5" />
          Meine Aufgaben
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/todos')}>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {myTodos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine Aufgaben zugewiesen
          </p>
        ) : (
          <>
            {/* Urgent tasks */}
            {urgentTodos.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={priorityColors.urgent}>DRINGEND</Badge>
                  <span className="text-xs text-muted-foreground">{urgentTodos.length} Aufgabe(n)</span>
                </div>
                {urgentTodos.slice(0, 2).map(todo => (
                  <TodoWidgetItem key={todo.id} todo={todo} formatDueDate={formatDueDate} />
                ))}
              </div>
            )}

            {/* High priority tasks */}
            {highTodos.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={priorityColors.high}>HOCH</Badge>
                  <span className="text-xs text-muted-foreground">{highTodos.length} Aufgabe(n)</span>
                </div>
                {highTodos.slice(0, 2).map(todo => (
                  <TodoWidgetItem key={todo.id} todo={todo} formatDueDate={formatDueDate} />
                ))}
              </div>
            )}

            {/* Other tasks count */}
            {otherTodos.length > 0 && (
              <div className="text-sm text-muted-foreground">
                + {otherTodos.length} weitere Aufgabe(n)
              </div>
            )}
          </>
        )}

        {/* Stats footer */}
        <div className="pt-2 border-t flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {openCount} offen
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            {inProgressCount} in Bearbeitung
          </span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {overdueCount} überfällig
            </span>
          )}
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

function TodoWidgetItem({ 
  todo, 
  formatDueDate 
}: { 
  todo: any; 
  formatDueDate: (date: string | null) => string | null;
}) {
  const navigate = useNavigate();
  const overdue = isOverdue(todo);
  const dueDateText = formatDueDate(todo.due_date);

  return (
    <div 
      className={cn(
        "flex items-center justify-between p-2 rounded-md bg-muted/50 cursor-pointer hover:bg-muted transition-colors",
        overdue && "border-l-2 border-destructive bg-destructive/5"
      )}
      onClick={() => navigate('/todos')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-mono text-muted-foreground">#{todo.task_number}</span>
        <span className="text-sm truncate">{todo.title}</span>
      </div>
      {dueDateText && (
        <span className={cn(
          "text-xs flex items-center gap-1 shrink-0",
          overdue ? "text-destructive font-medium" : "text-muted-foreground"
        )}>
          <Clock className="h-3 w-3" />
          {dueDateText}
        </span>
      )}
    </div>
  );
}
