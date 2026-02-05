import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Search, X, ChevronDown, ChevronUp, Filter, Clock } from "lucide-react";
import { format, startOfDay, endOfDay, addDays, startOfWeek, endOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useCategories, useAssignableUsers, TodoFilters as TodoFiltersType } from "@/hooks/useTodos";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface TodoFiltersProps {
  filters: TodoFiltersType;
  onFiltersChange: (filters: TodoFiltersType) => void;
  currentUserId?: string;
}

export function TodoFilters({ filters, onFiltersChange, currentUserId }: TodoFiltersProps) {
  const { data: categories = [] } = useCategories();
  const { data: users = [] } = useAssignableUsers();
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = <K extends keyof TodoFiltersType>(key: K, value: TodoFiltersType[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      assignedTo: 'mine_and_unassigned',
      category: 'all',
      priority: 'all',
      status: 'all',
      dueDateFrom: '',
      dueDateTo: '',
      sortBy: 'due_date',
      sortOrder: 'asc',
    });
  };

  const hasActiveFilters = filters.search || 
    (filters.assignedTo !== 'all' && filters.assignedTo !== 'mine_and_unassigned') || 
    filters.category !== 'all' || 
    filters.priority !== 'all' || 
    filters.status !== 'all' ||
    filters.dueDateFrom ||
    filters.dueDateTo;

  const activeFilterCount = [
    filters.assignedTo !== 'all' && filters.assignedTo !== 'mine_and_unassigned',
    filters.category !== 'all',
    filters.priority !== 'all',
    filters.status !== 'all',
    filters.dueDateFrom,
    filters.dueDateTo,
  ].filter(Boolean).length;

   // Quick date filters
   const applyQuickFilter = (filterType: 'today' | 'week' | 'overdue') => {
     const today = new Date();
     if (filterType === 'today') {
       const todayStr = format(today, 'yyyy-MM-dd');
       onFiltersChange({
         ...filters,
         dueDateFrom: todayStr,
         dueDateTo: todayStr,
       });
     } else if (filterType === 'week') {
       const weekStart = startOfWeek(today, { weekStartsOn: 1 });
       const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
       onFiltersChange({
         ...filters,
         dueDateFrom: format(weekStart, 'yyyy-MM-dd'),
         dueDateTo: format(weekEnd, 'yyyy-MM-dd'),
       });
     } else if (filterType === 'overdue') {
       const yesterday = format(addDays(today, -1), 'yyyy-MM-dd');
       onFiltersChange({
         ...filters,
         dueDateFrom: '',
         dueDateTo: yesterday,
         status: 'open',
       });
     }
   };
 
  return (
    <div className="space-y-3">
       {/* Quick filters */}
       <div className="flex flex-wrap gap-2">
         <Button 
           variant="outline" 
           size="sm"
           onClick={() => applyQuickFilter('today')}
           className="gap-1.5"
         >
           <Clock className="h-3.5 w-3.5" />
           Heute fällig
         </Button>
         <Button 
           variant="outline" 
           size="sm"
           onClick={() => applyQuickFilter('week')}
           className="gap-1.5"
         >
           <CalendarIcon className="h-3.5 w-3.5" />
           Diese Woche
         </Button>
         <Button 
           variant="outline" 
           size="sm"
           onClick={() => applyQuickFilter('overdue')}
           className="gap-1.5 text-destructive hover:text-destructive"
         >
           Überfällig
         </Button>
       </div>
 
      {/* Search bar always visible */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Aufgaben durchsuchen..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setIsOpen(!isOpen)}>
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filter</span>
          {activeFilterCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[20px]">
              {activeFilterCount}
            </span>
          )}
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Collapsible filter section */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent>
          <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
            {/* Primary filters */}
            <div className="flex flex-col lg:flex-row gap-3">
              <Select value={filters.assignedTo} onValueChange={(v) => updateFilter('assignedTo', v)}>
                <SelectTrigger className="w-full lg:w-[200px]">
                  <SelectValue placeholder="Verantwortlich" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine_and_unassigned">Meine + Nicht zugewiesen</SelectItem>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.first_name} {user.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.category} onValueChange={(v) => updateFilter('category', v)}>
                <SelectTrigger className="w-full lg:w-[150px]">
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kategorien</SelectItem>
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

              <Select value={filters.priority} onValueChange={(v) => updateFilter('priority', v)}>
                <SelectTrigger className="w-full lg:w-[130px]">
                  <SelectValue placeholder="Priorität" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="urgent">Dringend</SelectItem>
                  <SelectItem value="high">Hoch</SelectItem>
                  <SelectItem value="medium">Mittel</SelectItem>
                  <SelectItem value="low">Niedrig</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.status} onValueChange={(v) => updateFilter('status', v)}>
                <SelectTrigger className="w-full lg:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="open">Offen</SelectItem>
                  <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                  <SelectItem value="done">Erledigt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date filters and sorting */}
            <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Fälligkeit:</span>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[130px] justify-start text-left font-normal",
                        !filters.dueDateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dueDateFrom ? format(new Date(filters.dueDateFrom), "dd.MM.yyyy", { locale: de }) : "Von"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.dueDateFrom ? new Date(filters.dueDateFrom) : undefined}
                      onSelect={(date) => updateFilter('dueDateFrom', date ? format(date, 'yyyy-MM-dd') : '')}
                      initialFocus
                      locale={de}
                    />
                  </PopoverContent>
                </Popover>

                <span className="text-sm text-muted-foreground">–</span>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[130px] justify-start text-left font-normal",
                        !filters.dueDateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dueDateTo ? format(new Date(filters.dueDateTo), "dd.MM.yyyy", { locale: de }) : "Bis"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.dueDateTo ? new Date(filters.dueDateTo) : undefined}
                      onSelect={(date) => updateFilter('dueDateTo', date ? format(date, 'yyyy-MM-dd') : '')}
                      initialFocus
                      locale={de}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Sortieren:</span>
                
                <Select value={filters.sortBy} onValueChange={(v) => updateFilter('sortBy', v as TodoFiltersType['sortBy'])}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_date">Fälligkeit</SelectItem>
                    <SelectItem value="priority">Priorität</SelectItem>
                    <SelectItem value="created_at">Erstelldatum</SelectItem>
                    <SelectItem value="task_number">Nummer</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.sortOrder} onValueChange={(v) => updateFilter('sortOrder', v as 'asc' | 'desc')}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Aufsteigend</SelectItem>
                    <SelectItem value="desc">Absteigend</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Zurücksetzen
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
