import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, BarChart3, Vote } from "lucide-react";

interface OwnerLiveDashboardProps {
  meetingId: string;
  agendaItems: any[];
}

export const OwnerLiveDashboard = ({ meetingId, agendaItems }: OwnerLiveDashboardProps) => {
  const queryClient = useQueryClient();

  const activeItem = agendaItems.find((i: any) => i.status === "voting");
  const votedItems = agendaItems.filter((i: any) => i.status === "voted" || i.status === "closed");

  // Load meeting for secret ballot flag
  const { data: meetingData } = useQuery({
    queryKey: ["owner-live-meeting", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("is_secret_ballot")
        .eq("id", meetingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const isSecretBallot = (meetingData as any)?.is_secret_ballot ?? true;

  // Load attendees for quorum
  const { data: attendees = [] } = useQuery({
    queryKey: ["owner-live-attendees", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_attendees")
        .select("id, attendance_type, checked_in_at")
        .eq("meeting_id", meetingId);
      if (error) throw error;
      return data || [];
    },
  });

  // Load live votes for active item (with contact info for public ballots)
  const { data: liveVotes = [] } = useQuery({
    queryKey: ["owner-live-votes", activeItem?.id],
    queryFn: async () => {
      if (!activeItem) return [];
      const { data, error } = await supabase
        .from("etv_votes")
        .select("vote, assignment_id, contact_building_assignments:assignment_id(unit_number, contacts:contact_id(first_name, last_name, company_name))")
        .eq("agenda_item_id", activeItem.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeItem,
  });

  // Realtime for agenda items, votes & meeting
  useEffect(() => {
    const channels = [
      supabase
        .channel(`owner-dash-items-${meetingId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "etv_agenda_items", filter: `meeting_id=eq.${meetingId}` }, () => {
          queryClient.invalidateQueries({ queryKey: ["weg-owner-agenda", meetingId] });
        })
        .subscribe(),
      supabase
        .channel(`owner-dash-meeting-${meetingId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "etv_meetings", filter: `id=eq.${meetingId}` }, () => {
          queryClient.invalidateQueries({ queryKey: ["owner-live-meeting", meetingId] });
        })
        .subscribe(),
    ];
    if (activeItem) {
      channels.push(
        supabase
          .channel(`owner-dash-votes-${activeItem.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "etv_votes", filter: `agenda_item_id=eq.${activeItem.id}` }, () => {
            queryClient.invalidateQueries({ queryKey: ["owner-live-votes", activeItem.id] });
          })
          .subscribe()
      );
    }
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [meetingId, activeItem?.id, queryClient]);

  const presentCount = attendees.filter(
    (a: any) => a.attendance_type === "present" || (a.attendance_type === "proxy" && a.checked_in_at)
  ).length;
  const totalCount = attendees.length;

  const yesCount = liveVotes.filter((v: any) => v.vote === "yes").length;
  const noCount = liveVotes.filter((v: any) => v.vote === "no").length;
  const abstainCount = liveVotes.filter((v: any) => v.vote === "abstain").length;

  const getContactName = (contact: any) => {
    if (!contact) return "Unbekannt";
    if (contact.company_name) return contact.company_name;
    return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Live-Dashboard</h3>
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {presentCount}/{totalCount} anwesend
          </div>
        </div>

        {activeItem ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
                <Vote className="h-3 w-3 mr-1" />
                Abstimmung läuft
              </Badge>
              <span className="text-sm font-medium truncate">{activeItem.title}</span>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-semibold">Ja: {yesCount}</span>
              <span className="text-red-600 font-semibold">Nein: {noCount}</span>
              <span className="text-muted-foreground font-medium">Enth.: {abstainCount}</span>
            </div>

            {/* Public ballot: show individual votes */}
            {!isSecretBallot && liveVotes.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">Einzelstimmen:</p>
                {liveVotes.map((v: any, i: number) => {
                  const cba = v.contact_building_assignments;
                  const contact = cba?.contacts;
                  return (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <div className="flex items-center gap-1.5">
                        <span>{getContactName(contact)}</span>
                        {cba?.unit_number && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">E{cba.unit_number}</Badge>
                        )}
                      </div>
                      <span className={
                        v.vote === "yes" ? "text-green-600 font-semibold" :
                        v.vote === "no" ? "text-red-600 font-semibold" :
                        "text-muted-foreground"
                      }>
                        {v.vote === "yes" ? "Ja" : v.vote === "no" ? "Nein" : "Enthaltung"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : votedItems.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {votedItems.length} TOP(s) abgestimmt — keine aktive Abstimmung
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Noch keine Abstimmung gestartet</p>
        )}
      </CardContent>
    </Card>
  );
};
