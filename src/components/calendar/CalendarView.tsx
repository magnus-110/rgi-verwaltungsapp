 import { useMemo, useState } from 'react';
 import { 
   format, 
   startOfMonth, 
   endOfMonth, 
   startOfWeek, 
   endOfWeek, 
   eachDayOfInterval,
   isSameMonth,
   isSameDay,
   isToday,
  getHours,
  setHours,
  setMinutes,
  getISOWeek,
} from 'date-fns';
import { de } from 'date-fns/locale';
 import { useCalendarItems, CalendarItem } from '@/hooks/useCalendar';
 import { cn } from '@/lib/utils';
 import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
 import { useMoveCalendarEvent } from '@/hooks/useCalendar';
 import { useUpdateTodo } from '@/hooks/useTodos';
 import { Badge } from '@/components/ui/badge';
 import { CheckSquare, Calendar } from 'lucide-react';
 import { ViewMode } from '@/pages/Calendar';
 
 interface CalendarViewProps {
   currentDate: Date;
   viewMode: ViewMode;
   filters: {
     showTodos: boolean;
     showEvents: boolean;
     categories: string[];
     assignees: string[];
     buildings: string[];
   };
   onDateClick: (date: Date) => void;
   onEventClick: (eventId: string, type: 'event' | 'todo') => void;
   onDateChange: (date: Date) => void;
 }
 
 export function CalendarView({ 
   currentDate, 
   viewMode, 
   filters, 
   onDateClick, 
   onEventClick,
   onDateChange,
 }: CalendarViewProps) {
   const { items, isLoading } = useCalendarItems(currentDate, viewMode);
   const moveEvent = useMoveCalendarEvent();
   const updateTodo = useUpdateTodo();
   
   // Filter items based on filters
   const filteredItems = useMemo(() => {
     return items.filter(item => {
       if (item.type === 'todo' && !filters.showTodos) return false;
       if (item.type === 'event' && !filters.showEvents) return false;
       if (filters.categories.length > 0 && item.categoryName && !filters.categories.includes(item.categoryName)) return false;
       return true;
     });
   }, [items, filters]);
 
   const handleDragEnd = (result: DropResult) => {
     if (!result.destination) return;
     
     const itemId = result.draggableId;
     const item = filteredItems.find(i => i.id === itemId);
     if (!item) return;
     
     const [, targetDateStr] = result.destination.droppableId.split('-');
     const targetDate = new Date(targetDateStr);
     
     // Preserve time from original event
     const newStart = new Date(targetDate);
     newStart.setHours(item.start.getHours(), item.start.getMinutes());
     
     if (item.type === 'event' && item.eventId) {
       const newEnd = item.end ? new Date(targetDate) : undefined;
       if (newEnd && item.end) {
         newEnd.setHours(item.end.getHours(), item.end.getMinutes());
       }
       moveEvent.mutate({
         id: item.eventId,
         start_datetime: newStart.toISOString(),
         end_datetime: newEnd?.toISOString(),
       });
     } else if (item.type === 'todo' && item.todoId) {
       updateTodo.mutate({
         id: item.todoId,
         due_date: format(newStart, 'yyyy-MM-dd'),
       });
     }
   };
 
   if (viewMode === 'month') {
     return (
       <MonthView 
         currentDate={currentDate} 
         items={filteredItems} 
         onDateClick={onDateClick}
         onEventClick={onEventClick}
         onDragEnd={handleDragEnd}
         isLoading={isLoading}
       />
     );
   }
 
   if (viewMode === 'week') {
     return (
       <WeekView 
         currentDate={currentDate} 
         items={filteredItems} 
         onDateClick={onDateClick}
         onEventClick={onEventClick}
         onDragEnd={handleDragEnd}
         isLoading={isLoading}
       />
     );
   }
 
   return (
     <DayView 
       currentDate={currentDate} 
       items={filteredItems} 
       onEventClick={onEventClick}
       onTimeClick={(date) => onDateClick(date)}
       onDragEnd={handleDragEnd}
       isLoading={isLoading}
     />
   );
 }
 
 // Month View Component
 function MonthView({ 
   currentDate, 
   items, 
   onDateClick, 
   onEventClick,
   onDragEnd,
   isLoading,
 }: { 
   currentDate: Date; 
   items: CalendarItem[];
   onDateClick: (date: Date) => void;
   onEventClick: (eventId: string, type: 'event' | 'todo') => void;
   onDragEnd: (result: DropResult) => void;
   isLoading: boolean;
 }) {
   const monthStart = startOfMonth(currentDate);
   const monthEnd = endOfMonth(currentDate);
   const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
   const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
   const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
   
   const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
   
   const getItemsForDay = (date: Date) => {
     return items.filter(item => isSameDay(item.start, date));
   };
 
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="bg-card rounded-lg border overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b">
          <div className="p-2 text-center text-xs font-medium text-muted-foreground border-r">
            KW
          </div>
          {weekdays.map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid - rows of weeks with KW number */}
        {Array.from({ length: days.length / 7 }).map((_, weekIdx) => {
          const weekDays = days.slice(weekIdx * 7, weekIdx * 7 + 7);
          const weekNumber = getISOWeek(weekDays[0]);
          return (
            <div key={weekIdx} className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
              <div className="border-r border-b flex items-start justify-center pt-2 text-xs font-medium text-muted-foreground bg-muted/20">
                {weekNumber}
              </div>
              {weekDays.map((day) => {
                const dayItems = getItemsForDay(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                
                return (
                  <Droppable droppableId={`day-${format(day, 'yyyy-MM-dd')}`} key={day.toISOString()}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        onClick={() => onDateClick(day)}
                        className={cn(
                          'min-h-[100px] sm:min-h-[120px] p-1 sm:p-2 border-r border-b last:border-r-0 cursor-pointer transition-colors',
                          !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
                          isToday(day) && 'bg-primary/5',
                          snapshot.isDraggingOver && 'bg-primary/10'
                        )}
                      >
                        <div className={cn(
                          'text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full',
                          isToday(day) && 'bg-primary text-primary-foreground'
                        )}>
                          {format(day, 'd')}
                        </div>
                        
                        <div className="space-y-1">
                          {dayItems.slice(0, 3).map((item, itemIndex) => (
                            <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={(e) => { e.stopPropagation(); onEventClick(item.id, item.type); }}
                                  className={cn(
                                    'text-xs p-1 rounded truncate flex items-center gap-1',
                                    snapshot.isDragging && 'shadow-lg opacity-90'
                                  )}
                                  style={{
                                    backgroundColor: `${item.color}20`,
                                    borderLeft: `3px solid ${item.color}`,
                                    ...provided.draggableProps.style,
                                  }}
                                >
                                  {item.type === 'todo' ? (
                                    <CheckSquare className="h-3 w-3 shrink-0" style={{ color: item.color }} />
                                  ) : (
                                    <Calendar className="h-3 w-3 shrink-0" style={{ color: item.color }} />
                                  )}
                                  <span className="truncate">{item.taskNumber ? `#${item.taskNumber} ` : ''}{item.title}</span>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {dayItems.length > 3 && (
                            <div className="text-xs text-muted-foreground pl-1">
                              +{dayItems.length - 3} weitere
                            </div>
                          )}
                        </div>
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
 
 // Week View Component
 function WeekView({ 
   currentDate, 
   items, 
   onDateClick, 
   onEventClick,
   onDragEnd,
   isLoading,
 }: { 
   currentDate: Date; 
   items: CalendarItem[];
   onDateClick: (date: Date) => void;
   onEventClick: (eventId: string, type: 'event' | 'todo') => void;
   onDragEnd: (result: DropResult) => void;
   isLoading: boolean;
 }) {
   const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
   const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
   const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
   const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 - 20:00
   
   const getItemsForDayAndHour = (date: Date, hour: number) => {
     return items.filter(item => 
       isSameDay(item.start, date) && 
       !item.isAllDay &&
       getHours(item.start) === hour
     );
   };
   
   const getAllDayItems = (date: Date) => {
     return items.filter(item => isSameDay(item.start, date) && item.isAllDay);
   };
 
   return (
     <DragDropContext onDragEnd={onDragEnd}>
       <div className="bg-card rounded-lg border overflow-auto">
         {/* Header with days */}
         <div className="grid grid-cols-8 border-b sticky top-0 bg-card z-10">
           <div className="p-2 text-center text-sm text-muted-foreground border-r" />
           {days.map(day => (
             <div 
               key={day.toISOString()} 
               className={cn(
                 'p-2 text-center border-r last:border-r-0',
                 isToday(day) && 'bg-primary/5'
               )}
             >
               <div className="text-xs text-muted-foreground">
                 {format(day, 'EEE', { locale: de })}
               </div>
               <div className={cn(
                 'text-lg font-semibold w-8 h-8 mx-auto flex items-center justify-center rounded-full',
                 isToday(day) && 'bg-primary text-primary-foreground'
               )}>
                 {format(day, 'd')}
               </div>
             </div>
           ))}
         </div>
         
         {/* All-day events row */}
         <div className="grid grid-cols-8 border-b min-h-[40px]">
           <div className="p-1 text-xs text-muted-foreground border-r flex items-center justify-center">
             Ganztägig
           </div>
           {days.map(day => {
             const allDayItems = getAllDayItems(day);
             return (
               <div key={day.toISOString()} className="p-1 border-r last:border-r-0 flex flex-wrap gap-1">
                 {allDayItems.map(item => (
                   <Badge 
                     key={item.id}
                     variant="outline"
                     className="text-xs cursor-pointer"
                     style={{ 
                       backgroundColor: `${item.color}20`,
                       borderColor: item.color,
                       color: item.color,
                     }}
                     onClick={() => onEventClick(item.id, item.type)}
                   >
                     {item.type === 'todo' && <CheckSquare className="h-3 w-3 mr-1" />}
                     {item.title}
                   </Badge>
                 ))}
               </div>
             );
           })}
         </div>
         
         {/* Time grid */}
         {hours.map(hour => (
           <div key={hour} className="grid grid-cols-8 border-b min-h-[60px]">
             <div className="p-1 text-xs text-muted-foreground border-r text-right pr-2">
               {hour}:00
             </div>
             {days.map(day => {
               const hourItems = getItemsForDayAndHour(day, hour);
               return (
                 <Droppable 
                   droppableId={`hour-${format(day, 'yyyy-MM-dd')}-${hour}`} 
                   key={`${day.toISOString()}-${hour}`}
                 >
                   {(provided, snapshot) => (
                     <div
                       ref={provided.innerRef}
                       {...provided.droppableProps}
                       onClick={() => {
                         const clickDate = setMinutes(setHours(day, hour), 0);
                         onDateClick(clickDate);
                       }}
                       className={cn(
                         'p-1 border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors',
                         snapshot.isDraggingOver && 'bg-primary/10'
                       )}
                     >
                       {hourItems.map((item, index) => (
                         <Draggable key={item.id} draggableId={item.id} index={index}>
                           {(provided, snapshot) => (
                             <div
                               ref={provided.innerRef}
                               {...provided.draggableProps}
                               {...provided.dragHandleProps}
                               onClick={(e) => { e.stopPropagation(); onEventClick(item.id, item.type); }}
                               className={cn(
                                 'text-xs p-1 rounded mb-1 cursor-pointer',
                                 snapshot.isDragging && 'shadow-lg'
                               )}
                               style={{
                                 backgroundColor: `${item.color}30`,
                                 borderLeft: `3px solid ${item.color}`,
                                 ...provided.draggableProps.style,
                               }}
                             >
                               <div className="font-medium truncate">{item.title}</div>
                               <div className="text-muted-foreground">
                                 {format(item.start, 'HH:mm')}
                                 {item.end && ` - ${format(item.end, 'HH:mm')}`}
                               </div>
                             </div>
                           )}
                         </Draggable>
                       ))}
                       {provided.placeholder}
                     </div>
                   )}
                 </Droppable>
               );
             })}
           </div>
         ))}
       </div>
     </DragDropContext>
   );
 }
 
 // Day View Component
 function DayView({ 
   currentDate, 
   items, 
   onEventClick,
   onTimeClick,
   onDragEnd,
   isLoading,
 }: { 
   currentDate: Date; 
   items: CalendarItem[];
   onEventClick: (eventId: string, type: 'event' | 'todo') => void;
   onTimeClick: (date: Date) => void;
   onDragEnd: (result: DropResult) => void;
   isLoading: boolean;
 }) {
   const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 - 20:00
   
   const getItemsForHour = (hour: number) => {
     return items.filter(item => 
       isSameDay(item.start, currentDate) && 
       !item.isAllDay &&
       getHours(item.start) === hour
     );
   };
   
   const allDayItems = items.filter(item => 
     isSameDay(item.start, currentDate) && item.isAllDay
   );
 
   return (
     <DragDropContext onDragEnd={onDragEnd}>
       <div className="bg-card rounded-lg border">
         {/* All-day section */}
         {allDayItems.length > 0 && (
           <div className="p-3 border-b">
             <div className="text-sm text-muted-foreground mb-2">Ganztägig</div>
             <div className="flex flex-wrap gap-2">
               {allDayItems.map(item => (
                 <div
                   key={item.id}
                   onClick={() => onEventClick(item.id, item.type)}
                   className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                   style={{
                     backgroundColor: `${item.color}20`,
                     borderLeft: `4px solid ${item.color}`,
                   }}
                 >
                   {item.type === 'todo' ? (
                     <CheckSquare className="h-4 w-4" style={{ color: item.color }} />
                   ) : (
                     <Calendar className="h-4 w-4" style={{ color: item.color }} />
                   )}
                   <span className="font-medium">{item.taskNumber ? `#${item.taskNumber} ` : ''}{item.title}</span>
                   {item.categoryName && (
                     <Badge variant="outline" className="text-xs">{item.categoryName}</Badge>
                   )}
                 </div>
               ))}
             </div>
           </div>
         )}
         
         {/* Time slots */}
         <div className="divide-y">
           {hours.map(hour => {
             const hourItems = getItemsForHour(hour);
             return (
               <Droppable droppableId={`dayhour-${format(currentDate, 'yyyy-MM-dd')}-${hour}`} key={hour}>
                 {(provided, snapshot) => (
                   <div
                     ref={provided.innerRef}
                     {...provided.droppableProps}
                     onClick={() => onTimeClick(setMinutes(setHours(currentDate, hour), 0))}
                     className={cn(
                       'flex min-h-[80px] cursor-pointer hover:bg-muted/30 transition-colors',
                       snapshot.isDraggingOver && 'bg-primary/10'
                     )}
                   >
                     <div className="w-20 p-3 text-sm text-muted-foreground border-r shrink-0">
                       {hour}:00
                     </div>
                     <div className="flex-1 p-2 space-y-2">
                       {hourItems.map((item, index) => (
                         <Draggable key={item.id} draggableId={item.id} index={index}>
                           {(provided, snapshot) => (
                             <div
                               ref={provided.innerRef}
                               {...provided.draggableProps}
                               {...provided.dragHandleProps}
                               onClick={(e) => { e.stopPropagation(); onEventClick(item.id, item.type); }}
                               className={cn(
                                 'flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:opacity-90 transition-opacity',
                                 snapshot.isDragging && 'shadow-lg'
                               )}
                               style={{
                                 backgroundColor: `${item.color}15`,
                                 borderLeft: `4px solid ${item.color}`,
                                 ...provided.draggableProps.style,
                               }}
                             >
                               {item.type === 'todo' ? (
                                 <CheckSquare className="h-5 w-5 mt-0.5" style={{ color: item.color }} />
                               ) : (
                                 <Calendar className="h-5 w-5 mt-0.5" style={{ color: item.color }} />
                               )}
                               <div className="flex-1 min-w-0">
                                 <div className="font-medium">
                                   {item.taskNumber ? `#${item.taskNumber} ` : ''}{item.title}
                                 </div>
                                 <div className="text-sm text-muted-foreground">
                                   {format(item.start, 'HH:mm')}
                                   {item.end && ` - ${format(item.end, 'HH:mm')}`}
                                 </div>
                                 {item.assignees && item.assignees.length > 0 && (
                                   <div className="text-xs text-muted-foreground mt-1">
                                     {item.assignees.join(', ')}
                                   </div>
                                 )}
                               </div>
                               {item.categoryName && (
                                 <Badge variant="outline" className="shrink-0 text-xs">
                                   {item.categoryName}
                                 </Badge>
                               )}
                             </div>
                           )}
                         </Draggable>
                       ))}
                     </div>
                     {provided.placeholder}
                   </div>
                 )}
               </Droppable>
             );
           })}
         </div>
       </div>
     </DragDropContext>
   );
 }