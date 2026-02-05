import { useState, useEffect } from 'react';
import { format, setHours, setMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Trash2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  useCreateCalendarEvent, 
  useUpdateCalendarEvent, 
  useDeleteCalendarEvent,
  CalendarEvent,
} from '@/hooks/useCalendar';
import { useCategories, useAssignableUsers } from '@/hooks/useTodos';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
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
 
 interface EventDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   selectedDate: Date | null;
   eventId: string | null;
 }
 
 export function EventDialog({ open, onOpenChange, selectedDate, eventId }: EventDialogProps) {
   const isEditing = !!eventId;
   const createEvent = useCreateCalendarEvent();
   const updateEvent = useUpdateCalendarEvent();
   const deleteEvent = useDeleteCalendarEvent();
   const { data: categories = [] } = useCategories();
   const { data: users = [] } = useAssignableUsers();
   
   const { data: buildings = [] } = useQuery({
     queryKey: ['buildings-simple'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('buildings')
         .select('id, name')
         .order('name');
       if (error) throw error;
       return data;
     },
   });
   
   // Form state
   const [title, setTitle] = useState('');
   const [description, setDescription] = useState('');
   const [date, setDate] = useState<Date>(selectedDate || new Date());
   const [startTime, setStartTime] = useState('09:00');
   const [endTime, setEndTime] = useState('10:00');
   const [isAllDay, setIsAllDay] = useState(false);
   const [categoryId, setCategoryId] = useState<string>('');
   const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
   const [selectedBuildings, setSelectedBuildings] = useState<string[]>([]);
   
   // Load existing event for editing
   const { data: existingEvent } = useQuery({
     queryKey: ['calendar-event', eventId],
     queryFn: async () => {
       if (!eventId) return null;
       const { data, error } = await supabase
         .from('calendar_events')
         .select(`
           *,
           assignees:calendar_event_assignees(user_id),
           buildings:calendar_event_buildings(building_id)
         `)
         .eq('id', eventId)
         .single();
       if (error) throw error;
       return data;
     },
     enabled: !!eventId,
   });
   
   // Populate form when editing
   useEffect(() => {
     if (existingEvent) {
       setTitle(existingEvent.title);
       setDescription(existingEvent.description || '');
       setDate(new Date(existingEvent.start_datetime));
       setStartTime(format(new Date(existingEvent.start_datetime), 'HH:mm'));
       if (existingEvent.end_datetime) {
         setEndTime(format(new Date(existingEvent.end_datetime), 'HH:mm'));
       }
       setIsAllDay(existingEvent.is_all_day);
       setCategoryId(existingEvent.category_id || '');
       setSelectedAssignees(existingEvent.assignees?.map((a: any) => a.user_id) || []);
       setSelectedBuildings(existingEvent.buildings?.map((b: any) => b.building_id) || []);
     } else if (selectedDate) {
       setDate(selectedDate);
       const hours = selectedDate.getHours();
       if (hours >= 7 && hours <= 20) {
         setStartTime(`${hours.toString().padStart(2, '0')}:00`);
         setEndTime(`${(hours + 1).toString().padStart(2, '0')}:00`);
       }
     }
   }, [existingEvent, selectedDate]);
   
   // Reset form when dialog closes
   useEffect(() => {
     if (!open) {
       setTitle('');
       setDescription('');
       setDate(new Date());
       setStartTime('09:00');
       setEndTime('10:00');
       setIsAllDay(false);
       setCategoryId('');
       setSelectedAssignees([]);
       setSelectedBuildings([]);
     }
   }, [open]);
   
   const handleSave = () => {
     if (!title.trim()) return;
     
     const [startHour, startMin] = startTime.split(':').map(Number);
     const [endHour, endMin] = endTime.split(':').map(Number);
     
     const startDateTime = isAllDay 
       ? setHours(setMinutes(date, 0), 0)
       : setHours(setMinutes(date, startMin), startHour);
     
     const endDateTime = isAllDay
       ? undefined
       : setHours(setMinutes(date, endMin), endHour);
     
     const eventData = {
       title: title.trim(),
       description: description.trim() || undefined,
       start_datetime: startDateTime.toISOString(),
       end_datetime: endDateTime?.toISOString(),
       is_all_day: isAllDay,
        category_id: categoryId && categoryId !== 'none' ? categoryId : undefined,
       assignees: selectedAssignees,
       building_ids: selectedBuildings,
     };
     
     if (isEditing && eventId) {
       updateEvent.mutate({ id: eventId, ...eventData }, {
         onSuccess: () => onOpenChange(false),
       });
     } else {
       createEvent.mutate(eventData, {
         onSuccess: () => onOpenChange(false),
       });
     }
   };
   
   const handleDelete = () => {
     if (eventId) {
       deleteEvent.mutate(eventId, {
         onSuccess: () => onOpenChange(false),
       });
     }
   };
   
   const toggleAssignee = (userId: string) => {
     setSelectedAssignees(prev => 
       prev.includes(userId) 
         ? prev.filter(id => id !== userId)
         : [...prev, userId]
     );
   };
   
   const toggleBuilding = (buildingId: string) => {
     setSelectedBuildings(prev => 
       prev.includes(buildingId) 
         ? prev.filter(id => id !== buildingId)
         : [...prev, buildingId]
     );
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
         <DialogHeader>
           <DialogTitle>{isEditing ? 'Termin bearbeiten' : 'Neuer Termin'}</DialogTitle>
         </DialogHeader>
         
         <div className="space-y-4 py-4">
           {/* Title */}
           <div className="space-y-2">
             <Label htmlFor="title">Titel *</Label>
             <Input
               id="title"
               value={title}
               onChange={(e) => setTitle(e.target.value)}
               placeholder="Terminbezeichnung"
               autoFocus
             />
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
           
           {/* Description */}
           <div className="space-y-2">
             <Label htmlFor="description">Beschreibung</Label>
             <Textarea
               id="description"
               value={description}
               onChange={(e) => setDescription(e.target.value)}
               placeholder="Weitere Details..."
               rows={3}
             />
           </div>
           
           {/* Category */}
           <div className="space-y-2">
             <Label>Kategorie</Label>
             <Select value={categoryId} onValueChange={setCategoryId}>
               <SelectTrigger>
                 <SelectValue placeholder="Kategorie wählen" />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value="none">Keine Kategorie</SelectItem>
                 {categories.map(cat => (
                   <SelectItem key={cat.id} value={cat.id}>
                     <div className="flex items-center gap-2">
                       <div 
                         className="w-3 h-3 rounded-full" 
                         style={{ backgroundColor: cat.color }}
                       />
                       {cat.name}
                     </div>
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
           
           {/* Assignees */}
           <div className="space-y-2">
             <Label>Verantwortliche</Label>
             <Popover>
               <PopoverTrigger asChild>
                 <Button variant="outline" className="w-full justify-start">
                   {selectedAssignees.length > 0 
                     ? `${selectedAssignees.length} ausgewählt`
                     : 'Personen auswählen'
                   }
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-[300px] p-2">
                 <div className="space-y-1 max-h-[200px] overflow-y-auto">
                   {users.map(user => (
                     <div 
                       key={user.user_id} 
                       className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                       onClick={() => toggleAssignee(user.user_id)}
                     >
                       <Checkbox checked={selectedAssignees.includes(user.user_id)} />
                       <span>{user.first_name} {user.last_name}</span>
                     </div>
                   ))}
                 </div>
               </PopoverContent>
             </Popover>
           </div>
           
           {/* Buildings */}
           <div className="space-y-2">
             <Label>Gebäude</Label>
             <Popover>
               <PopoverTrigger asChild>
                 <Button variant="outline" className="w-full justify-start">
                   {selectedBuildings.length > 0 
                     ? `${selectedBuildings.length} ausgewählt`
                     : 'Gebäude auswählen'
                   }
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-[300px] p-2">
                 <div className="space-y-1 max-h-[200px] overflow-y-auto">
                   {buildings.map(building => (
                     <div 
                       key={building.id} 
                       className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                       onClick={() => toggleBuilding(building.id)}
                     >
                       <Checkbox checked={selectedBuildings.includes(building.id)} />
                       <span>{building.name}</span>
                     </div>
                   ))}
                 </div>
               </PopoverContent>
             </Popover>
           </div>
         </div>
         
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 mr-auto">
              {isEditing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Termin löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Diese Aktion kann nicht rückgängig gemacht werden.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {/* Google Calendar Export */}
              {title.trim() && (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => {
                    const [startHour, startMin] = startTime.split(':').map(Number);
                    const [endHour, endMin] = endTime.split(':').map(Number);
                    const startDateTime = isAllDay 
                      ? setHours(setMinutes(date, 0), 0)
                      : setHours(setMinutes(date, startMin), startHour);
                    const endDateTime = isAllDay
                      ? undefined
                      : setHours(setMinutes(date, endMin), endHour);
                    const googleUrl = generateGoogleCalendarUrl(title, startDateTime, endDateTime, description, isAllDay);
                    window.open(googleUrl, '_blank');
                    toast.success('Google Kalender wird geöffnet...');
                  }}
                  title="In Google Kalender exportieren"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={!title.trim()}>
              {isEditing ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }