import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatGermanDateTime } from "@/lib/germanDateTime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, Users, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("etv_meetings").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Versammlung gelöscht", description: deleteTarget.title });
      queryClient.invalidateQueries({ queryKey: ["etv-meetings"] });
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: "Löschen fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

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
    <>
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
                        {formatGermanDateTime(meeting.meeting_date)}
                      </span>
                      {meeting.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {meeting.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(meeting);
                    }}
                    aria-label="Versammlung löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Versammlung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleteTarget?.title}" wird unwiderruflich gelöscht – inklusive aller TOPs,
              Abstimmungen, Teilnehmer und Vollmachten dieser Versammlung.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Lösche..." : "Endgültig löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
