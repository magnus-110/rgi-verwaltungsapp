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
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
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

    // Proxy-received units
    const { data: proxiedAttendees } = await supabase
      .from("etv_attendees")
      .select("id, assignment_id, attendance_type")
      .eq("meeting_id", meeting.id)
      .eq("proxy_contact_id", contact.id)
      .eq("attendance_type", "proxy");

    if (proxiedAttendees) {
      for (const pa of proxiedAttendees) {
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
    setCurrentUnitIndex(0);
    setSelectedVote(null);
    setAllDone(false);
    setDescOpen(false);
  }, [profile?.user_id]);

  // Initial load
  useEffect(() => {
    if (!profile?.user_id || profile?.role !== "weg_owner") return;
    const checkActiveVotes = async () => {
      const { data: activeItems } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("status", "voting");
      if (activeItems && activeItems.length > 0) {
        await checkVotingForItem(activeItems[0]);
      }
    };
    checkActiveVotes();
  }, [profile?.user_id, profile?.role, checkVotingForItem]);

  // Realtime
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
    return () => { supabase.removeChannel(channel); };
  }, [profile?.user_id, profile?.role, checkVotingForItem, votingItem?.id]);

  const castVoteMutation = useMutation({
    mutationFn: async (vote: string) => {
      const assignment = myVotingAssignments[currentUnitIndex];
      if (!votingItem || !assignment) throw new Error("Missing data");

      const { error } = await supabase.from("etv_votes").upsert(
        {
          agenda_item_id: votingItem.id,
          assignment_id: assignment.id,
          vote,
          mea_weight: assignment.mea_weight,
          voted_at: new Date().toISOString(),
        },
        { onConflict: "agenda_item_id,assignment_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      const nextIndex = currentUnitIndex + 1;
      if (nextIndex < myVotingAssignments.length) {
        setCurrentUnitIndex(nextIndex);
        setSelectedVote(null);
      } else {
        setAllDone(true);
        setTimeout(() => {
          setVotingItem(null);
          setMyVotingAssignments([]);
          setAllDone(false);
          setCurrentUnitIndex(0);
          setSelectedVote(null);
        }, 2000);
      }
    },
  });

  if (!votingItem || profile?.role !== "weg_owner") return null;

  const currentAssignment = myVotingAssignments[currentUnitIndex];
  const totalUnits = myVotingAssignments.length;

  const voteButtons = [
    { value: "yes", label: "Ja", icon: CheckCircle2, className: "bg-green-600 hover:bg-green-700 text-white" },
    { value: "no", label: "Nein", icon: XCircle, className: "bg-red-600 hover:bg-red-700 text-white" },
    { value: "abstain", label: "Enthaltung", icon: MinusCircle, className: "" },
  ];

  return (
    <Dialog open={!!votingItem} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg w-[95vw]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Vote className="h-6 w-6 text-primary" />
            Abstimmung
          </DialogTitle>
        </DialogHeader>

        {allDone ? (
          <div className="py-10 text-center space-y-3">
            <CheckCircle2 className="h-20 w-20 text-green-500 mx-auto" />
            <p className="text-xl font-semibold">Alle Stimmen abgegeben!</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Progress indicator */}
            {totalUnits > 1 && (
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  Einheit {currentUnitIndex + 1} von {totalUnits}
                </Badge>
                <div className="flex gap-1.5">
                  {Array.from({ length: totalUnits }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full transition-colors ${
                        i < currentUnitIndex ? "bg-green-500" :
                        i === currentUnitIndex ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Unit label */}
            {currentAssignment?.unit_number && (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-base px-4 py-1.5">
                Einheit {currentAssignment.unit_number}
              </Badge>
            )}

            {/* TOP info */}
            <div>
              <p className="text-sm text-muted-foreground mb-1">Tagesordnungspunkt</p>
              <p className="font-semibold text-lg">{votingItem.title}</p>
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

            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Abstimmung läuft
            </Badge>

            {/* Vote selection buttons */}
            <div className="grid grid-cols-3 gap-3">
              {voteButtons.map(({ value, label, icon: Icon, className }) => (
                <Button
                  key={value}
                  size="lg"
                  variant={value === "abstain" ? "outline" : "default"}
                  className={`h-20 flex-col gap-1.5 text-base transition-all ${
                    value !== "abstain" ? className : ""
                  } ${
                    selectedVote === value
                      ? "ring-4 ring-primary ring-offset-2 scale-105"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  onClick={() => setSelectedVote(value)}
                  disabled={castVoteMutation.isPending}
                >
                  <Icon className="h-7 w-7" />
                  <span>{label}</span>
                </Button>
              ))}
            </div>

            {/* Confirm button */}
            {selectedVote && (
              <Button
                size="lg"
                className="w-full h-14 text-lg font-semibold"
                onClick={() => castVoteMutation.mutate(selectedVote)}
                disabled={castVoteMutation.isPending}
              >
                {castVoteMutation.isPending ? "Wird gespeichert…" : "Stimme bestätigen"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
