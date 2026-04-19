import { useState, useMemo, useEffect } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { EventDialog } from '@/components/calendar/EventDialog';
import { CalendarFilters } from '@/components/calendar/CalendarFilters';
import { CalendarItemDialog, CalendarItem } from '@/components/calendar/CalendarItemDialog';
import { useCalendarItems } from '@/hooks/useCalendar';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export type ViewMode = 'month' | 'week' | 'day';

export function Calendar() {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'day' : 'month');

  // Auf Mobile bei Erstaufruf zur Tagesansicht wechseln (best practice)
  useEffect(() => {
    if (isMobile && viewMode === 'month') {
      setViewMode('day');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);
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
    <div className="space-y-3 sm:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Kalender</h1>
          <p className="text-muted-foreground text-sm mt-0.5 hidden sm:block">
            Termine und Aufgaben im Überblick
          </p>
        </div>

        {/* Desktop „Neuer Termin"-Button — auf Mobile via FAB */}
        <Button
          className="h-11 hidden sm:inline-flex"
          onClick={() => { setSelectedDate(new Date()); setEditingEventId(null); setEventDialogOpen(true); }}
        >
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Neuer Termin</span>
        </Button>
      </div>

      {/* Navigation and View Toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11 md:h-10 md:w-10" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToToday} className="px-3 h-11 md:h-10">
            Heute
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 md:h-10 md:w-10" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-sm sm:text-lg font-medium ml-2 capitalize truncate">
            {getHeaderText()}
          </h2>
        </div>
        
        <div className="flex items-center gap-2 justify-between sm:justify-end">
          <CalendarFilters filters={filters} onFiltersChange={setFilters} />
          
          <div className="flex bg-muted rounded-lg p-1">
            {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant="ghost"
                size="sm"
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-3 h-9 rounded-md text-xs sm:text-sm',
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

      {/* Mobile FAB für „Neuer Termin" */}
      <Button
        size="icon"
        onClick={() => { setSelectedDate(new Date()); setEditingEventId(null); setEventDialogOpen(true); }}
        aria-label="Neuer Termin"
        className="fixed sm:hidden right-4 bottom-4 h-14 w-14 rounded-full shadow-lg z-40"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}