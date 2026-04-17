import { format } from "date-fns";
import { de } from "date-fns/locale";
import { StickyNote, Mail, FileText, Image as ImageIcon, CheckSquare, Banknote, Users as MeetingIcon, Phone, ArrowRightLeft, Sparkles, Paperclip } from "lucide-react";
import { CaseEvent, CaseEventType } from "@/hooks/useCases";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ICONS: Record<CaseEventType, any> = {
  note: StickyNote,
  email: Mail,
  document: FileText,
  image: ImageIcon,
  todo: CheckSquare,
  booking: Banknote,
  meeting: MeetingIcon,
  phone: Phone,
  status_change: ArrowRightLeft,
  ai_summary: Sparkles,
  file: Paperclip,
};

const COLORS: Record<CaseEventType, string> = {
  note: "bg-muted text-foreground",
  email: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  document: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  image: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  todo: "bg-green-500/10 text-green-600 dark:text-green-400",
  booking: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  meeting: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  phone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  status_change: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  ai_summary: "bg-primary/10 text-primary",
  file: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

const LABEL: Record<CaseEventType, string> = {
  note: "Notiz",
  email: "E-Mail",
  document: "Dokument",
  image: "Bild",
  todo: "Aufgabe",
  booking: "Buchung",
  meeting: "Termin",
  phone: "Telefonat",
  status_change: "Statuswechsel",
  ai_summary: "KI-Zusammenfassung",
  file: "Datei",
};

interface CaseTimelineProps {
  events: CaseEvent[];
}

export const CaseTimeline = ({ events }: CaseTimelineProps) => {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Noch keine Ereignisse. Lege oben eine Notiz an oder hänge eine Datei an.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
      <div className="space-y-3">
        {events.map((e) => {
          const Icon = ICONS[e.event_type] || StickyNote;
          return (
            <div key={e.id} className="relative pl-12">
              <div className={cn("absolute left-0 top-2 w-9 h-9 rounded-full flex items-center justify-center border-2 border-background", COLORS[e.event_type])}>
                <Icon className="h-4 w-4" />
              </div>
              <Card className="p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground">{LABEL[e.event_type]}</span>
                    {e.title && <span className="text-sm font-medium truncate">{e.title}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(e.occurred_at), "dd.MM.yyyy HH:mm", { locale: de })}
                  </span>
                </div>
                {e.body && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{e.body}</p>}
                {Array.isArray(e.attachments) && e.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {e.attachments.map((a: any, i: number) => (
                      <span key={i} className="text-xs bg-muted px-2 py-1 rounded inline-flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {a.name || a.path?.split("/").pop() || "Datei"}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
};
