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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Play, Square, CheckCircle2, XCircle, Users, BarChart3, UserCheck, UserX,
  ArrowLeft, ArrowRight, ChevronLeft, Save, Shield, Copy, Lock, AlertTriangle,
  RefreshCw, StickyNote, FileText
} from "lucide-react";

interface MeetingLiveSessionProps {
  meetingId: string;
  buildingId: string;
}

interface AgendaItem {
  id: string;
  sort_order: number;
  title: string;
  description: string | null;
  resolution_text: string | null;
  voting_principle: string;
  status: string | null;
  result: string | null;
  yes_count: number;
  no_count: number;
  abstain_count: number;
  total_mea_voted: number;
  admin_notes: string | null;
}

export const MeetingLiveSession = ({ meetingId, buildingId }: MeetingLiveSessionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedTopId, setSelectedTopId] = useState<string | null>(null);
  const [activeVoteItem, setActiveVoteItem] = useState<string | null>(null);
  const [resultDialog, setResultDialog] = useState<AgendaItem | null>(null);
  const [editResolution, setEditResolution] = useState<Record<string, string>>({});
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [proxyDialog, setProxyDialog] = useState<string | null>(null);
  const [proxyType, setProxyType] = useState<string>("manager");
  const [proxyContactId, setProxyContactId] = useState<string>("");

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

  // Load attendees
  const { data: attendees = [] } = useQuery({
    queryKey: ["etv-attendees-live", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_attendees")
        .select(`
          *,
          contact_building_assignments!inner(
            id, unit_number, role_in_building,
            contacts!inner(id, first_name, last_name, company_name),
            contact_building_shares(share_type, share_value)
          )
        `)
        .eq("meeting_id", meetingId);
      if (error) throw error;
      return data || [];
    },
  });

  // Load building owners for init
  const { data: owners = [] } = useQuery({
    queryKey: ["building-owners", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`id, unit_number, role_in_building, contacts!inner(id, first_name, last_name, company_name)`)
        .eq("building_id", buildingId)
        .eq("role_in_building", "eigentuemer")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  // All contacts for proxy
  const { data: allContacts = [] } = useQuery({
    queryKey: ["building-contacts-proxy", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`id, contacts!inner(id, first_name, last_name, company_name)`)
        .eq("building_id", buildingId)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
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
    refetchInterval: activeVoteItem ? 2000 : false,
  });

  // Realtime votes
  useEffect(() => {
    if (!activeVoteItem) return;
    const channel = supabase
      .channel(`votes-${activeVoteItem}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "etv_votes", filter: `agenda_item_id=eq.${activeVoteItem}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["etv-votes-live", activeVoteItem] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeVoteItem, queryClient]);

  // Init edit state from loaded data
  useEffect(() => {
    const res: Record<string, string> = {};
    const notes: Record<string, string> = {};
    agendaItems.forEach((item) => {
      if (item.resolution_text && !(item.id in editResolution)) res[item.id] = item.resolution_text;
      if (item.admin_notes && !(item.id in editNotes)) notes[item.id] = item.admin_notes;
    });
    if (Object.keys(res).length) setEditResolution(prev => ({ ...res, ...prev }));
    if (Object.keys(notes).length) setEditNotes(prev => ({ ...notes, ...prev }));
  }, [agendaItems]);

  // Quorum calculation
  const presentOrRepresented = attendees.filter((a: any) => a.attendance_type === "present" || a.attendance_type === "proxy");
  const totalOwners = attendees.length;
  const presentCount = presentOrRepresented.length;
  const quorumReached = presentCount >= 1;

  const totalMea = attendees.reduce((sum: number, a: any) => {
    const shares = a.contact_building_assignments?.contact_building_shares || [];
    const meaShare = shares.find((s: any) => s.share_type === "mea");
    return sum + (meaShare?.share_value || 0);
  }, 0);

  const presentMea = presentOrRepresented.reduce((sum: number, a: any) => {
    const shares = a.contact_building_assignments?.contact_building_shares || [];
    const meaShare = shares.find((s: any) => s.share_type === "mea");
    return sum + (meaShare?.share_value || 0);
  }, 0);

  const getContactName = (contact: any) => {
    if (!contact) return "Unbekannt";
    if (contact.company_name) return contact.company_name;
    return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  const getMeaWeight = (attendee: any) => {
    const shares = attendee.contact_building_assignments?.contact_building_shares || [];
    const meaShare = shares.find((s: any) => s.share_type === "mea");
    return meaShare?.share_value || 0;
  };

  // Mutations
  const initMutation = useMutation({
    mutationFn: async () => {
      const existingIds = attendees.map((a: any) => a.assignment_id);
      const newAttendees = owners.filter((o: any) => !existingIds.includes(o.id)).map((o: any) => ({
        meeting_id: meetingId, assignment_id: o.id, attendance_type: "absent",
      }));
      if (newAttendees.length === 0) return;
      const { error } = await supabase.from("etv_attendees").insert(newAttendees);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-attendees-live", meetingId] });
      toast({ title: "Eigentümer geladen" });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async ({ id, present }: { id: string; present: boolean }) => {
      const { error } = await supabase.from("etv_attendees").update({
        attendance_type: present ? "present" : "absent",
        checked_in_at: present ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["etv-attendees-live", meetingId] }),
  });

  const updateMeetingStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("etv_meetings").update({ status, quorum_reached: quorumReached }).eq("id", meetingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-meetings"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const startVotingMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("etv_agenda_items").update({ status: "voting" }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: (_, itemId) => {
      setActiveVoteItem(itemId);
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: "Abstimmung gestartet" });
    },
  });

  const castVoteMutation = useMutation({
    mutationFn: async ({ itemId, assignmentId, vote, meaWeight }: { itemId: string; assignmentId: string; vote: string; meaWeight: number }) => {
      const { error } = await supabase.from("etv_votes").upsert({
        agenda_item_id: itemId, assignment_id: assignmentId, vote, mea_weight: meaWeight,
        is_manual_override: true, voted_at: new Date().toISOString(),
      }, { onConflict: "agenda_item_id,assignment_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["etv-votes-live", activeVoteItem] }),
  });

  const endVotingMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const yesVotes = currentVotes.filter((v: any) => v.vote === "yes");
      const noVotes = currentVotes.filter((v: any) => v.vote === "no");
      const abstainVotes = currentVotes.filter((v: any) => v.vote === "abstain");
      const item = agendaItems.find((i) => i.id === itemId);
      let result = "failed";
      if (item?.voting_principle === "mea") {
        const yesMea = yesVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
        const totalVotedMea = currentVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
        result = totalVotedMea > 0 && yesMea > totalVotedMea / 2 ? "passed" : "failed";
      } else if (item?.voting_principle === "headcount") {
        result = yesVotes.length > noVotes.length ? "passed" : "failed";
      } else if (item?.voting_principle === "double_qualified") {
        const yesMea = yesVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
        const twoThirdsVotes = yesVotes.length >= (currentVotes.length * 2) / 3;
        const fiftyPercentMea = yesMea > totalMea / 2;
        result = twoThirdsVotes && fiftyPercentMea ? "passed" : "failed";
      }
      const { error } = await supabase.from("etv_agenda_items").update({
        status: "closed", result, yes_count: yesVotes.length, no_count: noVotes.length,
        abstain_count: abstainVotes.length, total_mea_voted: currentVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0),
      }).eq("id", itemId);
      if (error) throw error;
      return { ...item, result, yes_count: yesVotes.length, no_count: noVotes.length, abstain_count: abstainVotes.length } as AgendaItem;
    },
    onSuccess: (resultItem) => {
      setActiveVoteItem(null);
      setResultDialog(resultItem);
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
    },
  });

  const saveResolutionMutation = useMutation({
    mutationFn: async ({ itemId, text }: { itemId: string; text: string }) => {
      const { error } = await supabase.from("etv_agenda_items").update({ resolution_text: text }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: "Beschlusstext gespeichert" });
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) => {
      const { error } = await supabase.from("etv_agenda_items").update({ admin_notes: notes }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: "Notizen gespeichert" });
    },
  });

  const setProxyMutation = useMutation({
    mutationFn: async ({ attendeeId, type, contactId }: { attendeeId: string; type: string; contactId?: string }) => {
      const token = type === "external" ? crypto.randomUUID() : null;
      const { error } = await supabase.from("etv_attendees").update({
        attendance_type: "proxy", proxy_type: type,
        proxy_contact_id: type !== "external" ? (contactId || null) : null,
        proxy_token: token,
      }).eq("id", attendeeId);
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      queryClient.invalidateQueries({ queryKey: ["etv-attendees-live", meetingId] });
      setProxyDialog(null);
      if (token) {
        navigator.clipboard.writeText(`${window.location.origin}/etv-proxy/${token}`);
        toast({ title: "Vollmacht-Link kopiert" });
      } else {
        toast({ title: "Vollmacht erteilt" });
      }
    },
  });

  // Navigation
  const selectedIdx = agendaItems.findIndex((i) => i.id === selectedTopId);
  const selectedItem = selectedIdx >= 0 ? agendaItems[selectedIdx] : null;
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < agendaItems.length - 1;

  const navigateTop = (dir: number) => {
    const newIdx = selectedIdx + dir;
    if (newIdx >= 0 && newIdx < agendaItems.length) {
      setSelectedTopId(agendaItems[newIdx].id);
    }
  };

  // Confirm vote result (closed → voted/final)
  const confirmVoteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("etv_agenda_items").update({ status: "voted" }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: "Ergebnis bestätigt" });
    },
  });

  // Reopen voting (closed → voting)
  const reopenVotingMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("etv_agenda_items").update({ status: "voting", result: null }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: (_, itemId) => {
      setActiveVoteItem(itemId);
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: "Abstimmung erneut geöffnet" });
    },
  });

  const getStatusBadge = (item: AgendaItem) => {
    if (item.status === "voted") {
      return <Badge variant={item.result === "passed" ? "default" : "destructive"}>
        {item.result === "passed" ? "✓ Angenommen" : "✗ Abgelehnt"}
      </Badge>;
    }
    if (item.status === "closed") {
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Unbestätigt</Badge>;
    }
    if (item.status === "voting") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Abstimmung läuft</Badge>;
    return <Badge variant="secondary">Offen</Badge>;
  };

  // ============ TOP DETAIL VIEW ============
  if (selectedItem) {
    const isActive = activeVoteItem === selectedItem.id;
    const isVoted = selectedItem.status === "voted";
    const isClosed = selectedItem.status === "closed";
    const votedCount = isActive ? currentVotes.length : 0;
    const eligibleCount = presentOrRepresented.length;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setSelectedTopId(null)} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Zurück zur Übersicht
          </Button>
          <span className="text-sm text-muted-foreground font-medium">
            TOP {selectedIdx + 1} von {agendaItems.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={!canPrev} onClick={() => navigateTop(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={!canNext} onClick={() => navigateTop(1)}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* TOP Title & Status */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">TOP {selectedIdx + 1}: {selectedItem.title}</CardTitle>
              {getStatusBadge(selectedItem)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedItem.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Beschreibung</p>
                <p className="text-sm">{selectedItem.description}</p>
              </div>
            )}

            {/* Editable Resolution Text */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Beschlusstext
                </p>
                <Button
                  size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                  onClick={() => saveResolutionMutation.mutate({ itemId: selectedItem.id, text: editResolution[selectedItem.id] || "" })}
                  disabled={saveResolutionMutation.isPending}
                >
                  <Save className="h-3 w-3" /> Speichern
                </Button>
              </div>
              <Textarea
                value={editResolution[selectedItem.id] || ""}
                onChange={(e) => setEditResolution(prev => ({ ...prev, [selectedItem.id]: e.target.value }))}
                placeholder="Beschlusstext eingeben..."
                rows={3}
                className="text-sm"
              />
            </div>

            {/* Voting */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Abstimmung
                </p>
                <div className="flex gap-2">
                  {!isVoted && !isClosed && !isActive && !activeVoteItem && (
                    <Button size="sm" onClick={() => startVotingMutation.mutate(selectedItem.id)} disabled={!quorumReached} className="gap-1">
                      <Play className="h-3 w-3" /> Abstimmung starten
                    </Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="destructive" onClick={() => endVotingMutation.mutate(selectedItem.id)} className="gap-1">
                      <Square className="h-3 w-3" /> Beenden
                    </Button>
                  )}
                  {isClosed && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => reopenVotingMutation.mutate(selectedItem.id)} className="gap-1">
                        <RefreshCw className="h-3 w-3" /> Erneut öffnen
                      </Button>
                      <Button size="sm" onClick={() => confirmVoteMutation.mutate(selectedItem.id)} className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Ergebnis bestätigen
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {isActive && (
                <div className="space-y-3">
                  <div>
                    <Progress value={eligibleCount > 0 ? (votedCount / eligibleCount) * 100 : 0} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{votedCount} / {eligibleCount} Stimmen</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Manuelle Stimmabgabe:</p>
                    {presentOrRepresented.map((a: any) => {
                      const contact = a.contact_building_assignments?.contacts;
                      const existingVote = currentVotes.find((v: any) => v.assignment_id === a.assignment_id);
                      const meaW = getMeaWeight(a);
                      return (
                        <div key={a.id} className="flex items-center justify-between py-1 px-2 rounded border">
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{getContactName(contact)}</span>
                            {existingVote && (
                              <Badge variant="outline" className="text-[10px] px-1">
                                {existingVote.vote === "yes" ? "✅" : existingVote.vote === "no" ? "❌" : "➖"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-green-600"
                              onClick={() => castVoteMutation.mutate({ itemId: selectedItem.id, assignmentId: a.assignment_id, vote: "yes", meaWeight: meaW })}>Ja</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-600"
                              onClick={() => castVoteMutation.mutate({ itemId: selectedItem.id, assignmentId: a.assignment_id, vote: "no", meaWeight: meaW })}>Nein</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => castVoteMutation.mutate({ itemId: selectedItem.id, assignmentId: a.assignment_id, vote: "abstain", meaWeight: meaW })}>Enth.</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(isVoted || isClosed) && (
                <div className="space-y-2">
                  <div className="flex gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-xl font-bold text-green-600">{selectedItem.yes_count}</div>
                      <div className="text-xs text-muted-foreground">Ja</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-red-600">{selectedItem.no_count}</div>
                      <div className="text-xs text-muted-foreground">Nein</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-muted-foreground">{selectedItem.abstain_count}</div>
                      <div className="text-xs text-muted-foreground">Enthaltung</div>
                    </div>
                  </div>
                  {isClosed && (
                    <p className="text-xs text-orange-600 font-medium">⚠ Ergebnis noch nicht bestätigt</p>
                  )}
                  {isVoted && (
                    <Badge variant={selectedItem.result === "passed" ? "default" : "destructive"}>
                      {selectedItem.result === "passed" ? "✓ Bestätigt: Angenommen" : "✓ Bestätigt: Abgelehnt"}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Protocol Notes */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <StickyNote className="h-3 w-3" /> Protokoll-Notizen
                </p>
                <Button
                  size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                  onClick={() => saveNotesMutation.mutate({ itemId: selectedItem.id, notes: editNotes[selectedItem.id] || "" })}
                  disabled={saveNotesMutation.isPending}
                >
                  <Save className="h-3 w-3" /> Speichern
                </Button>
              </div>
              <Textarea
                value={editNotes[selectedItem.id] || ""}
                onChange={(e) => setEditNotes(prev => ({ ...prev, [selectedItem.id]: e.target.value }))}
                placeholder="Notizen für das Protokoll..."
                rows={3}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bottom Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" disabled={!canPrev} onClick={() => navigateTop(-1)} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Vorheriger TOP
          </Button>
          <Button variant="outline" disabled={!canNext} onClick={() => navigateTop(1)} className="gap-1">
            Nächster TOP <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Result Dialog */}
        <Dialog open={!!resultDialog} onOpenChange={() => setResultDialog(null)}>
          <DialogContent className="text-center">
            <DialogHeader><DialogTitle>Abstimmungsergebnis</DialogTitle></DialogHeader>
            {resultDialog && (
              <div className="py-4 space-y-4">
                <div className={`${resultDialog.result === "passed" ? "text-green-500" : "text-destructive"}`}>
                  {resultDialog.result === "passed" ? <CheckCircle2 className="h-16 w-16 mx-auto" /> : <XCircle className="h-16 w-16 mx-auto" />}
                </div>
                <h3 className="text-xl font-bold">{resultDialog.result === "passed" ? "Beschluss angenommen" : "Beschluss abgelehnt"}</h3>
                <p className="text-sm text-muted-foreground">{resultDialog.title}</p>
                <div className="flex justify-center gap-6 text-sm">
                  <div className="text-center"><div className="text-2xl font-bold text-green-600">{resultDialog.yes_count}</div><div className="text-muted-foreground">Ja</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-red-600">{resultDialog.no_count}</div><div className="text-muted-foreground">Nein</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-muted-foreground">{resultDialog.abstain_count}</div><div className="text-muted-foreground">Enthaltung</div></div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============ OVERVIEW VIEW ============
  return (
    <div className="space-y-6">
      {/* Quorum & Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Eröffnung & Quorum
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

      {/* Attendance List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Anwesenheitsliste & Vollmachten</CardTitle>
            {attendees.length === 0 && owners.length > 0 && (
              <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending} size="sm" className="gap-2">
                <RefreshCw className={`h-3.5 w-3.5 ${initMutation.isPending ? "animate-spin" : ""}`} />
                Eigentümer laden
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {attendees.length === 0 && owners.length === 0 && (
            <div className="py-6 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p>Keine Eigentümer gefunden. Bitte unter Adressen anlegen.</p>
            </div>
          )}
          <div className="space-y-2">
            {attendees.map((a: any) => {
              const cba = a.contact_building_assignments;
              const contact = cba?.contacts;
              return (
                <div key={a.id} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {a.attendance_type === "present" ? <UserCheck className="h-4 w-4 text-green-500 shrink-0" />
                      : a.attendance_type === "proxy" ? <Users className="h-4 w-4 text-blue-500 shrink-0" />
                      : <UserX className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium truncate">{getContactName(contact)}</span>
                    {cba?.unit_number && <Badge variant="outline" className="text-xs shrink-0">E{cba.unit_number}</Badge>}
                    {a.proxy_type && (
                      <span className="text-xs text-muted-foreground">
                        ({a.proxy_type === "manager" ? "Verwalter" : a.proxy_type === "owner" ? "Eigentümer" : "Extern"})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="text-xs">Anw.</Label>
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

      {/* TOP Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Tagesordnungspunkte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {agendaItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Keine TOPs vorhanden. Bitte zuerst unter "Vorbereitung" anlegen.
            </p>
          )}
          {agendaItems.map((item, idx) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelectedTopId(item.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-primary">TOP {idx + 1}</span>
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(item)}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {item.status === "voted" && (
                  <p className="text-xs text-muted-foreground mt-1 ml-12">
                    Ja: {item.yes_count} | Nein: {item.no_count} | Enthaltung: {item.abstain_count}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

    </div>
  );
};
