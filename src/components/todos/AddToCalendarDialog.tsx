import { useState } from 'react';
import { format, setHours, setMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { useCreateCalendarEvent } from '@/hooks/useCalendar';
import { Todo } from '@/hooks/useTodos';

 
 interface AddToCalendarDialogProps {
   todo: Todo;
   open: boolean;
   onOpenChange: (open: boolean) => void;
 }
 
 export function AddToCalendarDialog({ todo, open, onOpenChange }: AddToCalendarDialogProps) {
   const createEvent = useCreateCalendarEvent();
   
   const initialDate = todo.due_date ? new Date(todo.due_date) : new Date();
   
   const [date, setDate] = useState<Date>(initialDate);
   const [startTime, setStartTime] = useState('09:00');
   const [endTime, setEndTime] = useState('10:00');
   const [isAllDay, setIsAllDay] = useState(false);
   
   const handleSave = () => {
     const [startHour, startMin] = startTime.split(':').map(Number);
     const [endHour, endMin] = endTime.split(':').map(Number);
     
     const startDateTime = isAllDay 
       ? setHours(setMinutes(date, 0), 0)
       : setHours(setMinutes(date, startMin), startHour);
     
     const endDateTime = isAllDay
       ? undefined
       : setHours(setMinutes(date, endMin), endHour);
     
     createEvent.mutate({
       title: todo.title,
       description: todo.description || undefined,
       start_datetime: startDateTime.toISOString(),
       end_datetime: endDateTime?.toISOString(),
       is_all_day: isAllDay,
       todo_id: todo.id,
       category_id: todo.category_id || undefined,
       // Copy assignees from todo
       assignees: todo.assignees?.map(a => a.user?.user_id).filter(Boolean) as string[] || 
                  (todo.assigned_to ? [todo.assigned_to] : []),
       // Copy buildings from todo
       building_ids: todo.buildings?.map(b => b.building?.id).filter(Boolean) as string[] ||
                     (todo.building_id ? [todo.building_id] : []),
     }, {
       onSuccess: () => onOpenChange(false),
     });
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-[400px]">
         <DialogHeader>
           <DialogTitle>In Kalender eintragen</DialogTitle>
         </DialogHeader>
         
         <div className="space-y-4 py-4">
           {/* Task info */}
           <div className="p-3 bg-muted rounded-lg">
             <div className="text-sm text-muted-foreground">Aufgabe #{todo.task_number}</div>
             <div className="font-medium">{todo.title}</div>
           </div>
           
           {/* Date */}
           <div className="space-y-2">
             <Label>Datum</Label>
             <Popover>
               <PopoverTrigger asChild>
                 <Button variant="outline" className="w-full justify-start text-left font-normal">
                   <CalendarIcon className="mr-2 h-4 w-4" />
                   {format(date, 'PPP', { locale: de })}
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-auto p-0">
                 <Calendar
                   mode="single"
                   selected={date}
                   onSelect={(d) => d && setDate(d)}
                   locale={de}
                 />
               </PopoverContent>
             </Popover>
           </div>
           
           {/* All day toggle */}
           <div className="flex items-center gap-3">
             <Switch checked={isAllDay} onCheckedChange={setIsAllDay} />
             <Label>Ganztägig</Label>
           </div>
           
           {/* Time inputs */}
           {!isAllDay && (
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label>Start</Label>
                 <Input
                   type="time"
                   value={startTime}
                   onChange={(e) => setStartTime(e.target.value)}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Ende</Label>
                 <Input
                   type="time"
                   value={endTime}
                   onChange={(e) => setEndTime(e.target.value)}
                 />
               </div>
             </div>
           )}
         </div>
         

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={handleSave} disabled={createEvent.isPending}>
              {createEvent.isPending ? 'Speichern...' : 'In App-Kalender'}
            </Button>
          </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }