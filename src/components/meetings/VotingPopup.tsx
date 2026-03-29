import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, XCircle, MinusCircle, Vote, ChevronDown } from "lucide-react";

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
  const [descOpen, setDescOpen] = useState(false);

  const checkVotingForItem = useCallback(async (agendaItem: any) => {
    if (!profile?.user_id) return;

    const { data: meeting } = await supabase
      .from("etv_meetings")
      .select("id, building_id")
      .eq("id", agendaItem.meeting_id)
      .single();
    if (!meeting) return;

    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", profile.user_id!)
      .maybeSingle();
    if (!contact) return;

    // 1. Get user's OWN assignments in this building
    const { data: assignments } = await supabase
      .from("contact_building_assignments")
      .select("id, unit_number, contact_building_shares(share_type, share_value)")
      .eq("contact_id", contact.id)
      .eq("building_id", meeting.building_id)
      .eq("is_active", true);

    const validAssignments: VotingAssignment[] = [];

    if (assignments) {
      for (const assignment of assignments) {
        const { data: attendee } = await supabase
          .from("etv_attendees")
          .select("id, attendance_type")
          .eq("meeting_id", meeting.id)
          .eq("assignment_id", assignment.id)
          .maybeSingle();
        // Skip if no attendee or if they GAVE their proxy away
        if (!attendee || attendee.attendance_type === "proxy") continue;

        const { data: existingVote } = await supabase
          .from("etv_votes")
          .select("id")
          .eq("agenda_item_id", agendaItem.id)
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
    }

    // 2. Get units where this user is the PROXY HOLDER (received proxy)
    const { data: proxiedAttendees } = await supabase
      .from("etv_attendees")
      .select("id, assignment_id, attendance_type")
      .eq("meeting_id", meeting.id)
      .eq("proxy_contact_id", contact.id)
      .eq("attendance_type", "proxy");

    if (proxiedAttendees) {
      for (const pa of proxiedAttendees) {
        // Skip if already in validAssignments (own unit)
        if (validAssignments.some(a => a.id === pa.assignment_id)) continue;

        const { data: existingVote } = await supabase
          .from("etv_votes")
          .select("id")
          .eq("agenda_item_id", agendaItem.id)
          .eq("assignment_id", pa.assignment_id)
          .maybeSingle();
        if (existingVote) continue;

        const { data: assignment } = await supabase
          .from("contact_building_assignments")
          .select("id, unit_number, contact_building_shares(share_type, share_value)")
          .eq("id", pa.assignment_id)
          .single();
        if (!assignment) continue;

        const meaShare = (assignment as any).contact_building_shares?.find(
          (s: any) => s.share_type === "mea"
        );
        validAssignments.push({
          id: assignment.id,
          unit_number: assignment.unit_number,
          attendee_id: pa.id,
          mea_weight: meaShare?.share_value || 0,
        });
      }
    }

    if (validAssignments.length === 0) return;

    setMyVotingAssignments(validAssignments);
    setVotingItem(agendaItem);
    setHasVoted(false);
    setDescOpen(false);
  }, [profile?.user_id]);

  // Initial load: check if there's an active vote right now
  useEffect(() => {
    if (!profile?.user_id || profile?.role !== "weg_owner") return;

    const checkActiveVotes = async () => {
      const { data: activeItems } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("status", "voting");

      if (activeItems && activeItems.length > 0) {
        // Check the first active voting item
        await checkVotingForItem(activeItems[0]);
      }
    };

    checkActiveVotes();
  }, [profile?.user_id, profile?.role, checkVotingForItem]);

  // Realtime listener for voting status changes
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
            await checkVotingForItem(newItem);
          } else if (
            payload.old &&
            (payload.old as any).status === "voting" &&
            newItem.status !== "voting"
          ) {
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
  }, [profile?.user_id, profile?.role, checkVotingForItem, votingItem?.id]);

  const castVoteMutation = useMutation({
    mutationFn: async (vote: string) => {
      if (!votingItem || myVotingAssignments.length === 0) throw new Error("Missing data");

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

            {votingItem.description && (
              <Collapsible open={descOpen} onOpenChange={setDescOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <ChevronDown className={`h-4 w-4 transition-transform ${descOpen ? "rotate-180" : ""}`} />
                  Beschreibung anzeigen
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="text-sm bg-muted rounded-lg p-3 mt-2">{votingItem.description}</p>
                </CollapsibleContent>
              </Collapsible>
            )}

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
