import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Play, Square, CheckCircle2, XCircle, Users, BarChart3, UserCheck, UserX,
  ArrowLeft, ArrowRight, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Save, Shield, Copy, Lock, AlertTriangle,
  RefreshCw, StickyNote, FileText, Plus, Gavel, ArrowUp, ArrowDown
} from "lucide-react";
import { AgendaItemEmailsSection } from "./AgendaItemEmailsSection";
import { ProxyInstructionsMatrix } from "./ProxyInstructionsMatrix";

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
  total_mea_yes?: number;
  total_mea_no?: number;
  total_mea_abstain?: number;
  admin_notes: string | null;
  category: string | null;
  requires_double_qualified: boolean;
  double_qualified_relevant: boolean;
  requires_resolution: boolean;
}

const votingPrincipleLabels: Record<string, string> = {
  mea: "MEA (Wertprinzip)",
  headcount: "Kopfprinzip",
  sqm: "Quadratmeter",
};

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
  
  // Geschäftsbeschluss dialog
  const [showProceduralDialog, setShowProceduralDialog] = useState(false);
  const [proceduralTitle, setProceduralTitle] = useState("");
  const [proceduralResolution, setProceduralResolution] = useState("");
  const [proceduralPrinciple, setProceduralPrinciple] = useState("headcount");
  const [isSecretBallot, setIsSecretBallot] = useState(true);
  const [isAttendanceCollapsed, setIsAttendanceCollapsed] = useState(true);

  // Load meeting for is_secret_ballot
  const { data: meetingData } = useQuery({
    queryKey: ["etv-meeting-live", meetingId],
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

  useEffect(() => {
    if (meetingData) setIsSecretBallot(meetingData.is_secret_ballot ?? true);
  }, [meetingData]);

  const toggleSecretBallotMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase.from("etv_meetings").update({ is_secret_ballot: value } as any).eq("id", meetingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-meeting-live", meetingId] });
    },
  });

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

  // Load votes for active item (realtime keeps it fresh — no polling needed)
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
    staleTime: 30_000,
  });

  // Separate vote load for the selected TOP so closed/confirmed results still show
  // the actual MEA sums after activeVoteItem is no longer available.
  const { data: selectedItemVotes = [] } = useQuery({
    queryKey: ["etv-votes-detail", selectedTopId],
    queryFn: async () => {
      if (!selectedTopId) return [];
      const { data, error } = await supabase
        .from("etv_votes")
        .select("*")
        .eq("agenda_item_id", selectedTopId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedTopId,
    staleTime: 10_000,
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

  // Sync activeVoteItem with any agenda item already in 'voting' status
  // (e.g. when reopening the session or after a refresh)
  useEffect(() => {
    if (activeVoteItem) return;
    const ongoing = agendaItems.find((it: any) => it.status === "voting");
    if (ongoing) setActiveVoteItem(ongoing.id);
  }, [agendaItems, activeVoteItem]);

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

  // Quorum calculation — only count explicitly checked-in attendees
  const presentOrRepresented = attendees.filter(
    (a: any) => a.attendance_type === "present" || (a.attendance_type === "proxy" && a.checked_in_at)
  );
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

  const totalSqm = attendees.reduce((sum: number, a: any) => {
    const shares = a.contact_building_assignments?.contact_building_shares || [];
    const sqmShare = shares.find((s: any) => s.share_type === "sqm");
    return sum + (sqmShare?.share_value || 0);
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

  const getSqmWeight = (attendee: any) => {
    const shares = attendee.contact_building_assignments?.contact_building_shares || [];
    const sqmShare = shares.find((s: any) => s.share_type === "sqm");
    return sqmShare?.share_value || 0;
  };

  // Track which (itemId:assignmentId) pairs have been handled in this mount.
  // NOT cleared on activeVoteItem change so that manual resets/overrides
  // do not get overwritten by re-runs of the auto-cast effect.
  const autoCastAttempted = useRef<Set<string>>(new Set());

  // Auto-cast pre-vote instructions (Papier-Weisungen / Admin-Vorauswahl).
  // Depends ONLY on activeVoteItem and attendees — NOT currentVotes — to avoid
  // a feedback loop where realtime invalidations re-trigger the effect.
  useEffect(() => {
    if (!activeVoteItem) return;
    const eligible = attendees.filter(
      (a: any) =>
        (a.attendance_type === "present" || (a.attendance_type === "proxy" && a.checked_in_at)) &&
        a.pre_vote_instructions &&
        (a.pre_vote_instructions as any)[activeVoteItem]
    );
    if (eligible.length === 0) return;
    // Read current votes from the query cache (avoids re-running on currentVotes change)
    const cached = (queryClient.getQueryData<any[]>(["etv-votes-live", activeVoteItem]) || []);
    const existingByAssignment = new Set(cached.map((v: any) => v.assignment_id));
    const todo = eligible.filter((a: any) => {
      if (existingByAssignment.has(a.assignment_id)) return false;
      const key = `${activeVoteItem}:${a.assignment_id}`;
      if (autoCastAttempted.current.has(key)) return false;
      return true;
    });
    if (todo.length === 0) return;
    (async () => {
      for (const att of todo) {
        const vote = (att.pre_vote_instructions as any)[activeVoteItem];
        if (!["yes", "no", "abstain"].includes(vote)) continue;
        const key = `${activeVoteItem}:${att.assignment_id}`;
        autoCastAttempted.current.add(key);
        // Double-check via DB to avoid re-casting after a manual reset
        const { data: existing } = await supabase
          .from("etv_votes")
          .select("assignment_id, is_manual_override")
          .eq("agenda_item_id", activeVoteItem)
          .eq("assignment_id", att.assignment_id)
          .maybeSingle();
        if (existing) continue;
        await supabase.from("etv_votes").upsert({
          agenda_item_id: activeVoteItem,
          assignment_id: att.assignment_id,
          vote,
          mea_weight: getMeaWeight(att),
          sqm_weight: getSqmWeight(att),
          is_manual_override: false,
          voted_at: new Date().toISOString(),
        } as any, { onConflict: "agenda_item_id,assignment_id" });
      }
      queryClient.invalidateQueries({ queryKey: ["etv-votes-live", activeVoteItem] });
    })();
  }, [activeVoteItem, attendees, queryClient]);

  // Compute result for a given voting principle
  // Einfache Mehrheit: Ja > Nein (Enthaltungen zählen NICHT als Nein-Stimmen)
  const computeResult = (principle: string, votes: any[], item?: AgendaItem) => {
    const yesVotes = votes.filter((v: any) => v.vote === "yes");
    const noVotes = votes.filter((v: any) => v.vote === "no");

    if (principle === "mea") {
      const yesMea = yesVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
      const noMea = noVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
      if (yesMea === 0 && noMea === 0) return "failed";
      return yesMea > noMea ? "passed" : "failed";
    } else if (principle === "headcount") {
      if (yesVotes.length === 0 && noVotes.length === 0) return "failed";
      return yesVotes.length > noVotes.length ? "passed" : "failed";
    } else if (principle === "sqm") {
      const yesSqm = yesVotes.reduce((s: number, v: any) => s + (v.sqm_weight || 0), 0);
      const noSqm = noVotes.reduce((s: number, v: any) => s + (v.sqm_weight || 0), 0);
      if (yesSqm === 0 && noSqm === 0) return "failed";
      return yesSqm > noSqm ? "passed" : "failed";
    }
    return "failed";
  };

  // Check double qualified majority
  const checkDoubleQualified = (votes: any[]) => {
    const yesVotes = votes.filter((v: any) => v.vote === "yes");
    const yesMea = yesVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
    const twoThirdsVotes = yesVotes.length >= (votes.length * 2) / 3;
    const fiftyPercentMea = totalMea > 0 && yesMea > totalMea / 2;
    return twoThirdsVotes && fiftyPercentMea;
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
      const attendee = attendees.find((a: any) => a.id === id);
      const hasProxy = attendee?.proxy_type;

      const { error } = await supabase.from("etv_attendees").update({
        attendance_type: present ? (hasProxy ? "proxy" : "present") : "absent",
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

      // Auto-Cast: Vorab-Stimmen (Papier-Weisungen + Admin-Vorauswahl) übernehmen
      const preVotedAttendees = attendees.filter(
        (a: any) => a.pre_vote_instructions && a.pre_vote_instructions[itemId]
      );
      let cast = 0;
      for (const att of preVotedAttendees) {
        const vote = (att.pre_vote_instructions as any)[itemId];
        if (!["yes", "no", "abstain"].includes(vote)) continue;
        const meaW = getMeaWeight(att);
        const sqmW = getSqmWeight(att);
        const { error: ve } = await supabase.from("etv_votes").upsert({
          agenda_item_id: itemId,
          assignment_id: att.assignment_id,
          vote,
          mea_weight: meaW,
          sqm_weight: sqmW,
          is_manual_override: false,
          voted_at: new Date().toISOString(),
        } as any, { onConflict: "agenda_item_id,assignment_id" });
        if (!ve) cast += 1;
      }
      return cast;
    },
    onSuccess: (cast, itemId) => {
      setActiveVoteItem(itemId);
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      queryClient.invalidateQueries({ queryKey: ["etv-votes-live", itemId] });
      // Broadcast to proxy/owner sessions so they instantly refetch
      try {
        const ch = supabase.channel(`meeting-broadcast-${meetingId}`);
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            ch.send({ type: "broadcast", event: "voting-changed", payload: { itemId } });
            setTimeout(() => supabase.removeChannel(ch), 500);
          }
        });
      } catch (_) { /* ignore */ }
      toast({
        title: "Abstimmung gestartet",
        description: cast > 0 ? `${cast} Vorab-Weisung${cast === 1 ? "" : "en"} übernommen` : undefined,
      });
    },
  });


  const castVoteMutation = useMutation({
    mutationFn: async ({ itemId, assignmentId, vote, meaWeight, sqmWeight }: { itemId: string; assignmentId: string; vote: string; meaWeight: number; sqmWeight?: number }) => {
      // Mark as handled so auto-cast does not overwrite this manual choice
      autoCastAttempted.current.add(`${itemId}:${assignmentId}`);
      const { error } = await supabase.from("etv_votes").upsert({
        agenda_item_id: itemId, assignment_id: assignmentId, vote, mea_weight: meaWeight,
        sqm_weight: sqmWeight || 0,
        is_manual_override: true, voted_at: new Date().toISOString(),
      } as any, { onConflict: "agenda_item_id,assignment_id" });
      if (error) throw error;
    },
    onMutate: async ({ itemId, assignmentId, vote, meaWeight, sqmWeight }) => {
      const key = ["etv-votes-live", itemId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key) || [];
      const next = previous.filter((v: any) => v.assignment_id !== assignmentId);
      next.push({
        agenda_item_id: itemId, assignment_id: assignmentId, vote,
        mea_weight: meaWeight, sqm_weight: sqmWeight || 0,
        is_manual_override: true, voted_at: new Date().toISOString(),
      });
      queryClient.setQueryData(key, next);
      return { previous, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    // Realtime channel keeps cache in sync — no manual invalidate needed
  });

  const resetVoteMutation = useMutation({
    mutationFn: async ({ itemId, assignmentId }: { itemId: string; assignmentId: string }) => {
      // Mark as handled so auto-cast does not restore the deleted vote from a paper instruction
      autoCastAttempted.current.add(`${itemId}:${assignmentId}`);
      const { error } = await supabase.from("etv_votes")
        .delete()
        .eq("agenda_item_id", itemId)
        .eq("assignment_id", assignmentId);
      if (error) throw error;
    },
    onMutate: async ({ itemId, assignmentId }) => {
      const key = ["etv-votes-live", itemId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key) || [];
      queryClient.setQueryData(key, previous.filter((v: any) => v.assignment_id !== assignmentId));
      return { previous, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
  });

  const endVotingMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // Re-fetch votes from DB to avoid using stale closure state
      const { data: freshVotes, error: fetchErr } = await supabase
        .from("etv_votes")
        .select("*")
        .eq("agenda_item_id", itemId);
      if (fetchErr) throw fetchErr;
      const votes = freshVotes || [];
      const yesVotes = votes.filter((v: any) => v.vote === "yes");
      const noVotes = votes.filter((v: any) => v.vote === "no");
      const abstainVotes = votes.filter((v: any) => v.vote === "abstain");
      const item = agendaItems.find((i) => i.id === itemId);
      const sumMea = (arr: any[]) => arr.reduce((s: number, v: any) => s + (Number(v.mea_weight) || 0), 0);
      const meaYes = sumMea(yesVotes);
      const meaNo = sumMea(noVotes);
      const meaAbstain = sumMea(abstainVotes);
      const totalMea = meaYes + meaNo + meaAbstain;

      const result = computeResult(item?.voting_principle || "mea", votes, item);

      const { error } = await supabase.from("etv_agenda_items").update({
        status: "closed", result,
        yes_count: yesVotes.length, no_count: noVotes.length, abstain_count: abstainVotes.length,
        total_mea_voted: totalMea,
        total_mea_yes: meaYes, total_mea_no: meaNo, total_mea_abstain: meaAbstain,
      } as any).eq("id", itemId);
      if (error) throw error;
      return { ...item, result,
        yes_count: yesVotes.length, no_count: noVotes.length, abstain_count: abstainVotes.length,
        total_mea_yes: meaYes, total_mea_no: meaNo, total_mea_abstain: meaAbstain,
      } as AgendaItem;
    },
    onSuccess: (resultItem) => {
      // Keep activeVoteItem set so the vote grid stays visible with the final state.
      // It will be cleared when the user opens another TOP or closes the dialog.
      setResultDialog(resultItem);
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      queryClient.invalidateQueries({ queryKey: ["etv-votes-live", resultItem.id] });
      queryClient.invalidateQueries({ queryKey: ["etv-votes-detail", resultItem.id] });
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

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, patch }: { itemId: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("etv_agenda_items").update(patch as any).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      toast({ title: "TOP aktualisiert" });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
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

  // Geschäftsbeschluss options
  const [proceduralAutoAccept, setProceduralAutoAccept] = useState(true);

  // Add procedural resolution (Geschäftsbeschluss) during meeting
  const addProceduralMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("etv_agenda_items").insert({
        meeting_id: meetingId,
        sort_order: agendaItems.length + 1,
        title: proceduralTitle,
        resolution_text: proceduralResolution || null,
        voting_principle: proceduralPrinciple,
        category: "geschaeftsbeschluss",
        status: proceduralAutoAccept ? "voted" : "open",
        result: proceduralAutoAccept ? "passed" : null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      setShowProceduralDialog(false);
      setProceduralTitle("");
      setProceduralResolution("");
      setProceduralAutoAccept(true);
      setProceduralPrinciple("headcount");
      toast({ title: "Geschäftsbeschluss hinzugefügt" });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
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
  // Bestehende Stimmen werden gelöscht, damit alle Eigentümer erneut benachrichtigt werden
  // (VotingPopup öffnet nur, wenn noch keine Stimme für die Einheit existiert).
  const reopenVotingMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // 1) Bestehende Stimmen löschen, damit Live-Popup bei allen Owner-Geräten neu auftaucht
      const { error: delErr } = await supabase
        .from("etv_votes")
        .delete()
        .eq("agenda_item_id", itemId);
      if (delErr) throw delErr;
      // 2) Status kurz auf "open" setzen und dann auf "voting" — erzwingt UPDATE-Event
      // im Realtime-Stream, falls Geräte den ersten Zustandswechsel verpasst haben.
      await supabase.from("etv_agenda_items").update({ status: "open", result: null }).eq("id", itemId);
      const { error } = await supabase.from("etv_agenda_items").update({ status: "voting", result: null }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: (_, itemId) => {
      setActiveVoteItem(itemId);
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
      queryClient.invalidateQueries({ queryKey: ["etv-votes-live", itemId] });
      try {
        const ch = supabase.channel(`meeting-broadcast-${meetingId}`);
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            ch.send({ type: "broadcast", event: "voting-changed", payload: { itemId, reopened: true } });
            setTimeout(() => supabase.removeChannel(ch), 500);
          }
        });
      } catch (_) { /* ignore */ }
      toast({ title: "Abstimmung erneut geöffnet", description: "Alle Eigentümer wurden zur erneuten Abstimmung aufgerufen." });
    },
  });


  // Reorder TOPs (swap sort_order with neighbor)
  const reorderMutation = useMutation({
    mutationFn: async ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) => {
      const idx = agendaItems.findIndex((i) => i.id === itemId);
      if (idx === -1) return;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= agendaItems.length) return;
      const a = agendaItems[idx];
      const b = agendaItems[targetIdx];
      // Two-step swap to avoid unique constraint conflicts on (meeting_id, sort_order)
      const { error: e1 } = await supabase.from("etv_agenda_items").update({ sort_order: -1 }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("etv_agenda_items").update({ sort_order: a.sort_order }).eq("id", b.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from("etv_agenda_items").update({ sort_order: b.sort_order }).eq("id", a.id);
      if (e3) throw e3;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
    },
    onError: (err: any) => toast({ title: "Fehler beim Verschieben", description: err.message, variant: "destructive" }),
  });

  const getStatusBadge = (item: AgendaItem) => {
    if (item.status === "voted") {
      return (
        <div className="flex items-center gap-1">
          <Badge className={item.result === "passed" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}>
            {item.result === "passed" ? "✓ Angenommen" : "✗ Abgelehnt"}
          </Badge>
        </div>
      );
    }
    if (item.status === "closed") {
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Unbestätigt</Badge>;
    }
    if (item.status === "voting") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Abstimmung läuft</Badge>;
    return <Badge variant="secondary">Offen</Badge>;
  };

  // Render live tally with principle awareness
  const renderLiveTally = (item: AgendaItem) => {
    const yesVotes = currentVotes.filter((v: any) => v.vote === "yes");
    const noVotes = currentVotes.filter((v: any) => v.vote === "no");
    const abstainVotes = currentVotes.filter((v: any) => v.vote === "abstain");
    const yesMea = yesVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
    const noMea = noVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
    const totalVotedMea = currentVotes.reduce((s: number, v: any) => s + (v.mea_weight || 0), 0);
    const yesSqm = yesVotes.reduce((s: number, v: any) => s + (v.sqm_weight || 0), 0);
    const noSqm = noVotes.reduce((s: number, v: any) => s + (v.sqm_weight || 0), 0);

    const currentResult = computeResult(item.voting_principle, currentVotes, item);
    const dqResult = (item.requires_double_qualified || item.double_qualified_relevant) ? checkDoubleQualified(currentVotes) : null;
    const resultLabel = currentResult === "passed" ? "Angenommen" : "Abgelehnt";

    const showMea = item.voting_principle === "mea";
    const showSqm = item.voting_principle === "sqm";

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-4 p-2 rounded bg-muted/50 text-sm flex-wrap">
          <span className="text-green-600 font-medium">
            Ja: {yesVotes.length}
            {showMea && ` (${yesMea.toFixed(2)} MEA)`}
            {showSqm && ` (${yesSqm.toFixed(1)} m²)`}
          </span>
          <span className="text-red-600 font-medium">
            Nein: {noVotes.length}
            {showMea && ` (${noMea.toFixed(2)} MEA)`}
            {showSqm && ` (${noSqm.toFixed(1)} m²)`}
          </span>
          <span className="text-muted-foreground font-medium">Enth.: {abstainVotes.length}</span>
          <span className="ml-auto font-semibold">
            Zwischenstand: <span className={currentResult === "passed" ? "text-green-600" : "text-red-600"}>{resultLabel}</span>
          </span>
        </div>
        {dqResult !== null && (
          <div className={`text-xs font-medium px-2 py-1 rounded ${dqResult ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" : "bg-muted text-muted-foreground"}`}>
            Doppelt qualifizierte Mehrheit: {dqResult ? "✓ Erreicht" : "✗ Nicht erreicht"}
          </div>
        )}
      </div>
    );
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
            {/* Show voting method / status */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {selectedItem.requires_resolution === false ? (
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 dark:text-blue-300">
                  Informativ — kein Beschluss
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  {votingPrincipleLabels[selectedItem.voting_principle] || selectedItem.voting_principle}
                </Badge>
              )}
              {selectedItem.requires_resolution !== false && selectedItem.requires_double_qualified && (
                <Badge className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  DQ erforderlich
                </Badge>
              )}
              {selectedItem.requires_resolution !== false && selectedItem.double_qualified_relevant && !selectedItem.requires_double_qualified && (
                <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 dark:text-purple-300">
                  DQ relevant
                </Badge>
              )}
              {selectedItem.category === "geschaeftsbeschluss" && (
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-300">
                  <Gavel className="h-3 w-3 mr-1" /> Geschäftsbeschluss
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedItem.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Beschreibung</p>
                <p className="text-sm whitespace-pre-wrap">{selectedItem.description}</p>
              </div>
            )}

            {/* Zugeordnete E-Mails (kompakt, aufklappbar) */}
            <AgendaItemEmailsSection agendaItemId={selectedItem.id} />

            {/* Live-editable settings: Beschluss-Toggle, Abstimmungsmethode, DQ */}
            <div className="border rounded-md p-3 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Gavel className="h-3.5 w-3.5" /> Beschluss erforderlich
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Aus = rein informativer TOP (keine Abstimmung).</p>
                </div>
                <Switch
                  checked={selectedItem.requires_resolution !== false}
                  disabled={!!activeVoteItem}
                  onCheckedChange={(v) => updateItemMutation.mutate({ itemId: selectedItem.id, patch: { requires_resolution: v } })}
                />
              </div>
              {selectedItem.requires_resolution !== false && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Abstimmungsmethode</Label>
                    <Select
                      value={selectedItem.voting_principle}
                      disabled={!!activeVoteItem}
                      onValueChange={(v) => updateItemMutation.mutate({ itemId: selectedItem.id, patch: { voting_principle: v } })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(votingPrincipleLabels).map(([k, l]) => (
                          <SelectItem key={k} value={k}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">DQ erforderlich</Label>
                    <Switch
                      checked={selectedItem.requires_double_qualified}
                      disabled={!!activeVoteItem}
                      onCheckedChange={(v) => updateItemMutation.mutate({ itemId: selectedItem.id, patch: { requires_double_qualified: v } })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">DQ relevant (Ergebnis anzeigen)</Label>
                    <Switch
                      checked={selectedItem.double_qualified_relevant}
                      disabled={!!activeVoteItem}
                      onCheckedChange={(v) => updateItemMutation.mutate({ itemId: selectedItem.id, patch: { double_qualified_relevant: v } })}
                    />
                  </div>
                </>
              )}
              {!!activeVoteItem && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">Während laufender Abstimmung gesperrt.</p>
              )}
            </div>

            {selectedItem.requires_resolution !== false && (<>
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
                  {isActive && !isClosed && !isVoted && (
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

                  {/* Live tally */}
                  {votedCount > 0 && renderLiveTally(selectedItem)}

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Manuelle Stimmabgabe:</p>
                    {presentOrRepresented.map((a: any) => {
                      const cba = a.contact_building_assignments;
                      const contact = cba?.contacts;
                      const existingVote = currentVotes.find((v: any) => v.assignment_id === a.assignment_id);
                      const meaW = getMeaWeight(a);
                      const sqmW = getSqmWeight(a);
                      const rowBg = existingVote
                        ? existingVote.vote === "yes" ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                        : existingVote.vote === "no" ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                        : "bg-muted/50 border-muted"
                        : "";
                      return (
                        <div key={a.id} className={`flex items-center justify-between py-1 px-2 rounded border ${rowBg}`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            {cba?.unit_number && <Badge variant="outline" className="text-[10px] shrink-0 px-1 py-0">E{cba.unit_number}</Badge>}
                            <span className="text-xs truncate">{getContactName(contact)}</span>
                            {a.proxy_type && (
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[9px] shrink-0 px-1 py-0">
                                v.d. {a.proxy_type === "manager" ? "Verw." : a.proxy_type === "owner" ? (() => {
                                  const proxyContact = allContacts.find((c: any) => c.contacts.id === a.proxy_contact_id);
                                  return proxyContact ? getContactName(proxyContact.contacts) : "Eig.";
                                })() : (a.proxy_external_name || "Ext.")}
                              </Badge>
                            )}
                            {(() => {
                              const instr = (a.pre_vote_instructions || {}) as Record<string, string>;
                              const w = instr[selectedItem.id];
                              if (!w) return null;
                              const label = w === "yes" ? "Weisung: Ja" : w === "no" ? "Weisung: Nein" : "Weisung: Enth.";
                              const cls = w === "yes"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : w === "no"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                : "bg-muted text-muted-foreground";
                              return (
                                <Badge className={`${cls} text-[9px] shrink-0 px-1 py-0`}>{label}</Badge>
                              );
                            })()}
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-green-600"
                              onClick={() => castVoteMutation.mutate({ itemId: selectedItem.id, assignmentId: a.assignment_id, vote: "yes", meaWeight: meaW, sqmWeight: sqmW })}>Ja</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-600"
                              onClick={() => castVoteMutation.mutate({ itemId: selectedItem.id, assignmentId: a.assignment_id, vote: "no", meaWeight: meaW, sqmWeight: sqmW })}>Nein</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => castVoteMutation.mutate({ itemId: selectedItem.id, assignmentId: a.assignment_id, vote: "abstain", meaWeight: meaW, sqmWeight: sqmW })}>Enth.</Button>
                            {existingVote && (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-orange-500"
                                onClick={() => resetVoteMutation.mutate({ itemId: selectedItem.id, assignmentId: a.assignment_id })}>↩</Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(isVoted || isClosed) && (() => {
                const isMea = selectedItem.voting_principle === "mea";
                const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                // Berechnung aus den Stimmen des ausgewählten TOPs (auch nach Bestätigung/Refresh)
                const resultVotes = selectedItemVotes.length > 0 ? selectedItemVotes : currentVotes;
                const liveMeaYes = resultVotes.filter((v: any) => v.vote === "yes").reduce((s: number, v: any) => s + (Number(v.mea_weight) || 0), 0);
                const liveMeaNo = resultVotes.filter((v: any) => v.vote === "no").reduce((s: number, v: any) => s + (Number(v.mea_weight) || 0), 0);
                const liveMeaAbs = resultVotes.filter((v: any) => v.vote === "abstain").reduce((s: number, v: any) => s + (Number(v.mea_weight) || 0), 0);
                const meaYes = liveMeaYes || Number(selectedItem.total_mea_yes || 0);
                const meaNo = liveMeaNo || Number(selectedItem.total_mea_no || 0);
                const meaAbs = liveMeaAbs || Number(selectedItem.total_mea_abstain || 0);
                const yesVal = isMea ? fmt(meaYes) : selectedItem.yes_count;
                const noVal = isMea ? fmt(meaNo) : selectedItem.no_count;
                const absVal = isMea ? fmt(meaAbs) : selectedItem.abstain_count;
                const unitLbl = isMea ? "MEA" : "Köpfe";
                return (
                <div className="space-y-2">
                  <div className="flex gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-xl font-bold text-green-600">{yesVal}</div>
                      <div className="text-xs text-muted-foreground">Ja ({unitLbl})</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-red-600">{noVal}</div>
                      <div className="text-xs text-muted-foreground">Nein ({unitLbl})</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-muted-foreground">{absVal}</div>
                      <div className="text-xs text-muted-foreground">Enthaltung ({unitLbl})</div>
                    </div>
                    {isMea && (
                      <div className="text-center text-xs text-muted-foreground self-end">
                        Köpfe: {selectedItem.yes_count} / {selectedItem.no_count} / {selectedItem.abstain_count}
                      </div>
                    )}
                  </div>
                  {isClosed && (
                    <p className="text-xs text-orange-600 font-medium">⚠ Ergebnis noch nicht bestätigt</p>
                  )}
                  {isVoted && (
                     <Badge className={selectedItem.result === "passed" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}>
                       {selectedItem.result === "passed" ? "✓ Bestätigt: Angenommen" : "✓ Bestätigt: Abgelehnt"}
                     </Badge>
                  )}
                </div>
              );})()}
            </div>
            </>)}

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
                {(() => {
                  const isMea = resultDialog.voting_principle === "mea";
                  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                  const yesVal = isMea ? fmt(Number(resultDialog.total_mea_yes || 0)) : resultDialog.yes_count;
                  const noVal = isMea ? fmt(Number(resultDialog.total_mea_no || 0)) : resultDialog.no_count;
                  const absVal = isMea ? fmt(Number(resultDialog.total_mea_abstain || 0)) : resultDialog.abstain_count;
                  const unitLbl = isMea ? "MEA" : "Köpfe";
                  return (
                    <>
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
                    </>
                  );
                })()}
                {(resultDialog.requires_double_qualified || resultDialog.double_qualified_relevant) && (
                  <div className="text-sm font-medium">
                    Doppelt qualifizierte Mehrheit: wird nach Bestätigung geprüft
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============ OVERVIEW VIEW ============
  const proxyCount = attendees.filter((a: any) => a.attendance_type === "proxy" && a.checked_in_at).length;
  const physicallyPresent = attendees.filter((a: any) => a.attendance_type === "present").length;
  const meaPercent = totalMea > 0 ? ((presentMea / totalMea) * 100) : 0;

  return (
    <div className="space-y-0">
      {/* Unified Dashboard Card */}
      <Card className="overflow-hidden">
        {/* Dashboard Header */}
        <div className="px-5 py-4 border-b border-border bg-muted/20">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Versammlungs-Cockpit
          </h2>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
          <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <UserCheck className="h-3.5 w-3.5" /> Anwesend
            </div>
            <div className="text-xl font-bold text-foreground">{physicallyPresent}<span className="text-sm font-normal text-muted-foreground"> / {totalOwners}</span></div>
            <Progress value={totalOwners > 0 ? (physicallyPresent / totalOwners) * 100 : 0} className="h-1.5" />
          </div>

          <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Users className="h-3.5 w-3.5" /> Vertreten
            </div>
            <div className="text-xl font-bold text-foreground">{proxyCount}</div>
            <p className="text-[11px] text-muted-foreground">per Vollmacht</p>
          </div>

          <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <BarChart3 className="h-3.5 w-3.5" /> MEA-Quote
            </div>
            <div className="text-xl font-bold text-foreground">{meaPercent.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">%</span></div>
            <Progress value={meaPercent} className="h-1.5" />
          </div>

          <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Shield className="h-3.5 w-3.5" /> Status
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${quorumReached ? 'bg-green-500' : 'bg-destructive'}`} />
              <span className="text-sm font-semibold text-foreground">{quorumReached ? "Beschlussfähig" : "Nicht beschlussfähig"}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{presentCount} von {totalOwners} anw./vertr.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 px-4 pb-4 flex-wrap">
          <Button size="sm" onClick={() => updateMeetingStatusMutation.mutate("in_progress")} variant="outline" className="gap-1.5">
            <Play className="h-3.5 w-3.5" /> Versammlung eröffnen
          </Button>
          <Button size="sm" onClick={() => updateMeetingStatusMutation.mutate("completed")} variant="outline" className="gap-1.5">
            <Square className="h-3.5 w-3.5" /> Versammlung schließen
          </Button>
          <ProxyInstructionsMatrix
            meetingId={meetingId}
            agendaItems={agendaItems as any}
            attendees={attendees as any}
          />
        </div>

        {/* Secret Ballot Toggle */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <Label htmlFor="secret-ballot" className="text-sm font-medium">Geheime Abstimmung</Label>
          </div>
          <Switch
            id="secret-ballot"
            checked={isSecretBallot}
            onCheckedChange={(checked) => {
              setIsSecretBallot(checked);
              toggleSecretBallotMutation.mutate(checked);
            }}
          />
        </div>

        <Separator />

        {/* Attendance Section */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setIsAttendanceCollapsed(!isAttendanceCollapsed)}
              className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              {isAttendanceCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Anwesenheit
            </button>
            <div className="flex items-center gap-2">
              {attendees.length === 0 && owners.length > 0 && (
                <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending} size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                  <RefreshCw className={`h-3 w-3 ${initMutation.isPending ? "animate-spin" : ""}`} />
                  Eigentümer laden
                </Button>
              )}
            </div>
          </div>

          {!isAttendanceCollapsed && (
            <>
              {attendees.length === 0 && owners.length === 0 && (
                <div className="py-6 text-center text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">Keine Eigentümer gefunden. Bitte unter Adressen anlegen.</p>
                </div>
              )}

              <div className="space-y-1">
                {attendees.map((a: any) => {
                  const cba = a.contact_building_assignments;
                  const contact = cba?.contacts;
                  const borderColor = a.attendance_type === "present"
                    ? "border-l-green-500"
                    : a.attendance_type === "proxy"
                    ? "border-l-blue-500"
                    : "border-l-muted-foreground/30";
                  const selfBadge = a.self_registered_at
                    ? a.attendance_type === "present"
                      ? { label: "Selbst: Anwesend", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" }
                      : a.attendance_type === "proxy"
                      ? { label: "Selbst: Vollmacht", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" }
                      : { label: "Selbst: Abwesend", cls: "bg-muted text-muted-foreground" }
                    : null;
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center justify-between py-1 px-2 rounded-md border-l-[3px] ${borderColor} hover:bg-muted/30 transition-colors`}
                    >
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-xs font-medium truncate">{getContactName(contact)}</span>
                        {cba?.unit_number && <Badge variant="outline" className="text-[9px] shrink-0 px-1 py-0">{cba.unit_number}</Badge>}
                        {selfBadge && (
                          <Badge
                            className={`${selfBadge.cls} text-[9px] shrink-0 px-1 py-0`}
                            title={`Selbst gemeldet am ${format(new Date(a.self_registered_at), "dd.MM.yyyy HH:mm", { locale: de })}`}
                          >
                            {selfBadge.label}
                          </Badge>
                        )}
                        {a.proxy_type && (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[9px] shrink-0 px-1 py-0">
                            v.d. {a.proxy_type === "manager" ? "Verwalter" : a.proxy_type === "owner" ? (() => {
                              const proxyContact = allContacts.find((c: any) => c.contacts.id === a.proxy_contact_id);
                              return proxyContact ? getContactName(proxyContact.contacts) : "Eigentümer";
                            })() : (a.proxy_external_name || "Extern")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={a.attendance_type === "present" || (a.attendance_type === "proxy" && !!a.checked_in_at)}
                          onCheckedChange={(checked) => checkInMutation.mutate({ id: a.id, present: checked })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <Separator />

        {/* Agenda Section */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Tagesordnung</h3>
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setShowProceduralDialog(true)}>
              <Gavel className="h-3 w-3" />
              Geschäftsbeschluss
            </Button>
          </div>

          {agendaItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Keine TOPs vorhanden. Bitte zuerst unter "Vorbereitung" anlegen.
            </p>
          )}

          <div className="space-y-1">
            {agendaItems.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-muted/30 cursor-pointer transition-colors group"
                onClick={() => setSelectedTopId(item.id)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xs font-bold text-primary whitespace-nowrap">TOP {idx + 1}</span>
                  <span className="text-sm font-medium truncate">{item.title}</span>
                  <div className="hidden md:flex items-center gap-1.5">
                    {item.requires_double_qualified && (
                      <Badge className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-1.5 py-0">DQ</Badge>
                    )}
                    {item.category === "geschaeftsbeschluss" && (
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 px-1.5 py-0">
                        <Gavel className="h-2.5 w-2.5 mr-0.5" /> GB
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-50 group-hover:opacity-100"
                    disabled={idx === 0 || reorderMutation.isPending}
                    onClick={() => reorderMutation.mutate({ itemId: item.id, direction: "up" })}
                    title="Nach oben"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-50 group-hover:opacity-100"
                    disabled={idx === agendaItems.length - 1 || reorderMutation.isPending}
                    onClick={() => reorderMutation.mutate({ itemId: item.id, direction: "down" })}
                    title="Nach unten"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  {getStatusBadge(item)}
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>


      {/* Geschäftsbeschluss Dialog */}
      <Dialog open={showProceduralDialog} onOpenChange={setShowProceduralDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              Geschäftsbeschluss einfügen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Titel *</Label>
              <Input
                placeholder="z.B. Änderung der Abstimmungsmethode"
                value={proceduralTitle}
                onChange={(e) => setProceduralTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beschlusstext</Label>
              <Textarea
                placeholder="Die Versammlung beschließt..."
                value={proceduralResolution}
                onChange={(e) => setProceduralResolution(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Abstimmungsmethode</Label>
              <Select value={proceduralPrinciple} onValueChange={setProceduralPrinciple}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="headcount">Kopfprinzip</SelectItem>
                  <SelectItem value="mea">MEA (Wertprinzip)</SelectItem>
                  <SelectItem value="sqm">Quadratmeter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={proceduralAutoAccept} onCheckedChange={setProceduralAutoAccept} />
              <Label className="text-sm cursor-pointer">Automatisch als angenommen eintragen</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {proceduralAutoAccept
                ? "Der Beschluss wird direkt als angenommen eingetragen (z.B. Verfahrensbeschlüsse)."
                : "Der Beschluss wird als offener TOP eingefügt und kann regulär abgestimmt werden."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProceduralDialog(false)}>Abbrechen</Button>
            <Button onClick={() => addProceduralMutation.mutate()} disabled={!proceduralTitle || addProceduralMutation.isPending} className="gap-1">
              <Plus className="h-4 w-4" /> Einfügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
