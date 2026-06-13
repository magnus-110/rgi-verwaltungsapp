import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, MinusCircle, Vote, ChevronDown } from "lucide-react";

interface VotingAssignment {
  id: string;
  unit_number: string | null;
  attendee_id: string;
  mea_weight: number;
}

export const VotingPopup = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [votingItem, setVotingItem] = useState<any>(null);
  const [myVotingAssignments, setMyVotingAssignments] = useState<VotingAssignment[]>([]);
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [isSecretBallot, setIsSecretBallot] = useState(true);
  const [resultDialog, setResultDialog] = useState<any>(null);

  // Live vote counts — active throughout the entire voting (not only after allDone)
  const { data: liveVotes = [] } = useQuery({
    queryKey: ["voting-popup-live-votes", votingItem?.id],
    queryFn: async () => {
      if (!votingItem) return [];
      const { data, error } = await supabase
        .from("etv_votes")
        .select("vote, assignment_id, mea_weight, contact_building_assignments:assignment_id(unit_number, contacts:contact_id(first_name, last_name, company_name))")
        .eq("agenda_item_id", votingItem.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!votingItem,
  });

  // Realtime for votes during the entire voting
  useEffect(() => {
    if (!votingItem?.id) return;
    const channel = supabase
      .channel(`popup-votes-${votingItem.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "etv_votes", filter: `agenda_item_id=eq.${votingItem.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["voting-popup-live-votes", votingItem.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [votingItem?.id, queryClient]);

  const checkVotingForItem = useCallback(async (agendaItem: any) => {
    if (!profile?.user_id) return;

    const { data: meeting } = await supabase
      .from("etv_meetings")
      .select("id, building_id, is_secret_ballot")
      .eq("id", agendaItem.meeting_id)
      .single();
    if (!meeting) return;

    setMeetingId(meeting.id);
    setIsSecretBallot((meeting as any).is_secret_ballot ?? true);

    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", profile.user_id!)
      .maybeSingle();
    if (!contact) return;

    const { data: assignments } = await supabase
      .from("contact_building_assignments")
      .select("id, unit_number, unit_kind, billing_mode, contact_building_shares(share_type, share_value)")
      .eq("contact_id", contact.id)
      .eq("building_id", meeting.building_id)
      .eq("is_active", true);

    const validAssignments: VotingAssignment[] = [];

    // Summe der MEA aus distribution_only / Nebeneinheiten desselben Eigentümers,
    // die wir auf die Hauptwohnung aufschlagen.
    const isApartmentRow = (a: any) => !a?.unit_kind || a.unit_kind === "apartment" || a.unit_kind === "commercial";
    const isDistributionOnly = (a: any) => a?.billing_mode === "distribution_only" || !isApartmentRow(a);
    const meaOf = (a: any) =>
      (a?.contact_building_shares?.find((s: any) => s.share_type === "mea")?.share_value) || 0;
    const extraMea = (assignments || [])
      .filter(isDistributionOnly)
      .reduce((s: number, a: any) => s + meaOf(a), 0);
    // Auf wie viele Hauptwohnungen verteilen wir den extraMea? Im Normalfall genau 1.
    // Falls mehrere: gleichmäßig, damit die Summe stimmt.
    const mainCount = (assignments || []).filter((a) => !isDistributionOnly(a)).length || 1;
    const extraPerMain = extraMea / mainCount;

    if (assignments) {
      for (const assignment of assignments) {
        // Nebeneinheiten haben keine eigene Stimme
        if (isDistributionOnly(assignment)) continue;

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

        validAssignments.push({
          id: assignment.id,
          unit_number: assignment.unit_number,
          attendee_id: attendee.id,
          mea_weight: meaOf(assignment) + extraPerMain,
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
          .select("id, unit_number, unit_kind, billing_mode, contact_id, contact_building_shares(share_type, share_value)")
          .eq("id", pa.assignment_id)
          .single();
        if (!assignment) continue;
        // Skip falls die proxy'd Einheit selbst eine Nebeneinheit ist (sollte nicht vorkommen).
        if (isDistributionOnly(assignment)) continue;

        // Sub-Units desselben (abwesenden) Eigentümers in diesem Building aufschlagen
        const { data: extraRows } = await supabase
          .from("contact_building_assignments")
          .select("id, unit_kind, billing_mode, contact_building_shares(share_type, share_value)")
          .eq("contact_id", (assignment as any).contact_id)
          .eq("building_id", meeting.building_id)
          .eq("is_active", true);
        const extra = (extraRows || []).filter(isDistributionOnly).reduce((s: number, a: any) => s + meaOf(a), 0);

        validAssignments.push({
          id: assignment.id,
          unit_number: assignment.unit_number,
          attendee_id: pa.id,
          mea_weight: meaOf(assignment) + extra,
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

  // Keep latest refs so the realtime handler/polling can use them without re-subscribing
  const checkVotingForItemRef = useRef(checkVotingForItem);
  const votingItemIdRef = useRef<string | null>(null);
  useEffect(() => { checkVotingForItemRef.current = checkVotingForItem; }, [checkVotingForItem]);
  useEffect(() => { votingItemIdRef.current = votingItem?.id ?? null; }, [votingItem?.id]);

  const checkActiveVotes = useCallback(async () => {
    const { data: activeItems } = await supabase
      .from("etv_agenda_items")
      .select("*")
      .eq("status", "voting");
    if (activeItems && activeItems.length > 0 && !votingItemIdRef.current) {
      await checkVotingForItemRef.current(activeItems[0]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!profile?.user_id || profile?.role !== "weg_owner") return;
    checkActiveVotes();
  }, [profile?.user_id, profile?.role, checkActiveVotes]);

  // Realtime + reconnect-resync + fallback polling
  useEffect(() => {
    if (!profile?.user_id || profile?.role !== "weg_owner") return;

    const channel = supabase
      .channel("global-voting-popup")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "etv_agenda_items" },
        async (payload) => {
          const newItem = payload.new as any;
          const oldItem = payload.old as any;
          if (newItem.status === "voting") {
            if (votingItemIdRef.current !== newItem.id) {
              await checkVotingForItemRef.current(newItem);
            }
          } else if (oldItem?.status === "voting" && newItem.status !== "voting") {
            if (votingItemIdRef.current === newItem.id) {
              // Fetch the finalized item to show the result dialog
              const { data: finalItem } = await supabase
                .from("etv_agenda_items")
                .select("*")
                .eq("id", newItem.id)
                .maybeSingle();
              if (finalItem && (finalItem as any).result) {
                setResultDialog(finalItem);
              }
              setVotingItem(null);
              setMyVotingAssignments([]);
              setAllDone(false);
            }
          }
        }
      )
      .subscribe((status) => {
        // Re-sync on (re)connect to catch any missed events
        if (status === "SUBSCRIBED") {
          checkActiveVotes();
        }
      });

    // Safety-net polling every 15s in case realtime drops silently
    const pollId = window.setInterval(() => {
      if (!votingItemIdRef.current) checkActiveVotes();
    }, 15000);

    return () => {
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [profile?.user_id, profile?.role, checkActiveVotes]);

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
        // Don't auto-close — show live results until voting ends
      }
    },
  });

  // Render result dialog standalone if no active voting
  const renderResultDialog = () => (
    <Dialog open={!!resultDialog} onOpenChange={(o) => { if (!o) setResultDialog(null); }}>
      <DialogContent className="text-center">
        <DialogHeader><DialogTitle>Abstimmungsergebnis</DialogTitle></DialogHeader>
        {resultDialog && (() => {
          const isMea = resultDialog.voting_principle === "mea";
          const fmt = (n: number) => Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
          const yesVal = isMea ? fmt(resultDialog.total_mea_yes) : resultDialog.yes_count;
          const noVal = isMea ? fmt(resultDialog.total_mea_no) : resultDialog.no_count;
          const absVal = isMea ? fmt(resultDialog.total_mea_abstain) : resultDialog.abstain_count;
          const unitLbl = isMea ? "MEA" : "Köpfe";
          return (
            <div className="py-4 space-y-4">
              <div className={resultDialog.result === "passed" ? "text-green-500" : "text-destructive"}>
                {resultDialog.result === "passed" ? <CheckCircle2 className="h-16 w-16 mx-auto" /> : <XCircle className="h-16 w-16 mx-auto" />}
              </div>
              <h3 className="text-xl font-bold">{resultDialog.result === "passed" ? "Beschluss angenommen" : "Beschluss abgelehnt"}</h3>
              <p className="text-sm text-muted-foreground">{resultDialog.title}</p>
              <div className="flex justify-center gap-6 text-sm">
                <div className="text-center"><div className="text-2xl font-bold text-green-600">{yesVal}</div><div className="text-muted-foreground">Ja ({unitLbl})</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-red-600">{noVal}</div><div className="text-muted-foreground">Nein ({unitLbl})</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-muted-foreground">{absVal}</div><div className="text-muted-foreground">Enthaltung ({unitLbl})</div></div>
              </div>
              {isMea && (
                <div className="text-xs text-muted-foreground">
                  Köpfe: {resultDialog.yes_count} Ja / {resultDialog.no_count} Nein / {resultDialog.abstain_count} Enth.
                </div>
              )}
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );

  if (profile?.role !== "weg_owner") return null;
  if (!votingItem) return renderResultDialog();

  const currentAssignment = myVotingAssignments[currentUnitIndex];
  const totalUnits = myVotingAssignments.length;

  const voteButtons = [
    { value: "yes", label: "Ja", icon: CheckCircle2, className: "bg-green-600 hover:bg-green-700 text-white border-green-600" },
    { value: "no", label: "Nein", icon: XCircle, className: "bg-red-600 hover:bg-red-700 text-white border-red-600" },
    { value: "abstain", label: "Enthaltung", icon: MinusCircle, className: "" },
  ];

  const yesVotesLive = liveVotes.filter((v: any) => v.vote === "yes");
  const noVotesLive = liveVotes.filter((v: any) => v.vote === "no");
  const abstainVotesLive = liveVotes.filter((v: any) => v.vote === "abstain");
  const yesCount = yesVotesLive.length;
  const noCount = noVotesLive.length;
  const abstainCount = abstainVotesLive.length;
  const sumMea = (arr: any[]) => arr.reduce((s, v) => s + Number(v.mea_weight || 0), 0);
  const yesMea = sumMea(yesVotesLive);
  const noMea = sumMea(noVotesLive);
  const abstainMea = sumMea(abstainVotesLive);
  const fmtMea = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const getContactName = (contact: any) => {
    if (!contact) return "Unbekannt";
    if (contact.company_name) return contact.company_name;
    return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background overflow-y-auto">
      <div className="min-h-full flex items-start sm:items-center justify-center p-4 py-6 sm:p-6">
        <div className="w-full max-w-xl space-y-4 sm:space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <Vote className="h-8 w-8 sm:h-10 sm:w-10 text-primary mx-auto mb-2" />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Abstimmung</h1>
            {!allDone && currentAssignment?.unit_number && (
              <Badge variant="outline" className="text-base px-4 py-1.5 border-primary/30">
                Einheit {currentAssignment.unit_number}
              </Badge>
            )}
          </div>


        {allDone ? (
          <div className="space-y-6">
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="h-20 w-20 text-green-500 mx-auto" />
              <p className="text-2xl font-semibold">Alle Stimmen abgegeben!</p>
            </div>

            {/* Live Results */}
            <div className="bg-muted rounded-lg p-5 space-y-4">
              <h3 className="font-semibold text-foreground text-center">Live-Ergebnis</h3>
              <div className="flex justify-center gap-6 text-lg">
                <span className="text-green-600 font-bold">Ja: {yesCount}</span>
                <span className="text-red-600 font-bold">Nein: {noCount}</span>
                <span className="text-muted-foreground font-semibold">Enth.: {abstainCount}</span>
              </div>

              {/* Public ballot: show who voted what */}
              {!isSecretBallot && liveVotes.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-sm text-muted-foreground text-center">Einzelstimmen</p>
                  {liveVotes.map((v: any, i: number) => {
                    const cba = v.contact_building_assignments;
                    const contact = cba?.contacts;
                    return (
                      <div key={i} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          <span>{getContactName(contact)}</span>
                          {cba?.unit_number && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">E{cba.unit_number}</Badge>
                          )}
                        </div>
                        <Badge className={
                          v.vote === "yes" ? "bg-green-600 text-white" :
                          v.vote === "no" ? "bg-red-600 text-white" :
                          "bg-muted-foreground/20 text-muted-foreground"
                        }>
                          {v.vote === "yes" ? "Ja" : v.vote === "no" ? "Nein" : "Enthaltung"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-sm text-center text-muted-foreground">
              Die Ergebnisse werden live aktualisiert. Die Ansicht schließt sich automatisch, wenn die Abstimmung beendet wird.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Progress indicator */}
            {totalUnits > 1 && (
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-sm px-3 py-1.5">
                  Einheit {currentUnitIndex + 1} von {totalUnits}
                </Badge>
                <div className="flex gap-2">
                  {Array.from({ length: totalUnits }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-3 w-3 rounded-full transition-colors ${
                        i < currentUnitIndex ? "bg-green-500" :
                        i === currentUnitIndex ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* TOP info */}
            <div>
              <p className="text-sm text-muted-foreground mb-1">Tagesordnungspunkt</p>
              <p className="font-semibold text-xl">{votingItem.title}</p>
            </div>

            {votingItem.description && (
              <Collapsible open={descOpen} onOpenChange={setDescOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <ChevronDown className={`h-4 w-4 transition-transform ${descOpen ? "rotate-180" : ""}`} />
                  Beschreibung anzeigen
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="text-sm bg-muted rounded-lg p-4 mt-2">{votingItem.description}</p>
                </CollapsibleContent>
              </Collapsible>
            )}

            {votingItem.resolution_text && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Beschlusstext</p>
                <p className="text-sm bg-muted rounded-lg p-4">{votingItem.resolution_text}</p>
              </div>
            )}

            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-sm px-4 py-1.5">
              Abstimmung läuft
            </Badge>

            {/* Live results during voting */}
            {!isSecretBallot ? (
              <div className="bg-muted rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-sm text-foreground text-center">Live-Ergebnis</h3>
                <div className="flex justify-center gap-4 sm:gap-6 text-base">
                  <span className="text-green-600 font-bold">Ja: {yesCount}</span>
                  <span className="text-red-600 font-bold">Nein: {noCount}</span>
                  <span className="text-muted-foreground font-semibold">Enth.: {abstainCount}</span>
                </div>
              </div>
            ) : (
              <div className="bg-muted rounded-lg p-3 text-center text-sm text-muted-foreground">
                Geheime Abstimmung — bisher {liveVotes.length} Stimme{liveVotes.length === 1 ? "" : "n"} eingegangen
              </div>
            )}

            {/* Vote selection buttons */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {voteButtons.map(({ value, label, icon: Icon, className }) => (
                <Button
                  key={value}
                  size="lg"
                  variant={value === "abstain" ? "outline" : "default"}
                  className={`h-20 sm:h-28 flex-col gap-1.5 sm:gap-2 text-sm sm:text-lg transition-all ${
                    value !== "abstain" ? className : ""
                  } ${
                    selectedVote === value
                      ? "ring-4 ring-primary ring-offset-2 scale-105"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  onClick={() => setSelectedVote(value)}
                  disabled={castVoteMutation.isPending}
                >
                  <Icon className="h-7 w-7 sm:h-10 sm:w-10" />
                  <span>{label}</span>
                </Button>
              ))}
            </div>

            {/* Confirm button */}
            {selectedVote && (
              <Button
                size="lg"
                className="w-full h-14 sm:h-16 text-base sm:text-xl font-semibold"
                onClick={() => castVoteMutation.mutate(selectedVote)}
                disabled={castVoteMutation.isPending}
              >
                {castVoteMutation.isPending ? "Wird gespeichert…" : "Stimme bestätigen"}
              </Button>
            )}

          </div>
        )}
        </div>
      </div>
    </div>
  );
};

