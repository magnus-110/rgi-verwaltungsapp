import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, Users, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Meeting {
  id: string;
  title: string;
  meeting_date: string;
  location: string | null;
  status: string;
  buildings: {
    id: string;
    name: string;
    address: string;
  };
}

interface MeetingListProps {
  meetings: Meeting[];
  isLoading: boolean;
  onSelect: (id: string) => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  published: { label: "Freigeschaltet", variant: "default" },
  invited: { label: "Eingeladen", variant: "default" },
  in_progress: { label: "Laufend", variant: "destructive" },
  completed: { label: "Abgeschlossen", variant: "outline" },
  cancelled: { label: "Abgesagt", variant: "destructive" },
};

export const MeetingList = ({ meetings, isLoading, onSelect }: MeetingListProps) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">
            Keine Versammlungen
          </h3>
          <p className="text-sm text-muted-foreground">
            Erstellen Sie Ihre erste Eigentümerversammlung über den Button oben.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => {
        const status = statusConfig[meeting.status] || statusConfig.draft;
        return (
          <Card
            key={meeting.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onSelect(meeting.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate">
                      {meeting.title}
                    </h3>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {meeting.buildings.name} — {meeting.buildings.address}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(meeting.meeting_date), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}
                    </span>
                    {meeting.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {meeting.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
