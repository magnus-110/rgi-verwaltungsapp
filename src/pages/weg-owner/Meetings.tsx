import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, FileText } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const statusLabels: Record<string, string> = {
  draft: "Entwurf",
  invited: "Eingeladen",
  in_progress: "Laufend",
  completed: "Abgeschlossen",
  cancelled: "Abgesagt",
};

export const WegOwnerMeetings = () => {
  const { profile } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ["weg-owner-meetings", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("*, buildings(name, address)")
        .in("status", ["invited", "in_progress", "completed"])
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.user_id,
  });

  const { data: agendaItems = [] } = useQuery({
    queryKey: ["weg-owner-agenda", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("meeting_id", selectedId)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const selectedMeeting = meetings.find((m: any) => m.id === selectedId);

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Versammlungen</h1>
        <p className="text-muted-foreground">Ihre Eigentümerversammlungen im Überblick</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Keine anstehenden Versammlungen.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting: any) => {
            const building = meeting.buildings;
            return (
              <Card
                key={meeting.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedId(meeting.id)}
              >
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{meeting.title}</h3>
                    <Badge variant="secondary">{statusLabels[meeting.status] || meeting.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{building?.name} — {building?.address}</p>
                  <div className="flex gap-4 text-xs text-muted-foreground">
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail-Dialog */}
      <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedMeeting?.title}</DialogTitle>
          </DialogHeader>
          {selectedMeeting && (
            <div className="space-y-4">
              <div className="text-sm space-y-1 text-muted-foreground">
                <p><strong>Datum:</strong> {format(new Date(selectedMeeting.meeting_date), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}</p>
                {selectedMeeting.location && <p><strong>Ort:</strong> {selectedMeeting.location}</p>}
              </div>
              <h3 className="font-semibold text-foreground">Tagesordnung</h3>
              {agendaItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Tagesordnungspunkte.</p>
              ) : (
                <div className="space-y-3">
                  {agendaItems.map((item: any, idx: number) => (
                    <Card key={item.id}>
                      <CardContent className="p-3">
                        <p className="font-medium text-sm">
                          <span className="text-primary font-bold">TOP {idx + 1}</span> {item.title}
                        </p>
                        {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                        {item.resolution_text && (
                          <div className="mt-2 p-2 bg-muted rounded text-xs italic">{item.resolution_text}</div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
