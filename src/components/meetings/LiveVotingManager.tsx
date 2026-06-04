import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Play, Square, CheckCircle2, XCircle, MinusCircle, Users,
  AlertTriangle, BarChart3, UserCheck, UserX
} from "lucide-react";
import { isApartment, readMea } from "@/lib/secondaryUnits";

interface LiveVotingManagerProps {
  meetingId: string;
  buildingId: string;
}

interface AgendaItem {
  id: string;
  sort_order: number;
  title: string;
  voting_principle: string;
  status: string | null;
  result: string | null;
  yes_count: number;
  no_count: number;
  abstain_count: number;
  total_mea_voted: number;
}

export const LiveVotingManager = ({ meetingId, buildingId }: LiveVotingManagerProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeVoteItem, setActiveVoteItem] = useState<string | null>(null);
  const [resultDialog, setResultDialog] = useState<AgendaItem | null>(null);

  // Load agenda items
  const { data: agendaItems = [] } = useQuery({
    queryKey: ["etv-agenda-items-live", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as AgendaItem[];
    },
  });

  // Load attendees (for quorum & voting). Wir laden bewusst Felder zur Identifikation
  // von Nebeneinheiten (unit_kind, billing_mode, parent_assignment_id, contact_id),
  // damit wir Sub-Units aus der Stimmberechtigung herausfiltern können.
  const { data: attendeesRaw = [] } = useQuery({
    queryKey: ["etv-attendees-live", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_attendees")
        .select(`
          *,
          contact_building_assignments!inner(
            id, unit_number, unit_kind, billing_mode, parent_assignment_id, contact_id,
            contacts!inner(id, first_name, last_name, company_name),
            contact_building_shares(share_type, share_value)
          )
        `)
        .eq("meeting_id", meetingId);
      if (error) throw error;
      return data || [];
    },
  });

  // Lade ALLE Assignments im Building (inkl. Nebeneinheiten ohne Attendee-Datensatz),
  // um deren MEA auf die Hauptwohnung des gleichen Eigentümers aufzuschlagen.
  const { data: distOnlyByContact = new Map<string, number>() } = useQuery({
    queryKey: ["etv-dist-only-mea", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select("contact_id, billing_mode, unit_kind, contact_building_shares(share_type, share_value)")
        .eq("building_id", buildingId)
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const a of (data as any[]) || []) {
        const isDistOnly = a.billing_mode === "distribution_only" || !isApartment(a.unit_kind);
        if (!isDistOnly) continue;
        const cid = a.contact_id;
        if (!cid) continue;
        const mea = readMea({ contact_building_shares: a.contact_building_shares });
        map.set(cid, (map.get(cid) || 0) + mea);
      }
      return map;
    },
  });

  // Stimmberechtigte Attendees = nur Hauptwohnungen mit eigener Abrechnung.
  // Nebeneinheiten (TG, Keller, distribution_only) bekommen KEINE eigene Stimme.
  const attendees = (attendeesRaw as any[]).filter((att: any) => {
    const a = att.contact_building_assignments;
    if (!a) return false;
    if (a.billing_mode === "distribution_only") return false;
    if (!isApartment(a.unit_kind)) return false;
    return true;
  });

  // Load votes for active item
  const { data: currentVotes = [] } = useQuery({
    queryKey: ["etv-votes-live", activeVoteItem],
    queryFn: async () => {
      if (!activeVoteItem) return [];
      const { data, error } = await supabase
        .from("etv_votes")
        .select("*")
        .eq("agenda_item_id", activeVoteItem);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeVoteItem,
    refetchInterval: activeVoteItem ? 2000 : false, // Poll every 2s during voting
  });

  // Realtime subscription for votes
  useEffect(() => {
    if (!activeVoteItem) return;
    const channel = supabase
      .channel(`votes-${activeVoteItem}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "etv_votes", filter: `agenda_item_id=eq.${activeVoteItem}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["etv-votes-live", activeVoteItem] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeVoteItem, queryClient]);

  // Effektive MEA-Gewichtung (inkl. Nebeneinheiten desselben Eigentümers)
  const getMeaWeight = (attendee: any) => {
    const a = attendee?.contact_building_assignments;
    const shares = a?.contact_building_shares || [];
    const own = (shares.find((s: any) => s.share_type === "mea")?.share_value) || 0;
    const extra = (a?.contact_id && (distOnlyByContact as Map<string, number>).get(a.contact_id)) || 0;
    return own + extra;
  };

  // Calculate quorum — only count explicitly checked-in attendees
  const presentOrRepresented = attendees.filter(
    (a: any) => a.attendance_type === "present" || (a.attendance_type === "proxy" && a.checked_in_at)
  );
  const totalOwners = attendees.length;
  const presentCount = presentOrRepresented.length;
  const quorumReached = totalOwners > 0 && presentCount > totalOwners / 2;

  const totalMea = attendees.reduce((sum: number, a: any) => sum + getMeaWeight(a), 0);
  const presentMea = presentOrRepresented.reduce((sum: number, a: any) => sum + getMeaWeight(a), 0);

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async ({ id, present }: { id: string; present: boolean }) => {
      const { error } = await supabase
        .from("etv_attendees")
        .update({
          attendance_type: present ? "present" : "absent",
          checked_in_at: present ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-attendees-live", meetingId] });
    },
  });

  // Auto-cast pre-votes from proxy instructions
  const autoCastPreVotes = useCallback(async (itemId: string) => {
    const proxyAttendees = attendees.filter(
      (a: any) => a.attendance_type === "proxy" && a.checked_in_at && a.pre_vote_instructions
    );
    for (const attendee of proxyAttendees) {
      const instructions = attendee.pre_vote_instructions as Record<string, string>;
      const vote = instructions[itemId];
      if (vote && ["yes", "no", "abstain"].includes(vote)) {
        const meaW = getMeaWeight(attendee);
        await supabase.from("etv_votes").upsert({
          agenda_item_id: itemId,
          assignment_id: attendee.assignment_id,
          vote,
          mea_weight: meaW,
          is_manual_override: false,
          voted_at: new Date().toISOString(),
        }, { onConflict: "agenda_item_id,assignment_id" });
      }
    }
  }, [attendees]);

  // Start voting on a TOP
  const startVotingMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("etv_agenda_items")
        .update({ status: "voting" })
        .eq("id", itemId);
      if (error) throw error;
      // Auto-cast any pre-vote instructions
      await autoCastPreVotes(itemId);
    },
    onSuccess: (_, itemId) => {
      setActiveVoteItem(itemId);
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      queryClient.invalidateQueries({ queryKey: ["etv-votes-live", itemId] });
      toast({ title: "Abstimmung gestartet" });
    },
  });

  // Cast vote (admin manual)
  const castVoteMutation = useMutation({
    mutationFn: async ({ itemId, assignmentId, vote, meaWeight }: {
      itemId: string; assignmentId: string; vote: string; meaWeight: number;
    }) => {
      const { error } = await supabase
        .from("etv_votes")
        .upsert({
          agenda_item_id: itemId,
          assignment_id: assignmentId,
          vote,
          mea_weight: meaWeight,
          is_manual_override: true,
          voted_at: new Date().toISOString(),
        }, { onConflict: "agenda_item_id,assignment_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-votes-live", activeVoteItem] });
    },
  });

  const resetVoteMutation = useMutation({
    mutationFn: async ({ itemId, assignmentId }: { itemId: string; assignmentId: string }) => {
      const { error } = await supabase.from("etv_votes")
        .delete()
        .eq("agenda_item_id", itemId)
        .eq("assignment_id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-votes-live", activeVoteItem] });
    },
  });

  // End voting
  const endVotingMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // Calculate results
      const yesVotes = currentVotes.filter((v: any) => v.vote === "yes");
      const noVotes = currentVotes.filter((v: any) => v.vote === "no");
      const abstainVotes = currentVotes.filter((v: any) => v.vote === "abstain");

      const item = agendaItems.find((i) => i.id === itemId);
      let result = "failed";

      // Einfache Mehrheit: Ja > Nein (Enthaltungen zählen NICHT als Nein)
      if (item?.voting_principle === "mea") {
        const yesMea = yesVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
        const noMea = noVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
        result = (yesMea > 0 || noMea > 0) && yesMea > noMea ? "passed" : "failed";
      } else if (item?.voting_principle === "headcount") {
        result = yesVotes.length > noVotes.length ? "passed" : "failed";
      } else if (item?.voting_principle === "double_qualified") {
        const yesMea = yesVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
        const twoThirdsVotes = yesVotes.length >= (currentVotes.length * 2) / 3;
        const fiftyPercentMea = yesMea > totalMea / 2;
        result = twoThirdsVotes && fiftyPercentMea ? "passed" : "failed";
      }

      const { error } = await supabase
        .from("etv_agenda_items")
        .update({
          status: "voted",
          result,
          yes_count: yesVotes.length,
          no_count: noVotes.length,
          abstain_count: abstainVotes.length,
          total_mea_voted: currentVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0),
        })
        .eq("id", itemId);
      if (error) throw error;

      return { ...item, result, yes_count: yesVotes.length, no_count: noVotes.length, abstain_count: abstainVotes.length } as AgendaItem;
    },
    onSuccess: (resultItem) => {
      setActiveVoteItem(null);
      setResultDialog(resultItem);
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: resultItem?.result === "passed" ? "Beschluss angenommen ✅" : "Beschluss abgelehnt ❌" });
    },
  });

  // Update meeting status
  const updateMeetingStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("etv_meetings")
        .update({ status, quorum_reached: quorumReached })
        .eq("id", meetingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-meetings"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const getContactName = (contact: any) => {
    if (!contact) return "Unbekannt";
    if (contact.company_name) return contact.company_name;
    return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  // (getMeaWeight oben definiert)

  return (
    <div className="space-y-6">
      {/* Quorum Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Beschlussfähigkeit (Quorum)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>{presentCount} von {totalOwners} Eigentümern anwesend/vertreten</span>
            <Badge variant={quorumReached ? "default" : "destructive"}>
              {quorumReached ? "Beschlussfähig" : "Nicht beschlussfähig"}
            </Badge>
          </div>
          <Progress value={totalOwners > 0 ? (presentCount / totalOwners) * 100 : 0} className="h-2" />
          {totalMea > 0 && (
            <p className="text-xs text-muted-foreground">
              MEA: {presentMea.toFixed(2)} / {totalMea.toFixed(2)} ({((presentMea / totalMea) * 100).toFixed(1)}%)
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateMeetingStatusMutation.mutate("in_progress")} variant="outline">
              Versammlung eröffnen
            </Button>
            <Button size="sm" onClick={() => updateMeetingStatusMutation.mutate("completed")} variant="outline">
              Versammlung schließen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Check-in List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Anwesenheitsprüfung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {attendees.map((a: any) => {
              const contact = a.contact_building_assignments?.contacts;
              return (
                <div key={a.id} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    {a.attendance_type === "present" ? (
                      <UserCheck className="h-4 w-4 text-green-500" />
                    ) : a.attendance_type === "proxy" ? (
                      <Users className="h-4 w-4 text-blue-500" />
                    ) : (
                      <UserX className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{getContactName(contact)}</span>
                    {a.contact_building_assignments?.unit_number && (
                      <Badge variant="outline" className="text-xs">E{a.contact_building_assignments.unit_number}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Anwesend</Label>
                    <Switch
                      checked={a.attendance_type === "present"}
                      onCheckedChange={(checked) => checkInMutation.mutate({ id: a.id, present: checked })}
                      disabled={a.attendance_type === "proxy"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Voting per TOP */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Abstimmungen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {agendaItems.map((item, idx) => {
            const isActive = activeVoteItem === item.id;
            const isVoted = item.status === "voted";
            const votedCount = isActive ? currentVotes.length : 0;
            const eligibleCount = presentOrRepresented.length;

            return (
              <Card key={item.id} className={isActive ? "border-primary ring-1 ring-primary" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-primary">TOP {idx + 1}</span>
                        <span className="text-sm font-medium">{item.title}</span>
                        {isVoted && (
                          <Badge className={item.result === "passed" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}>
                            {item.result === "passed" ? "✓ Angenommen" : "✗ Abgelehnt"}
                          </Badge>
                        )}
                      </div>
                      {isVoted && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Ja: {item.yes_count} | Nein: {item.no_count} | Enthaltung: {item.abstain_count}
                        </p>
                      )}
                      {isActive && (
                        <div className="mt-2">
                          <Progress value={eligibleCount > 0 ? (votedCount / eligibleCount) * 100 : 0} className="h-1.5" />
                          <p className="text-xs text-muted-foreground mt-1">{votedCount} / {eligibleCount} Stimmen eingegangen</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {!isVoted && !isActive && !activeVoteItem && (
                        <Button
                          size="sm"
                          onClick={() => startVotingMutation.mutate(item.id)}
                          disabled={!quorumReached}
                          className="gap-1"
                        >
                          <Play className="h-3 w-3" />
                          Abstimmung
                        </Button>
                      )}
                      {isActive && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => endVotingMutation.mutate(item.id)}
                          className="gap-1"
                        >
                          <Square className="h-3 w-3" />
                          Beenden
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Manual vote input for admin */}
                  {isActive && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      {/* Live tally */}
                      {votedCount > 0 && (() => {
                        const yesVotes = currentVotes.filter((v: any) => v.vote === "yes");
                        const noVotes = currentVotes.filter((v: any) => v.vote === "no");
                        const abstainVotes = currentVotes.filter((v: any) => v.vote === "abstain");
                        const yesMea = yesVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
                        const noMea = noVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
                        const totalVotedMea = currentVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
                        const principle = item.voting_principle;
                        let currentResult = "—";
                        if (principle === "mea") {
                          currentResult = totalVotedMea > 0 && yesMea > totalVotedMea / 2 ? "Angenommen" : "Abgelehnt";
                        } else if (principle === "headcount") {
                          currentResult = yesVotes.length > noVotes.length ? "Angenommen" : "Abgelehnt";
                        } else if (principle === "double_qualified") {
                          const twoThirds = yesVotes.length >= (currentVotes.length * 2) / 3;
                          const fiftyMea = yesMea > totalMea / 2;
                          currentResult = twoThirds && fiftyMea ? "Angenommen" : "Abgelehnt";
                        }
                        return (
                          <div className="flex items-center gap-3 p-2 rounded bg-muted/50 text-xs">
                            <span className="text-green-600 font-medium">Ja: {yesVotes.length}{principle !== "headcount" ? ` (${yesMea.toFixed(2)} MEA)` : ""}</span>
                            <span className="text-red-600 font-medium">Nein: {noVotes.length}{principle !== "headcount" ? ` (${noMea.toFixed(2)} MEA)` : ""}</span>
                            <span className="text-muted-foreground font-medium">Enth.: {abstainVotes.length}</span>
                            <span className="ml-auto font-semibold">
                              <span className={currentResult === "Angenommen" ? "text-green-600" : "text-red-600"}>{currentResult}</span>
                            </span>
                          </div>
                        );
                      })()}

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Manuelle Stimmabgabe:</p>
                        {presentOrRepresented.map((a: any) => {
                          const contact = a.contact_building_assignments?.contacts;
                          const existingVote = currentVotes.find((v: any) => v.assignment_id === a.assignment_id);
                          const meaW = getMeaWeight(a);
                          const rowBg = existingVote
                            ? existingVote.vote === "yes" ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                            : existingVote.vote === "no" ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                            : "bg-muted/50 border-muted"
                            : "";
                          const hasPreVote = a.attendance_type === "proxy" && a.pre_vote_instructions && a.pre_vote_instructions[item.id];
                          return (
                            <div key={a.id} className={`flex items-center justify-between py-1 px-2 rounded border ${rowBg}`}>
                              <span className="text-xs">
                                {getContactName(contact)}
                                {hasPreVote && <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1 border-amber-300 text-amber-600">Weisung</Badge>}
                              </span>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-green-600"
                                  onClick={() => castVoteMutation.mutate({ itemId: item.id, assignmentId: a.assignment_id, vote: "yes", meaWeight: meaW })}>Ja</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-600"
                                  onClick={() => castVoteMutation.mutate({ itemId: item.id, assignmentId: a.assignment_id, vote: "no", meaWeight: meaW })}>Nein</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground"
                                  onClick={() => castVoteMutation.mutate({ itemId: item.id, assignmentId: a.assignment_id, vote: "abstain", meaWeight: meaW })}>Enth.</Button>
                                {existingVote && (
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-orange-500"
                                    onClick={() => resetVoteMutation.mutate({ itemId: item.id, assignmentId: a.assignment_id })}>↩</Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>

      {/* Result Dialog */}
      <Dialog open={!!resultDialog} onOpenChange={() => setResultDialog(null)}>
        <DialogContent className="text-center">
          <DialogHeader>
            <DialogTitle>Abstimmungsergebnis</DialogTitle>
          </DialogHeader>
          {resultDialog && (
            <div className="py-4 space-y-4">
              <div className={`text-5xl ${resultDialog.result === "passed" ? "text-green-500" : "text-destructive"}`}>
                {resultDialog.result === "passed" ? <CheckCircle2 className="h-16 w-16 mx-auto" /> : <XCircle className="h-16 w-16 mx-auto" />}
              </div>
              <h3 className="text-xl font-bold">
                {resultDialog.result === "passed" ? "Beschluss angenommen" : "Beschluss abgelehnt"}
              </h3>
              <p className="text-sm text-muted-foreground">{resultDialog.title}</p>
              <div className="flex justify-center gap-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{resultDialog.yes_count}</div>
                  <div className="text-muted-foreground">Ja</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{resultDialog.no_count}</div>
                  <div className="text-muted-foreground">Nein</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-muted-foreground">{resultDialog.abstain_count}</div>
                  <div className="text-muted-foreground">Enthaltung</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
