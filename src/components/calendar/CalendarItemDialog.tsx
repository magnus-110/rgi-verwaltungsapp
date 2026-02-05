import { useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ExternalLink, Calendar as CalendarIcon, Clock, Tag, FileText, Edit, ChevronDown, ChevronUp, Users, Building, CheckSquare, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TodoDialog } from '@/components/todos/TodoDialog';
import { useTodo } from '@/hooks/useTodos';

// Unified calendar item type
export interface CalendarItem {
  id: string;
  title: string;
  type: 'event' | 'todo';
  startDate: Date;
  endDate?: Date;
  isAllDay?: boolean;
  description?: string;
  categoryName?: string;
  categoryColor?: string;
  status?: string;
  priority?: string;
}

interface CalendarItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CalendarItem | null;
  onEditEvent?: () => void;
}

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

export function CalendarItemDialog({ open, onOpenChange, item, onEditEvent }: CalendarItemDialogProps) {
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [todoDialogOpen, setTodoDialogOpen] = useState(false);
  
  // Fetch full todo details when viewing a todo
  const { data: fullTodo } = useTodo(item?.type === 'todo' ? item.id : '');
  
  // Fetch full event details when viewing an event
  const { data: fullEvent } = useQuery({
    queryKey: ['calendar-event-details', item?.id],
    queryFn: async () => {
      if (!item || item.type !== 'event') return null;
      const { data, error } = await supabase
        .from('calendar_events')
        .select(`
          *,
          category:todo_categories(id, name, color),
          assignees:calendar_event_assignees(user:profiles(user_id, first_name, last_name)),
          buildings:calendar_event_buildings(building:buildings(id, name))
        `)
        .eq('id', item.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!item && item.type === 'event' && open,
  });
  
  if (!item) return null;

  const handleGoogleExport = () => {
    const description = item.type === 'todo' ? fullTodo?.description : fullEvent?.description;
    const googleUrl = generateGoogleCalendarUrl(
      item.title,
      item.startDate,
      item.endDate,
      description || item.description,
      item.isAllDay
    );
    window.open(googleUrl, '_blank');
    toast.success('Google Kalender wird geöffnet...');
  };

  const handleEditClick = () => {
    if (item.type === 'event' && onEditEvent) {
      onOpenChange(false);
      onEditEvent();
    } else if (item.type === 'todo') {
      // Open TodoDialog directly
      setTodoDialogOpen(true);
    }
  };

  const handleTodoDialogClose = (isOpen: boolean) => {
    setTodoDialogOpen(isOpen);
    if (!isOpen) {
      onOpenChange(false);
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'open': return 'Offen';
      case 'in_progress': return 'In Bearbeitung';
      case 'done': return 'Erledigt';
      default: return status;
    }
  };

  const getPriorityLabel = (priority?: string) => {
    switch (priority) {
      case 'low': return 'Niedrig';
      case 'medium': return 'Mittel';
      case 'high': return 'Hoch';
      case 'urgent': return 'Dringend';
      default: return priority;
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'low': return 'bg-green-500/10 text-green-600 border-green-200';
      case 'medium': return 'bg-orange-500/10 text-orange-600 border-orange-200';
      case 'high': return 'bg-red-500/10 text-red-600 border-red-200';
      case 'urgent': return 'bg-red-700/10 text-red-700 border-red-300';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Get detailed data
  const todoData = item.type === 'todo' ? fullTodo : null;
  const eventData = item.type === 'event' ? fullEvent : null;
  
  const assignees = item.type === 'todo' 
    ? todoData?.assignees?.map(a => `${a.user?.first_name} ${a.user?.last_name}`.trim()).filter(Boolean)
    : eventData?.assignees?.map((a: any) => `${a.user?.first_name} ${a.user?.last_name}`.trim()).filter(Boolean);
    
  const buildings = item.type === 'todo'
    ? todoData?.buildings?.map(b => b.building?.name).filter(Boolean)
    : eventData?.buildings?.map((b: any) => b.building?.name).filter(Boolean);
    
  const subtasks = todoData?.subtasks || [];
  const completedSubtasks = subtasks.filter(s => s.is_completed).length;
  const attachments = todoData?.attachments || [];
  const comments = todoData?.comments || [];
  const description = item.type === 'todo' ? todoData?.description : eventData?.description;

  return (
    <>
      <Dialog open={open && !todoDialogOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={item.type === 'event' ? 'bg-primary/10 text-primary' : 'bg-secondary/50'}>
                {item.type === 'event' ? 'Termin' : 'Aufgabe'}
              </Badge>
              {item.status && (
                <Badge variant="outline" className="bg-muted">
                  {getStatusLabel(item.status)}
                </Badge>
              )}
            </div>
            <DialogTitle className="text-xl mt-2">{item.title}</DialogTitle>
            <DialogDescription className="sr-only">
              Details zu {item.type === 'event' ? 'Termin' : 'Aufgabe'}: {item.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Date and Time */}
            <div className="flex items-start gap-3">
              <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">
                  {format(item.startDate, 'EEEE, d. MMMM yyyy', { locale: de })}
                </p>
                {!item.isAllDay && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {format(item.startDate, 'HH:mm', { locale: de })}
                    {item.endDate && ` – ${format(item.endDate, 'HH:mm', { locale: de })}`}
                  </p>
                )}
                {item.isAllDay && (
                  <p className="text-sm text-muted-foreground">Ganztägig</p>
                )}
              </div>
            </div>

            {/* Category */}
            {(item.categoryName || todoData?.category?.name || eventData?.category?.name) && (
              <div className="flex items-center gap-3">
                <Tag className="h-5 w-5 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.categoryColor || todoData?.category?.color || eventData?.category?.color }}
                  />
                  <span>{item.categoryName || todoData?.category?.name || eventData?.category?.name}</span>
                </div>
              </div>
            )}

            {/* Priority (for todos) */}
            {item.type === 'todo' && item.priority && (
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 flex items-center justify-center">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    item.priority === 'low' ? 'bg-green-500' :
                    item.priority === 'medium' ? 'bg-orange-500' :
                    item.priority === 'high' ? 'bg-red-500' :
                    'bg-red-700'
                  }`} />
                </div>
                <Badge variant="outline" className={getPriorityColor(item.priority)}>
                  {getPriorityLabel(item.priority)}
                </Badge>
              </div>
            )}

            {/* Description (short preview) */}
            {description && !showMoreDetails && (
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {description}
                </p>
              </div>
            )}

            {/* More Details - Expandable */}
            <Collapsible open={showMoreDetails} onOpenChange={setShowMoreDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
                  <span>{showMoreDetails ? 'Weniger anzeigen' : 'Mehr anzeigen'}</span>
                  {showMoreDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                {/* Full Description */}
                {description && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {description}
                    </p>
                  </div>
                )}

                {/* Assignees */}
                {assignees && assignees.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Verantwortliche</p>
                      <p className="text-sm text-muted-foreground">
                        {assignees.join(', ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Buildings */}
                {buildings && buildings.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Gebäude</p>
                      <p className="text-sm text-muted-foreground">
                        {buildings.join(', ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Subtasks (for todos) */}
                {item.type === 'todo' && subtasks.length > 0 && (
                  <div className="flex items-start gap-3">
                    <CheckSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Checkliste ({completedSubtasks}/{subtasks.length})
                      </p>
                      <div className="mt-1 space-y-1">
                        {subtasks.slice(0, 5).map(subtask => (
                          <div key={subtask.id} className="flex items-center gap-2 text-sm">
                            <div className={`w-3 h-3 rounded border ${subtask.is_completed ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                              {subtask.is_completed && (
                                <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12">
                                  <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" />
                                </svg>
                              )}
                            </div>
                            <span className={subtask.is_completed ? 'line-through text-muted-foreground' : ''}>
                              {subtask.title}
                            </span>
                          </div>
                        ))}
                        {subtasks.length > 5 && (
                          <p className="text-xs text-muted-foreground">
                            +{subtasks.length - 5} weitere
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Attachments (for todos) */}
                {item.type === 'todo' && attachments.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Paperclip className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Anhänge ({attachments.length})</p>
                      <div className="mt-1 space-y-1">
                        {attachments.slice(0, 3).map((attachment: any, index: number) => (
                          <p key={index} className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {attachment.name}
                          </p>
                        ))}
                        {attachments.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{attachments.length - 3} weitere
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Comments count (for todos) */}
                {item.type === 'todo' && comments.length > 0 && (
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {comments.length} Kommentar{comments.length !== 1 ? 'e' : ''}
                    </p>
                  </div>
                )}

                {/* Task number (for todos) */}
                {item.type === 'todo' && todoData?.task_number && (
                  <div className="text-xs text-muted-foreground">
                    Aufgabe #{todoData.task_number}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={handleGoogleExport}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Google Kalender
            </Button>
            <div className="flex-1" />
            <Button onClick={handleEditClick} className="gap-2">
              <Edit className="h-4 w-4" />
              Bearbeiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TodoDialog for editing todos directly */}
      {item.type === 'todo' && (
        <TodoDialog
          open={todoDialogOpen}
          onOpenChange={handleTodoDialogClose}
          todo={fullTodo}
          mode="edit"
        />
      )}
    </>
  );
}
