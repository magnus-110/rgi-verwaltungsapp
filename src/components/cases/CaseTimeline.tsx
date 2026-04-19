import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { StickyNote, Mail, FileText, Image as ImageIcon, CheckSquare, Banknote, Users as MeetingIcon, Phone, ArrowRightLeft, Sparkles, Paperclip, Pencil, Trash2, Check, X, Loader2, Download, ExternalLink } from "lucide-react";
import { CaseEvent, CaseEventType, useUpdateCaseEvent, useDeleteCaseEvent } from "@/hooks/useCases";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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

const downloadAttachment = async (path: string, _name: string, bucket: string = "building-files") => {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data) return;
  window.open(data.signedUrl, "_blank");
};

interface EventRowProps {
  event: CaseEvent;
}

const EventRow = ({ event }: EventRowProps) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title || "");
  const [body, setBody] = useState(event.body || "");
  const update = useUpdateCaseEvent();
  const del = useDeleteCaseEvent();
  const navigate = useNavigate();
  const Icon = ICONS[event.event_type] || StickyNote;

  const emailId =
    event.event_type === "email"
      ? (event.extracted_data as any)?.email_id || (event.source_table === "emails" ? event.source_id : null)
      : null;

  const save = async () => {
    await update.mutateAsync({ id: event.id, case_id: event.case_id, title: title || null, body: body || null });
    setEditing(false);
  };

  const cancel = () => {
    setTitle(event.title || "");
    setBody(event.body || "");
    setEditing(false);
  };

  return (
    <div className="relative pl-12 group">
      <div className={cn("absolute left-0 top-2 w-9 h-9 rounded-full flex items-center justify-center border-2 border-background", COLORS[event.event_type])}>
        <Icon className="h-4 w-4" />
      </div>
      <Card className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-medium text-muted-foreground">{LABEL[event.event_type]}</span>
            {!editing && event.title && <span className="text-sm font-medium truncate">{event.title}</span>}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {format(new Date(event.occurred_at), "dd.MM.yyyy HH:mm", { locale: de })}
          </span>
        </div>

        {editing ? (
          <div className="space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel (optional)" className="h-8 text-sm" />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="text-sm" />
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={cancel}><X className="h-3 w-3 mr-1" />Abbrechen</Button>
              <Button size="sm" onClick={save} disabled={update.isPending}>
                {update.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                Speichern
              </Button>
            </div>
          </div>
        ) : (
          <>
            {event.body && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{event.body}</p>}
            {Array.isArray(event.attachments) && event.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {event.attachments.map((a: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => a.path && downloadAttachment(a.path, a.name, a.bucket || "building-files")}
                    className="text-xs bg-muted hover:bg-muted/70 px-2 py-1 rounded inline-flex items-center gap-1 transition-colors"
                  >
                    <Paperclip className="h-3 w-3" />
                    {a.name || a.path?.split("/").pop() || "Datei"}
                    {a.path && <Download className="h-3 w-3 opacity-50" />}
                  </button>
                ))}
              </div>
            )}
            {emailId && (
              <div className="mt-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  title="Im Postfach öffnen"
                  onClick={() => navigate(`/postfach?email=${emailId}`)}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            )}
            {event.event_type !== "ai_summary" && (
              <div className="mt-2 flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
                      <AlertDialogDescription>Dieser Zeitstrahl-Eintrag wird unwiderruflich entfernt.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate({ id: event.id, case_id: event.case_id })}>
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
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
        {events.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
};
