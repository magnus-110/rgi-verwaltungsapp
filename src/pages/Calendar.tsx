 import { useState } from 'react';
 import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
 import { de } from 'date-fns/locale';
 import { Button } from '@/components/ui/button';
 import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from 'lucide-react';
 import { CalendarView } from '@/components/calendar/CalendarView';
 import { EventDialog } from '@/components/calendar/EventDialog';
 import { CalendarFilters } from '@/components/calendar/CalendarFilters';
 import { cn } from '@/lib/utils';
 
 export type ViewMode = 'month' | 'week' | 'day';
 
 export function Calendar() {
   const [currentDate, setCurrentDate] = useState(new Date());
   const [viewMode, setViewMode] = useState<ViewMode>('month');
   const [eventDialogOpen, setEventDialogOpen] = useState(false);
   const [selectedDate, setSelectedDate] = useState<Date | null>(null);
   const [editingEventId, setEditingEventId] = useState<string | null>(null);
   const [filters, setFilters] = useState({
     showTodos: true,
     showEvents: true,
     categories: [] as string[],
     assignees: [] as string[],
     buildings: [] as string[],
   });
 
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
     }
     // For todos, could navigate to task page or open task dialog
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
           <Plus className="h-4 w-4 mr-2" />
           Neuer Termin
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
 
       {/* Event Dialog */}
       <EventDialog
         open={eventDialogOpen}
         onOpenChange={setEventDialogOpen}
         selectedDate={selectedDate}
         eventId={editingEventId}
       />
     </div>
   );
 }