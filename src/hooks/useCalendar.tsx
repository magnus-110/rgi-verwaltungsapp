 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/hooks/useAuth';
 import { toast } from '@/hooks/use-toast';
 import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from 'date-fns';
 
 export interface CalendarEvent {
   id: string;
   title: string;
   description: string | null;
   start_datetime: string;
   end_datetime: string | null;
   is_all_day: boolean;
   todo_id: string | null;
   created_by: string;
   category_id: string | null;
   color: string | null;
   created_at: string;
   updated_at: string;
   is_recurring: boolean;
   recurrence_pattern: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
   recurrence_interval: number | null;
   recurrence_end_date: string | null;
   // Joined fields
   category?: { id: string; name: string; color: string };
   assignees?: { user: { user_id: string; first_name: string; last_name: string } }[];
   buildings?: { building: { id: string; name: string } }[];
   todo?: { task_number: number; title: string; priority: string; status: string };
 }
 
 export interface CalendarItem {
   type: 'event' | 'todo';
   id: string;
   title: string;
   start: Date;
   end: Date | null;
   isAllDay: boolean;
   color: string;
   priority?: string;
   status?: string;
   categoryName?: string;
   assignees?: string[];
   buildings?: string[];
   todoId?: string;
   eventId?: string;
   taskNumber?: number;
 }
 
 export interface CreateEventInput {
   title: string;
   description?: string;
   start_datetime: string;
   end_datetime?: string;
   is_all_day?: boolean;
   todo_id?: string;
   category_id?: string;
   color?: string;
   assignees?: string[];
   building_ids?: string[];
   is_recurring?: boolean;
   recurrence_pattern?: 'daily' | 'weekly' | 'monthly' | 'yearly';
   recurrence_interval?: number;
   recurrence_end_date?: string;
 }
 
 // Fetch calendar events for a date range
 export function useCalendarEvents(startDate: Date, endDate: Date) {
   return useQuery({
     queryKey: ['calendar-events', format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('calendar_events')
         .select(`
           *,
           category:todo_categories(id, name, color),
           assignees:calendar_event_assignees(user:profiles(user_id, first_name, last_name)),
           buildings:calendar_event_buildings(building:buildings(id, name)),
           todo:todos(task_number, title, priority, status)
         `)
         .gte('start_datetime', startDate.toISOString())
         .lte('start_datetime', endDate.toISOString())
         .order('start_datetime', { ascending: true });
 
       if (error) throw error;
       return data as CalendarEvent[];
     },
   });
 }
 
 // Fetch todos that should appear in calendar
export function useCalendarTodos(startDate: Date, endDate: Date) {
  return useQuery({
    queryKey: ['calendar-todos', format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      // Calendar shows ALL tasks (including maintenance tasks regardless of show_in_list_date)
      const { data, error } = await supabase
        .from('todos')
        .select(`
          *,
          category:todo_categories(id, name, color),
          assignees:todo_assignees(user:profiles(user_id, first_name, last_name)),
          buildings:todo_buildings(building:buildings(id, name))
        `)
        .gte('due_date', format(startDate, 'yyyy-MM-dd'))
        .lte('due_date', format(endDate, 'yyyy-MM-dd'))
        .neq('status', 'done');

      if (error) throw error;
      return data;
    },
  });
}
 
 // Merge events and todos into unified calendar items
 export function useCalendarItems(currentDate: Date, view: 'month' | 'week' | 'day') {
   let startDate: Date;
   let endDate: Date;
   
   if (view === 'month') {
     startDate = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
     endDate = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
   } else if (view === 'week') {
     startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
     endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
   } else {
     startDate = new Date(currentDate);
     startDate.setHours(0, 0, 0, 0);
     endDate = new Date(currentDate);
     endDate.setHours(23, 59, 59, 999);
   }
   
   const { data: events = [], isLoading: eventsLoading } = useCalendarEvents(startDate, endDate);
   const { data: todos = [], isLoading: todosLoading } = useCalendarTodos(startDate, endDate);
   
   const items: CalendarItem[] = [];
   
   // Priority colors
   const priorityColors: Record<string, string> = {
     low: '#22C55E',
     medium: '#F97316',
     high: '#EF4444',
     urgent: '#991B1B',
   };
   
   // Add events
   events.forEach(event => {
     items.push({
       type: 'event',
       id: event.id,
       eventId: event.id,
       title: event.title,
       start: new Date(event.start_datetime),
       end: event.end_datetime ? new Date(event.end_datetime) : null,
       isAllDay: event.is_all_day,
       color: event.color || event.category?.color || '#6366F1',
       categoryName: event.category?.name,
       assignees: event.assignees?.map(a => `${a.user?.first_name} ${a.user?.last_name}`.trim()),
       buildings: event.buildings?.map(b => b.building?.name).filter(Boolean) as string[],
       todoId: event.todo_id || undefined,
       taskNumber: event.todo?.task_number,
     });
   });
   
   // Add todos with due dates
   todos.forEach(todo => {
     const dueDate = new Date(todo.due_date);
     if (todo.calendar_start_time) {
       const [hours, minutes] = todo.calendar_start_time.split(':');
       dueDate.setHours(parseInt(hours), parseInt(minutes));
     } else {
       dueDate.setHours(9, 0, 0, 0); // Default to 9 AM
     }
     
     let endTime = null;
     if (todo.calendar_end_time) {
       endTime = new Date(todo.due_date);
       const [hours, minutes] = todo.calendar_end_time.split(':');
       endTime.setHours(parseInt(hours), parseInt(minutes));
     }
     
     items.push({
       type: 'todo',
       id: todo.id,
       todoId: todo.id,
       title: todo.title,
       start: dueDate,
       end: endTime,
       isAllDay: !todo.calendar_start_time,
       color: priorityColors[todo.priority] || '#6366F1',
       priority: todo.priority,
       status: todo.status,
       categoryName: todo.category?.name,
       assignees: todo.assignees?.map((a: any) => `${a.user?.first_name} ${a.user?.last_name}`.trim()),
       buildings: todo.buildings?.map((b: any) => b.building?.name).filter(Boolean),
       taskNumber: todo.task_number,
     });
   });
   
   return {
     items: items.sort((a, b) => a.start.getTime() - b.start.getTime()),
     isLoading: eventsLoading || todosLoading,
   };
 }
 
 // Create event mutation
 export function useCreateCalendarEvent() {
   const queryClient = useQueryClient();
   const { user } = useAuth();
 
   return useMutation({
     mutationFn: async (input: CreateEventInput) => {
       const { assignees, building_ids, ...eventData } = input;
       
       const { data: event, error } = await supabase
         .from('calendar_events')
         .insert({
           ...eventData,
           created_by: user?.id,
         })
         .select()
         .single();
 
       if (error) throw error;
 
       // Create assignees
       if (assignees && assignees.length > 0 && event) {
         const assigneeInserts = assignees.map(userId => ({
           event_id: event.id,
           user_id: userId,
         }));
         await supabase.from('calendar_event_assignees').insert(assigneeInserts);
       }
 
       // Create building associations
       if (building_ids && building_ids.length > 0 && event) {
         const buildingInserts = building_ids.map(buildingId => ({
           event_id: event.id,
           building_id: buildingId,
         }));
         await supabase.from('calendar_event_buildings').insert(buildingInserts);
       }
 
       return event;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
       toast({ title: 'Termin erstellt', description: 'Der Termin wurde erfolgreich erstellt.' });
     },
     onError: (error: Error) => {
       toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
     },
   });
 }
 
 // Update event mutation
 export function useUpdateCalendarEvent() {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async (input: { id: string; title?: string; description?: string | null; start_datetime?: string; end_datetime?: string; is_all_day?: boolean; category_id?: string; color?: string; assignees?: string[]; building_ids?: string[] }) => {
       const { id, assignees, building_ids, ...updates } = input;
       
       // Only update if there are actual field updates
       if (Object.keys(updates).length > 0) {
         const { error } = await supabase
           .from('calendar_events')
           .update(updates)
           .eq('id', id);
 
         if (error) throw error;
       }
 
       // Update assignees
       if (assignees !== undefined) {
         await supabase.from('calendar_event_assignees').delete().eq('event_id', id);
         if (assignees.length > 0) {
           const assigneeInserts = assignees.map((userId: string) => ({
             event_id: id,
             user_id: userId,
           }));
           await supabase.from('calendar_event_assignees').insert(assigneeInserts);
         }
       }
 
       // Update buildings
       if (building_ids !== undefined) {
         await supabase.from('calendar_event_buildings').delete().eq('event_id', id);
         if (building_ids.length > 0) {
           const buildingInserts = building_ids.map((buildingId: string) => ({
             event_id: id,
             building_id: buildingId,
           }));
           await supabase.from('calendar_event_buildings').insert(buildingInserts);
         }
       }
 
       return { id };
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
       toast({ title: 'Termin aktualisiert' });
     },
     onError: (error: Error) => {
       toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
     },
   });
 }
 
 // Delete event mutation
 export function useDeleteCalendarEvent() {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async (id: string) => {
       const { error } = await supabase.from('calendar_events').delete().eq('id', id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
       toast({ title: 'Termin gelöscht' });
     },
     onError: (error: Error) => {
       toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
     },
   });
 }
 
 // Update event time (for drag & drop)
 export function useMoveCalendarEvent() {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async ({ id, start_datetime, end_datetime }: { id: string; start_datetime: string; end_datetime?: string }) => {
       const { data, error } = await supabase
         .from('calendar_events')
         .update({ start_datetime, end_datetime })
         .eq('id', id)
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
     },
     onError: (error: Error) => {
       toast({ title: 'Fehler beim Verschieben', description: error.message, variant: 'destructive' });
     },
   });
 }