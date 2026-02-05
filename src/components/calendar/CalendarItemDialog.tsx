import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Calendar as CalendarIcon, Clock, Tag, FileText, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  
  if (!item) return null;

  const handleGoogleExport = () => {
    const googleUrl = generateGoogleCalendarUrl(
      item.title,
      item.startDate,
      item.endDate,
      item.description,
      item.isAllDay
    );
    window.open(googleUrl, '_blank');
    toast.success('Google Kalender wird geöffnet...');
  };

  const handleEditClick = () => {
    if (item.type === 'event' && onEditEvent) {
      onEditEvent();
    } else if (item.type === 'todo') {
      // Navigate to todos page with the todo ID
      navigate(`/todos?edit=${item.id}`);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          {item.categoryName && (
            <div className="flex items-center gap-3">
              <Tag className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center gap-2">
                {item.categoryColor && (
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.categoryColor }}
                  />
                )}
                <span>{item.categoryName}</span>
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

          {/* Description */}
          {item.description && (
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {item.description}
              </p>
            </div>
          )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          <Button onClick={handleEditClick} className="gap-2">
            <Edit className="h-4 w-4" />
            Bearbeiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
