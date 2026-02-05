import { useState } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, ExternalLink } from 'lucide-react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { EventDialog } from '@/components/calendar/EventDialog';
import { CalendarFilters } from '@/components/calendar/CalendarFilters';
import { TodoDialog } from '@/components/todos/TodoDialog';
import { useTodo } from '@/hooks/useTodos';
import { useCalendarEvents } from '@/hooks/useCalendar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Generate Google Calendar URL for an event
function generateGoogleCalendarUrl(
  title: string,
  startDate: Date,
  endDate: Date | undefined,
  description?: string,
  isAllDay?: boolean
): string {
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  
  if (isAllDay) {
    const startStr = format(startDate, 'yyyyMMdd');
    const endStr = format(endDate || startDate, 'yyyyMMdd');
    url.searchParams.set('dates', `${startStr}/${endStr}`);
  } else {
    const formatGoogleDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const startStr = formatGoogleDate(startDate);
    const endStr = endDate ? formatGoogleDate(endDate) : formatGoogleDate(new Date(startDate.getTime() + 60 * 60 * 1000));
    url.searchParams.set('dates', `${startStr}/${endStr}`);
  }
  
  if (description) {
    url.searchParams.set('details', description);
  }
  
  return url.toString();
}
 
 export type ViewMode = 'month' | 'week' | 'day';
 
 export function Calendar() {
   const [currentDate, setCurrentDate] = useState(new Date());
   const [viewMode, setViewMode] = useState<ViewMode>('month');
   const [eventDialogOpen, setEventDialogOpen] = useState(false);
   const [selectedDate, setSelectedDate] = useState<Date | null>(null);
   const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [todoDialogOpen, setTodoDialogOpen] = useState(false);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
   const [filters, setFilters] = useState({
     showTodos: true,
     showEvents: true,
     categories: [] as string[],
     assignees: [] as string[],
     buildings: [] as string[],
   });
  // Fetch selected todo for editing
  const { data: selectedTodo } = useTodo(selectedTodoId || '');
 
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
 
   const handleEventClick = (eventId: string, type: 'event' | 'todo') => {
     if (type === 'event') {
       setEditingEventId(eventId);
       setSelectedDate(null);
       setEventDialogOpen(true);
    } else if (type === 'todo') {
      setSelectedTodoId(eventId);
      setTodoDialogOpen(true);
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
         
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              // Open selected event in Google Calendar
              // For now, open Google Calendar with today's date
              const today = new Date();
              const googleUrl = generateGoogleCalendarUrl('Neuer Termin', today, undefined, undefined, false);
              window.open(googleUrl, '_blank');
              toast.success('Google Kalender wird geöffnet...');
            }}>
              <ExternalLink className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Google</span>
            </Button>
            <Button onClick={() => { setSelectedDate(new Date()); setEditingEventId(null); setEventDialogOpen(true); }}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Neuer Termin</span>
            </Button>
          </div>
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
 
       {/* Event Dialog */}
       <EventDialog
         open={eventDialogOpen}
         onOpenChange={setEventDialogOpen}
         selectedDate={selectedDate}
         eventId={editingEventId}
       />

      {/* Todo Dialog */}
      <TodoDialog
        open={todoDialogOpen}
        onOpenChange={(open) => {
          setTodoDialogOpen(open);
          if (!open) setSelectedTodoId(null);
        }}
        todo={selectedTodo}
        mode="edit"
      />
     </div>
   );
 }