import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, MinusCircle, Vote } from "lucide-react";

interface VotingAssignment {
  id: string;
  unit_number: string | null;
  attendee_id: string;
  mea_weight: number;
}

export const VotingPopup = () => {
  const { profile } = useAuth();
  const [votingItem, setVotingItem] = useState<any>(null);
  const [myVotingAssignments, setMyVotingAssignments] = useState<VotingAssignment[]>([]);
  const [hasVoted, setHasVoted] = useState(false);

  // Listen for voting agenda items via realtime
  useEffect(() => {
    if (!profile?.user_id || profile?.role !== "weg_owner") return;

    const channel = supabase
      .channel("global-voting-popup")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "etv_agenda_items" },
        async (payload) => {
          const newItem = payload.new as any;
          if (newItem.status === "voting") {
            // Check if user is an attendee of this meeting
            const { data: meeting } = await supabase
              .from("etv_meetings")
              .select("id, building_id")
              .eq("id", newItem.meeting_id)
              .single();
            if (!meeting) return;

            const { data: contact } = await supabase
              .from("contacts")
              .select("id")
              .eq("user_id", profile.user_id!)
              .maybeSingle();
            if (!contact) return;

            // Get ALL assignments for this user in this building
            const { data: assignments } = await supabase
              .from("contact_building_assignments")
              .select("id, unit_number, contact_building_shares(share_type, share_value)")
              .eq("contact_id", contact.id)
              .eq("building_id", meeting.building_id)
              .eq("is_active", true);
            if (!assignments || assignments.length === 0) return;

            // For each assignment, check attendee status and existing votes
            const validAssignments: VotingAssignment[] = [];
            for (const assignment of assignments) {
              const { data: attendee } = await supabase
                .from("etv_attendees")
                .select("id, attendance_type")
                .eq("meeting_id", meeting.id)
                .eq("assignment_id", assignment.id)
                .maybeSingle();
              // Only include if attendee exists and hasn't given proxy
              if (!attendee || attendee.attendance_type === "proxy") continue;

              // Check if already voted
              const { data: existingVote } = await supabase
                .from("etv_votes")
                .select("id")
                .eq("agenda_item_id", newItem.id)
                .eq("assignment_id", assignment.id)
                .maybeSingle();
              if (existingVote) continue;

              const meaShare = (assignment as any).contact_building_shares?.find(
                (s: any) => s.share_type === "mea"
              );

              validAssignments.push({
                id: assignment.id,
                unit_number: assignment.unit_number,
                attendee_id: attendee.id,
                mea_weight: meaShare?.share_value || 0,
              });
            }

            if (validAssignments.length === 0) return;

            setMyVotingAssignments(validAssignments);
            setVotingItem(newItem);
            setHasVoted(false);
          } else if (
            payload.old &&
            (payload.old as any).status === "voting" &&
            newItem.status !== "voting"
          ) {
            // Voting closed for this item
            if (votingItem?.id === newItem.id) {
              setVotingItem(null);
              setMyVotingAssignments([]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.user_id, profile?.role]);

  const castVoteMutation = useMutation({
    mutationFn: async (vote: string) => {
      if (!votingItem || myVotingAssignments.length === 0) throw new Error("Missing data");
      
      // Insert a vote for each valid assignment
      const rows = myVotingAssignments.map(a => ({
        agenda_item_id: votingItem.id,
        assignment_id: a.id,
        vote,
        mea_weight: a.mea_weight,
        voted_at: new Date().toISOString(),
      }));

      for (const row of rows) {
        const { error } = await supabase.from("etv_votes").upsert(
          row,
          { onConflict: "agenda_item_id,assignment_id" }
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setHasVoted(true);
      setTimeout(() => {
        setVotingItem(null);
        setMyVotingAssignments([]);
        setHasVoted(false);
      }, 1500);
    },
  });

  if (!votingItem || profile?.role !== "weg_owner") return null;

  const unitLabels = myVotingAssignments
    .map(a => a.unit_number || "–")
    .join(", ");

  return (
    <Dialog open={!!votingItem} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Vote className="h-5 w-5 text-primary" />
            Abstimmung
          </DialogTitle>
        </DialogHeader>

        {hasVoted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <p className="text-lg font-semibold">Stimme abgegeben!</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Tagesordnungspunkt</p>
              <p className="font-semibold">{votingItem.title}</p>
            </div>

            {votingItem.resolution_text && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Beschlusstext</p>
                <p className="text-sm bg-muted rounded-lg p-3">{votingItem.resolution_text}</p>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                Abstimmung läuft
              </Badge>
              {myVotingAssignments.length > 1 && (
                <Badge variant="secondary">
                  {myVotingAssignments.length} Einheiten: {unitLabels}
                </Badge>
              )}
              {myVotingAssignments.length === 1 && myVotingAssignments[0].unit_number && (
                <Badge variant="secondary">
                  Einheit {myVotingAssignments[0].unit_number}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Button
                size="lg"
                className="h-16 flex-col gap-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => castVoteMutation.mutate("yes")}
                disabled={castVoteMutation.isPending}
              >
                <CheckCircle2 className="h-6 w-6" />
                <span className="text-sm">Ja</span>
              </Button>
              <Button
                size="lg"
                className="h-16 flex-col gap-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => castVoteMutation.mutate("no")}
                disabled={castVoteMutation.isPending}
              >
                <XCircle className="h-6 w-6" />
                <span className="text-sm">Nein</span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-16 flex-col gap-1"
                onClick={() => castVoteMutation.mutate("abstain")}
                disabled={castVoteMutation.isPending}
              >
                <MinusCircle className="h-6 w-6" />
                <span className="text-sm">Enthaltung</span>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
