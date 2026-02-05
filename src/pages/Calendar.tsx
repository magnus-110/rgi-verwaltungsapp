import { useState, useMemo } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { EventDialog } from '@/components/calendar/EventDialog';
import { CalendarFilters } from '@/components/calendar/CalendarFilters';
import { CalendarItemDialog, CalendarItem } from '@/components/calendar/CalendarItemDialog';
import { useCalendarItems } from '@/hooks/useCalendar';
import { cn } from '@/lib/utils';

export type ViewMode = 'month' | 'week' | 'day';

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  // New unified dialog state
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  
  const [filters, setFilters] = useState({
    showTodos: true,
    showEvents: true,
    categories: [] as string[],
    assignees: [] as string[],
    buildings: [] as string[],
  });

  // Fetch calendar items for lookups
  const { items: calendarItems } = useCalendarItems(currentDate, viewMode);

  const navigatePrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const navigateNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setEditingEventId(null);
    setEventDialogOpen(true);
  };

  const handleEventClick = (itemId: string, type: 'event' | 'todo') => {
    // Find the item in our calendar items
    const item = calendarItems.find(i => i.id === itemId);
    
    if (item) {
      // Build the CalendarItem for the dialog
      const dialogItem: CalendarItem = {
        id: item.id,
        title: item.title,
        type: item.type,
        startDate: item.start,
        endDate: item.end || undefined,
        isAllDay: item.isAllDay,
        description: undefined, // Will be loaded if needed
        categoryName: item.categoryName,
        categoryColor: item.color,
        status: item.status,
        priority: item.priority,
      };
      
      setSelectedItem(dialogItem);
      setItemDialogOpen(true);
    }
  };

  const handleEditEventFromDialog = () => {
    if (selectedItem && selectedItem.type === 'event') {
      setItemDialogOpen(false);
      setEditingEventId(selectedItem.id);
      setSelectedDate(null);
      setEventDialogOpen(true);
    }
  };

  const getHeaderText = () => {
    if (viewMode === 'month') {
      return format(currentDate, 'MMMM yyyy', { locale: de });
    } else if (viewMode === 'week') {
      return `KW ${format(currentDate, 'w', { locale: de })} · ${format(currentDate, 'MMMM yyyy', { locale: de })}`;
    } else {
      return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-semibold">Kalender</h1>
          <p className="text-muted-foreground text-sm mt-0.5 hidden sm:block">
            Termine und Aufgaben im Überblick
          </p>
        </div>
        
        <Button onClick={() => { setSelectedDate(new Date()); setEditingEventId(null); setEventDialogOpen(true); }}>
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Neuer Termin</span>
        </Button>
      </div>

      {/* Navigation and View Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToToday} className="px-3">
            Heute
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-base sm:text-lg font-medium ml-2 capitalize">
            {getHeaderText()}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <CalendarFilters filters={filters} onFiltersChange={setFilters} />
          
          <div className="flex bg-muted rounded-lg p-1">
            {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant="ghost"
                size="sm"
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-3 rounded-md',
                  viewMode === mode && 'bg-background shadow-sm'
                )}
              >
                {mode === 'month' ? 'Monat' : mode === 'week' ? 'Woche' : 'Tag'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar View */}
      <CalendarView
        currentDate={currentDate}
        viewMode={viewMode}
        filters={filters}
        onDateClick={handleDateClick}
        onEventClick={handleEventClick}
        onDateChange={setCurrentDate}
      />

      {/* Event Dialog - for creating/editing events */}
      <EventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        selectedDate={selectedDate}
        eventId={editingEventId}
      />

      {/* Calendar Item Dialog - unified view for events & todos */}
      <CalendarItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={selectedItem}
        onEditEvent={handleEditEventFromDialog}
      />
    </div>
  );
}