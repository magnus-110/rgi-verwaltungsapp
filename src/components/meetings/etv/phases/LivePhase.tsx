import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronDown, ChevronsLeft, ChevronsRight, Maximize2, Minimize2, FileText, Gavel, GripVertical, ListPlus, Loader2, Lock, Play, RotateCcw, Search, Settings2, Square, Trash2, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatHeads, getHeadWeight, normalizeVotingPrinciple } from "@/lib/etvHeadcount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { AgendaItemEmailsSection } from "../../AgendaItemEmailsSection";
import { AttendancePanel } from "../AttendancePanel";
import { EtvCard, Segmented } from "../ui";
import { contactName, contactSortName, shareOf, summarize, useAttendees } from "../useAttendees";
import { AddTopDialog, ProceduralDialog } from "./LiveDialogs";

interface Props {
  meeting: any;
  onGoToProtocol: () => void;
}

type Vote = "yes" | "no" | "abstain";
type Mode = "gegen" | "einzeln";
type Filter = "alle" | "offen" | Vote;

const PRINCIPLE_LABEL: Record<string, string> = { headcount: "Kopfprinzip", mea: "Nach Anteilen (MEA)", sqm: "Nach Wohnfläche" };
const VOTE_LOOK: Record<Vote, { label: string; on: string }> = {
  yes: { label: "Ja", on: "bg-emerald-700 text-white" },
  no: { label: "Nein", on: "bg-red-700 text-white" },
  abstain: { label: "Enth.", on: "bg-slate-600 text-white" },
};

const isDecided = (s?: string | null) => s === "voted" || s === "closed";

export const LivePhase = ({ meeting, onGoToProtocol }: Props) => {
  const meetingId = meeting.id as string;
  const buildingId = meeting.building_id as string;
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: attendees = [] } = useAttendees(meetingId);
  const { data: items = [] } = useQuery({
    queryKey: ["etv-agenda-items-live", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("etv_agenda_items").select("*").eq("meeting_id", meetingId).order("sort_order");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const [selId, setSelId] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [procOpen, setProcOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [motion, setMotion] = useState("");
  const [notes, setNotes] = useState("");
  const [savedHint, setSavedHint] = useState<string | null>(null);
  // Versammlungsmodus: Vollbild ohne Navigation links
  const [focusMode, setFocusMode] = useState(false);
  // Tagesordnung eingeklappt (wird im Browser gemerkt)
  const [agendaCollapsed, setAgendaCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("etv-live-agenda-collapsed") === "1"; } catch { return false; }
  });
  const toggleAgenda = () => {
    setAgendaCollapsed((v) => {
      try { localStorage.setItem("etv-live-agenda-collapsed", v ? "0" : "1"); } catch { /* egal */ }
      return !v;
    });
  };
  const enterFocus = () => {
    setFocusMode(true);
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* egal */ }
  };
  const leaveFocus = () => {
    setFocusMode(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch { /* egal */ }
  };
  useEffect(() => {
    if (!focusMode) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [focusMode]);
  useEffect(() => () => { try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch { /* egal */ } }, []);

  // Standard-Auswahl: erster offener Punkt mit Beschluss
  useEffect(() => {
    if (selId && items.some((i) => i.id === selId)) return;
    const next = items.find((i) => i.status === "voting") || items.find((i) => i.requires_resolution !== false && !isDecided(i.status)) || items[0];
    if (next) setSelId(next.id);
  }, [items, selId]);

  const item = items.find((i) => i.id === selId) || null;
  const idx = item ? items.findIndex((i) => i.id === item.id) : -1;

  useEffect(() => {
    setDesc(item?.description || "");
    setMotion(item?.resolution_text || "");
    setNotes(item?.admin_notes || "");
    setQ("");
    setFilter("alle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const { data: votes = [] } = useQuery({
    queryKey: ["etv-votes-live", selId],
    enabled: !!selId,
    queryFn: async () => {
      const { data, error } = await supabase.from("etv_votes").select("*").eq("agenda_item_id", selId!);
      if (error) throw error;
      return data || [];
    },
  });

  // Live-Stimmen (z. B. aus dem Eigentümerportal) direkt in den Cache übernehmen
  useEffect(() => {
    if (!selId) return;
    const key = ["etv-votes-live", selId];
    const channel = supabase
      .channel(`votes-${selId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "etv_votes", filter: `agenda_item_id=eq.${selId}` }, (payload: any) => {
        qc.setQueryData<any[]>(key, (prev = []) => {
          const rows = [...prev];
          if (payload.eventType === "DELETE") {
            const old = payload.old || {};
            return rows.filter((v) => v.id !== old.id && v.assignment_id !== old.assignment_id);
          }
          const rec = payload.new;
          if (!rec) return rows;
          const i = rows.findIndex((v) => v.assignment_id === rec.assignment_id);
          if (i >= 0) rows[i] = { ...rows[i], ...rec }; else rows.push(rec);
          return rows;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selId, qc]);

  const sum = summarize(attendees);
  const isIn = (a: any) => a.attendance_type === "present" || (a.attendance_type === "proxy" && !!a.checked_in_at);
  const eligible = useMemo(() => attendees.filter(isIn), [attendees]);
  const totalMea = useMemo(() => attendees.reduce((s: number, a: any) => s + shareOf(a, "mea"), 0), [attendees]);
  const voteBy = useMemo(() => new Map<string, any>(votes.map((v: any) => [v.assignment_id, v])), [votes]);

  const principle = normalizeVotingPrinciple(item?.voting_principle);
  const weightOf = (a: any) => (principle === "mea" ? shareOf(a, "mea") : principle === "sqm" ? shareOf(a, "sqm") : getHeadWeight(a));
  const mode: Mode = (item && modes[item.id]) || "gegen";
  const voting = item?.status === "voting";
  const decided = isDecided(item?.status);
  const needsVote = item?.requires_resolution !== false;

  const effective = (a: any): { vote: Vote | null; implied: boolean } => {
    const v = voteBy.get(a.assignment_id);
    if (v) return { vote: v.vote as Vote, implied: false };
    const w = item ? a.pre_vote_instructions?.[item.id] : null;
    if (voting && w && ["yes", "no", "abstain"].includes(w) && !a.pre_vote_instruction_notes?.[item!.id]) return { vote: w as Vote, implied: true };
    if (voting && mode === "gegen") return { vote: "yes", implied: true };
    return { vote: null, implied: false };
  };

  const tally = useMemo(() => {
    const t = { yes: 0, no: 0, abstain: 0, open: 0, yesN: 0, noN: 0, abstainN: 0, openN: 0, yesMea: 0 };
    for (const a of eligible) {
      const { vote } = effective(a);
      const w = weightOf(a);
      if (!vote) { t.open += w; t.openN++; continue; }
      t[vote] += w;
      (t as any)[`${vote}N`]++;
      if (vote === "yes") t.yesMea += shareOf(a, "mea");
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, voteBy, voting, mode, principle]);

  const passes = tally.yes > tally.no;
  const dqRelevant = !!(item?.requires_double_qualified || item?.double_qualified_relevant);
  const yesHeads = eligible.filter((a: any) => effective(a).vote === "yes").reduce((s: number, a: any) => s + getHeadWeight(a), 0);
  const givenHeads = eligible.filter((a: any) => { const v = effective(a).vote; return v === "yes" || v === "no"; }).reduce((s: number, a: any) => s + getHeadWeight(a), 0);
  const dqOk = givenHeads > 0 && yesHeads > (givenHeads * 2) / 3 && totalMea > 0 && tally.yesMea > totalMea / 2;
  const fmt = (n: number) => (principle === "headcount" ? formatHeads(n) : n.toLocaleString("de-DE", { maximumFractionDigits: principle === "mea" ? 3 : 1 }));
  const unit = principle === "mea" ? "MEA" : principle === "sqm" ? "m²" : "Köpfe";

  const invalidateItems = () => {
    qc.invalidateQueries({ queryKey: ["etv-agenda-items-live", meetingId] });
    qc.invalidateQueries({ queryKey: ["etv-meeting-stats", meetingId] });
  };
  const broadcast = (payload: any) => {
    try {
      const ch = supabase.channel(`meeting-broadcast-${meetingId}`);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          ch.send({ type: "broadcast", event: "voting-changed", payload });
          setTimeout(() => supabase.removeChannel(ch), 500);
        }
      });
    } catch { /* egal */ }
  };

  const voteRow = (a: any, vote: Vote) => ({
    agenda_item_id: item!.id, assignment_id: a.assignment_id, vote,
    mea_weight: shareOf(a, "mea"), sqm_weight: shareOf(a, "sqm"), head_weight: getHeadWeight(a),
    is_manual_override: true, voted_at: new Date().toISOString(),
  });

  // --- Meeting-Status ---------------------------------------------------
  const setMeetingStatus = useMutation({
    mutationFn: async (status: "in_progress" | "completed") => {
      const patch: any = { status, quorum_reached: eligible.length > 0 };
      if (status === "completed") patch.ended_at = new Date().toISOString();
      if (status === "in_progress") patch.ended_at = null;
      const { error } = await (supabase as any).from("etv_meetings").update(patch).eq("id", meetingId);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ["etv-meeting", meetingId] });
      qc.invalidateQueries({ queryKey: ["etv-meetings"] });
      toast({ title: status === "in_progress" ? "Versammlung eröffnet" : "Versammlung beendet" });
      if (status === "completed") onGoToProtocol();
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  // --- Abstimmung -------------------------------------------------------
  const startVoting = useMutation({
    mutationFn: async () => {
      if (!item) return 0;
      if (meeting.status !== "in_progress" && meeting.status !== "completed") {
        await (supabase as any).from("etv_meetings").update({ status: "in_progress", ended_at: null }).eq("id", meetingId);
        qc.invalidateQueries({ queryKey: ["etv-meeting", meetingId] });
      }
      const { error } = await supabase.from("etv_agenda_items").update({ status: "voting", result: null }).eq("id", item.id);
      if (error) throw error;
      // Vorab-Weisungen übernehmen (nicht bei Weisungen im Wortlaut – die bewertet die Versammlungsleitung)
      const rows = eligible
        .filter((a: any) => {
          const w = a.pre_vote_instructions?.[item.id];
          return ["yes", "no", "abstain"].includes(w) && !a.pre_vote_instruction_notes?.[item.id] && !voteBy.has(a.assignment_id);
        })
        .map((a: any) => ({ ...voteRow(a, a.pre_vote_instructions[item.id]), is_manual_override: false }));
      if (rows.length) {
        const { error: ve } = await supabase.from("etv_votes").upsert(rows as any, { onConflict: "agenda_item_id,assignment_id" });
        if (ve) throw ve;
      }
      return rows.length;
    },
    onSuccess: (n) => {
      invalidateItems();
      qc.invalidateQueries({ queryKey: ["etv-votes-live", selId] });
      broadcast({ itemId: selId });
      toast({ title: "Abstimmung läuft", description: n ? `${n} Weisung${n === 1 ? "" : "en"} aus Vollmachten übernommen` : undefined });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const cast = useMutation({
    retry: (n, err: any) => n < 2 && /timeout|statement|timed out/i.test(err?.message || ""),
    mutationFn: async ({ a, vote }: { a: any; vote: Vote | null }) => {
      if (vote === null) {
        const { error } = await supabase.from("etv_votes").delete().eq("agenda_item_id", item!.id).eq("assignment_id", a.assignment_id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("etv_votes").upsert(voteRow(a, vote) as any, { onConflict: "agenda_item_id,assignment_id" });
      if (error) throw error;
    },
    onMutate: async ({ a, vote }) => {
      const key = ["etv-votes-live", item!.id];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<any[]>(key) || [];
      const next = prev.filter((v) => v.assignment_id !== a.assignment_id);
      if (vote) next.push(voteRow(a, vote));
      qc.setQueryData(key, next);
      return { prev, key };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      toast({ title: "Stimme nicht gespeichert", description: e?.message, variant: "destructive" });
    },
  });

  const decide = useMutation({
    mutationFn: async () => {
      if (!item) return;
      // Gegenprobe: alle ohne Eintrag stimmen mit Ja
      if (mode === "gegen") {
        const rows = eligible.filter((a: any) => !voteBy.has(a.assignment_id)).map((a: any) => voteRow(a, (effective(a).vote || "yes") as Vote));
        if (rows.length) {
          const { error } = await supabase.from("etv_votes").upsert(rows as any, { onConflict: "agenda_item_id,assignment_id" });
          if (error) throw error;
        }
      }
      const { data: fresh, error: fe } = await supabase.from("etv_votes").select("*").eq("agenda_item_id", item.id);
      if (fe) throw fe;
      const vs = fresh || [];
      const of = (v: Vote) => vs.filter((x: any) => x.vote === v);
      const meaSum = (arr: any[]) => arr.reduce((s, x) => s + (Number(x.mea_weight) || 0), 0);
      const sqmSum = (arr: any[]) => arr.reduce((s, x) => s + (Number(x.sqm_weight) || 0), 0);
      const headSum = (arr: any[]) => arr.reduce((s, x) => s + getHeadWeight(x), 0);
      const w = principle === "mea" ? meaSum : principle === "sqm" ? sqmSum : headSum;
      const y = w(of("yes")), n = w(of("no"));
      const result = y === 0 && n === 0 ? "failed" : y > n ? "passed" : "failed";
      const { error } = await supabase.from("etv_agenda_items").update({
        status: "voted", result,
        yes_count: headSum(of("yes")), no_count: headSum(of("no")), abstain_count: headSum(of("abstain")),
        total_mea_voted: meaSum(vs), total_mea_yes: meaSum(of("yes")), total_mea_no: meaSum(of("no")), total_mea_abstain: meaSum(of("abstain")),
      } as any).eq("id", item.id);
      if (error) throw error;
      return result;
    },
    onSuccess: (result) => {
      invalidateItems();
      qc.invalidateQueries({ queryKey: ["etv-votes-live", selId] });
      toast({ title: result === "passed" ? "Beschluss angenommen" : "Beschluss abgelehnt" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const reopen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("etv_agenda_items").update({ status: "voting", result: null }).eq("id", item!.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateItems(); broadcast({ itemId: selId, reopened: true }); toast({ title: "Wieder geöffnet", description: "Stimmen bleiben erhalten und können korrigiert werden." }); },
  });

  const resetTop = async (ids: string[]) => {
    for (const id of ids) {
      await supabase.from("etv_votes").delete().eq("agenda_item_id", id);
      await supabase.from("etv_agenda_items").update({
        status: "open", result: null, yes_count: 0, no_count: 0, abstain_count: 0,
        total_mea_voted: 0, total_mea_yes: 0, total_mea_no: 0, total_mea_abstain: 0,
      } as any).eq("id", id);
    }
    invalidateItems();
    qc.invalidateQueries({ queryKey: ["etv-votes-live"] });
  };

  const doReset = async (all: boolean) => {
    try {
      const ids = all
        ? items.filter((i) => i.category !== "geschaeftsbeschluss" && (i.status === "voting" || isDecided(i.status))).map((i) => i.id)
        : item ? [item.id] : [];
      await resetTop(ids);
      toast({ title: all ? "Alle Abstimmungen zurückgesetzt" : "Abstimmung zurückgesetzt" });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    }
    setResetOpen(false);
  };

  const deleteTop = async () => {
    if (!item) return;
    const { error } = await supabase.from("etv_agenda_items").delete().eq("id", item.id);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    const remaining = items.filter((i) => i.id !== item.id);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].sort_order !== i + 1) await supabase.from("etv_agenda_items").update({ sort_order: i + 1 }).eq("id", remaining[i].id);
    }
    setSelId(null);
    setDeleteOpen(false);
    invalidateItems();
    toast({ title: "Punkt gelöscht" });
  };

  const onDragEnd = async (r: DropResult) => {
    if (!r.destination || r.destination.index === r.source.index) return;
    const next = Array.from(items);
    const [moved] = next.splice(r.source.index, 1);
    next.splice(r.destination.index, 0, moved);
    const key = ["etv-agenda-items-live", meetingId];
    const prev = qc.getQueryData<any[]>(key);
    qc.setQueryData(key, next.map((it, i) => ({ ...it, sort_order: i + 1 })));
    const { error } = await supabase.from("etv_agenda_items").upsert(next.map((it, i) => ({ ...it, sort_order: i + 1 })) as any, { onConflict: "id" });
    if (error) {
      qc.setQueryData(key, prev);
      toast({ title: "Reihenfolge nicht gespeichert", description: error.message, variant: "destructive" });
    }
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
  };

  const saveField = async (field: "description" | "resolution_text" | "admin_notes", value: string) => {
    if (!item) return;
    if ((item[field] || "") === value) return;
    const { error } = await supabase.from("etv_agenda_items").update({ [field]: value.trim() ? value : null } as any).eq("id", item.id);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    invalidateItems();
    setSavedHint(field);
    setTimeout(() => setSavedHint(null), 1800);
  };

  const updateItem = async (patch: Record<string, any>) => {
    const { error } = await supabase.from("etv_agenda_items").update(patch as any).eq("id", item!.id);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    invalidateItems();
  };

  const openAttachment = async (path: string) => {
    for (const bucket of ["building-files", "invoices"]) {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
      if (data?.signedUrl) { window.open(data.signedUrl, "_blank", "noopener,noreferrer"); return; }
    }
    toast({ title: "Dokument konnte nicht geöffnet werden", variant: "destructive" });
  };

  // --- Liste der Stimmen ---------------------------------------------------
  const counts = useMemo(() => {
    const c = { alle: eligible.length, offen: 0, yes: 0, no: 0, abstain: 0 } as Record<Filter, number>;
    eligible.forEach((a: any) => { const v = effective(a).vote; c[v || "offen"]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, voteBy, voting, mode]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return eligible.filter((a: any) => {
      const cba = a.contact_building_assignments;
      if (needle) {
        const hit = contactName(cba?.contacts).toLowerCase().includes(needle) || String(cba?.unit_number || "").toLowerCase().includes(needle);
        if (!hit) return false;
      }
      if (filter === "alle") return true;
      const v = effective(a).vote;
      return filter === "offen" ? !v : v === filter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, q, filter, voteBy, voting, mode]);

  const proxyName = (a: any) => {
    if (a.proxy_type === "manager") return "Verwaltung";
    if (a.proxy_type === "owner") {
      const p = attendees.find((x: any) => x.contact_building_assignments?.contacts?.id === a.proxy_contact_id);
      return p ? contactName(p.contact_building_assignments.contacts) : "Eigentümer";
    }
    return a.proxy_external_name || "andere Person";
  };

  const wortlaut = item ? attendees.filter((a: any) => a.pre_vote_instruction_notes?.[item.id]) : [];
  const live = meeting.status === "in_progress";
  const ended = meeting.status === "completed" || !!meeting.ended_at;

  return (
    <div className={cn("space-y-5", focusMode && "fixed inset-0 z-50 overflow-y-auto bg-background p-4 md:p-6")}>
      {/* Kopfleiste */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white px-5 py-3.5 shadow-sm dark:bg-card">
        <div className="flex items-center gap-3.5">
          {focusMode && <span className="max-w-[260px] truncate text-[15px] font-semibold">{meeting.title}</span>}
          {live ? (
            <span className="flex items-center gap-2 rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-bold tracking-wider text-red-700 dark:bg-red-950/40 dark:text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />LIVE</span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">{ended ? "Beendet" : "Noch nicht eröffnet"}</span>
          )}
          <span className="hidden text-sm text-muted-foreground sm:inline">{items.length} Punkte · {items.filter((i) => i.status === "voted").length} entschieden</span>
        </div>
        <div className="flex gap-6 text-sm">
          <span><strong className="text-lg tabular-nums">{sum.present}</strong> <span className="text-muted-foreground">anwesend</span></span>
          <span><strong className="text-lg tabular-nums">{sum.proxies}</strong> <span className="text-muted-foreground">per Vollmacht</span></span>
          <span><strong className="text-lg tabular-nums">{sum.absent}</strong> <span className="text-muted-foreground">fehlen</span></span>
        </div>
        <div className="flex flex-wrap gap-2">
          {focusMode ? (
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={leaveFocus}>
              <Minimize2 className="h-4 w-4" /> Versammlungsmodus verlassen
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-9 gap-1.5 border-primary text-primary hover:text-primary" onClick={enterFocus}>
              <Maximize2 className="h-4 w-4" /> Versammlungsmodus
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setAttendanceOpen(true)}>
            <Users className="h-4 w-4" /> Anwesenheit
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-red-700 hover:text-red-800 dark:text-red-400" onClick={() => setResetOpen(true)}>
            <RotateCcw className="h-4 w-4" /> Zurücksetzen …
          </Button>
          <SecretBallotToggle meetingId={meetingId} value={meeting.is_secret_ballot ?? true} />
          {!live && !ended && (
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setMeetingStatus.mutate("in_progress")}><Play className="h-4 w-4" /> Versammlung eröffnen</Button>
          )}
          {live && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => confirm("Versammlung beenden? Danach geht es zum Protokoll.") && setMeetingStatus.mutate("completed")}>
              <Square className="h-4 w-4" /> Versammlung beenden
            </Button>
          )}
          {ended && <Button size="sm" className="h-9" onClick={onGoToProtocol}>Zum Protokoll</Button>}
        </div>
      </div>

      {attendees.length === 0 && (
        <EtvCard className="flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50/60 px-5 py-4 dark:bg-amber-950/30">
          <span className="text-sm">Noch keine Teilnehmerliste. Bitte zuerst die Eigentümer laden und die Anwesenheit abhaken.</span>
          <Button size="sm" onClick={() => setAttendanceOpen(true)}>Anwesenheit öffnen</Button>
        </EtvCard>
      )}

      <div className={cn("grid grid-cols-1 items-start gap-5", agendaCollapsed ? "lg:grid-cols-[64px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]")}>
        {/* Tagesordnung */}
        {agendaCollapsed ? (
          <EtvCard className="overflow-hidden lg:sticky lg:top-4">
            <button type="button" onClick={toggleAgenda} title="Tagesordnung ausklappen" aria-label="Tagesordnung ausklappen"
              className="flex w-full items-center justify-center border-b py-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
              <ChevronsRight className="h-4 w-4" />
            </button>
            <ol className="flex max-h-[75vh] flex-wrap gap-1.5 overflow-y-auto p-2 lg:flex-col lg:flex-nowrap lg:items-center">
              {items.map((it, i) => {
                const on = it.id === selId;
                const look = it.status === "voted" ? (it.result === "passed" ? "bg-emerald-700 text-white" : "bg-red-700 text-white")
                  : it.status === "voting" ? "bg-primary text-primary-foreground" : on ? "bg-primary/10 text-primary" : "bg-muted text-foreground/80";
                return (
                  <li key={it.id}>
                    <button type="button" onClick={() => setSelId(it.id)} title={it.title}
                      className={cn("flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums transition-shadow", look, on && "ring-2 ring-primary ring-offset-2 ring-offset-card")}>
                      {i + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
          </EtvCard>
        ) : (
        <EtvCard className="overflow-hidden lg:sticky lg:top-4">
          <div className="flex items-center justify-between border-b px-4 py-3.5">
            <h2 className="text-[17px] font-semibold">Tagesordnung</h2>
            <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Tagesordnung einklappen" title="Tagesordnung einklappen" onClick={toggleAgenda}><ChevronsLeft className="h-4 w-4" /></Button>
            <Popover>
              <PopoverTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Punkt hinzufügen"><ListPlus className="h-4 w-4" /></Button></PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5">
                <button type="button" className="w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted" onClick={() => setAddOpen(true)}>Punkt einfügen</button>
                <button type="button" className="w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted" onClick={() => setProcOpen(true)}>Geschäftsordnungsbeschluss</button>
              </PopoverContent>
            </Popover>
            </div>
          </div>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="live-agenda">
              {(prov) => (
                <ol ref={prov.innerRef} {...prov.droppableProps} className="max-h-[70vh] overflow-y-auto">
                  {items.map((it, i) => {
                    const on = it.id === selId;
                    const dot = it.status === "voted" ? (it.result === "passed" ? "bg-emerald-700 text-white" : "bg-red-700 text-white")
                      : it.status === "voting" ? "bg-primary text-primary-foreground" : it.requires_resolution === false ? "bg-muted-foreground/30" : "bg-muted";
                    const mark = it.status === "voted" ? (it.result === "passed" ? "✓" : "✕") : "";
                    return (
                      <Draggable key={it.id} draggableId={it.id} index={i}>
                        {(dp, snap) => (
                          <li ref={dp.innerRef} {...dp.draggableProps} className={cn(snap.isDragging && "rounded-lg bg-card shadow-lg ring-1 ring-primary/30")}>
                            <div className={cn("grid w-full grid-cols-[14px_22px_minmax(0,1fr)_18px] items-center gap-2 border-t px-3 py-2.5 transition-colors hover:bg-muted/40", on && "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]")}>
                              <span {...dp.dragHandleProps} aria-label="Ziehen zum Verschieben" title="Ziehen zum Verschieben" className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground"><GripVertical className="h-3.5 w-3.5" /></span>
                              <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                              <button type="button" onClick={() => setSelId(it.id)} className={cn("truncate text-left text-sm", on ? "font-semibold" : "font-medium")}>
                                {it.category === "geschaeftsbeschluss" && <Gavel className="mr-1 inline h-3 w-3 text-amber-600" />}
                                {it.title}
                              </button>
                              <span className={cn("flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-bold", dot)}>{mark}</span>
                            </div>
                          </li>
                        )}
                      </Draggable>
                    );
                  })}
                  {prov.placeholder}
                  {items.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">Keine Punkte. Bitte in der Planung anlegen.</li>}
                </ol>
              )}
            </Droppable>
          </DragDropContext>
        </EtvCard>
        )}

        {/* Aktueller Punkt */}
        {item ? (
          <EtvCard className="space-y-5 p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="text-[13px] font-semibold text-muted-foreground">
                  TOP {idx + 1} · {needsVote ? `${PRINCIPLE_LABEL[principle] || principle}${dqRelevant ? " · doppelt qualifiziert" : " · einfache Mehrheit"}` : "nur Information"}
                </div>
                <h2 className="text-2xl font-semibold leading-tight tracking-tight">{item.title}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",
                  item.status === "voted" ? (item.result === "passed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300")
                  : voting ? "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300" : "bg-muted text-muted-foreground")}>
                  {item.status === "voted" ? (item.result === "passed" ? "Angenommen" : "Abgelehnt") : voting ? "Abstimmung läuft" : needsVote ? "Offen" : "Information"}
                </span>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Punkt löschen" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>

            {wortlaut.length > 0 && (
              <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-[13px] dark:border-amber-800 dark:bg-amber-950/30">
                <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> Weisung im Wortlaut – bitte selbst bewerten</p>
                {wortlaut.map((a: any) => (
                  <p key={a.id} className="text-amber-900 dark:text-amber-200">
                    <strong>{a.contact_building_assignments?.unit_number ? `${a.contact_building_assignments.unit_number} – ` : ""}{contactName(a.contact_building_assignments?.contacts)}:</strong>{" "}
                    <span className="whitespace-pre-line">{a.pre_vote_instruction_notes[item.id]}</span>
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="live-desc" className="flex items-center justify-between">Beschreibung {savedHint === "description" && <span className="text-xs font-normal text-emerald-700">gespeichert</span>}</Label>
                <Textarea id="live-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => saveField("description", desc)} />
              </div>
              {needsVote && (
                <div className="space-y-1.5">
                  <Label htmlFor="live-motion" className="flex items-center justify-between">Beschlussantrag {savedHint === "resolution_text" && <span className="text-xs font-normal text-emerald-700">gespeichert</span>}</Label>
                  <Textarea id="live-motion" rows={4} value={motion} onChange={(e) => setMotion(e.target.value)} onBlur={() => saveField("resolution_text", motion)} />
                </div>
              )}
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">Texte sind jederzeit änderbar – auch nach dem Feststellen. Sie werden beim Verlassen des Feldes gespeichert und ins Protokoll übernommen.</p>

            {(item.attachment_paths?.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {item.attachment_paths.map((p: string) => (
                  <Button key={p} size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openAttachment(p)}>
                    <FileText className="h-3.5 w-3.5" /><span className="max-w-[220px] truncate">{(p.split("/").pop() || "Dokument").replace(/^\d+-/, "")}</span>
                  </Button>
                ))}
              </div>
            )}
            <AgendaItemEmailsSection agendaItemId={item.id} />

            {/* Regeln */}
            <div className="rounded-xl border">
              <button type="button" onClick={() => setRulesOpen(!rulesOpen)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] font-semibold">
                <span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-muted-foreground" /> Abstimmungsregeln für diesen Punkt</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", rulesOpen && "rotate-180")} />
              </button>
              {rulesOpen && (
                <div className="grid gap-3 border-t px-4 py-3.5 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 text-sm">Mit Beschluss <Switch checked={needsVote} disabled={voting} onCheckedChange={(v) => updateItem({ requires_resolution: v })} /></label>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    Abstimmung
                    <Select value={principle} disabled={voting} onValueChange={(v) => updateItem({ voting_principle: v })}>
                      <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(PRINCIPLE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center justify-between gap-3 text-sm">Doppelt qualifiziert nötig <Switch checked={!!item.requires_double_qualified} disabled={voting} onCheckedChange={(v) => updateItem({ requires_double_qualified: v })} /></label>
                  <label className="flex items-center justify-between gap-3 text-sm">Doppelte Qualifizierung anzeigen <Switch checked={!!item.double_qualified_relevant} disabled={voting} onCheckedChange={(v) => updateItem({ double_qualified_relevant: v })} /></label>
                </div>
              )}
            </div>

            {/* Abstimmung */}
            {needsVote && (
              <div className="overflow-hidden rounded-2xl border">
                <div className="space-y-3 border-b bg-white px-4 py-3.5 dark:bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Segmented
                      value={mode}
                      onChange={(m) => { setModes((p) => ({ ...p, [item.id]: m })); setFilter("alle"); }}
                      options={[{ value: "gegen", label: "Gegenprobe" }, { value: "einzeln", label: "Einzeln erfassen" }]}
                    />
                    <span className="max-w-[460px] text-[13px] leading-snug text-muted-foreground">
                      {mode === "gegen"
                        ? "Alle zählen als Ja. Frag „Wer ist dagegen? Wer enthält sich?“ und markiere nur diese."
                        : "Jede Stimme einzeln eintragen. Wer nichts hat, zählt nicht mit."}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 items-center gap-2.5 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder Wohnungsnummer …" className="h-10 bg-background pl-9" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {([["alle", "Alle"], ...(mode === "einzeln" ? [["offen", "Offen"]] : []), ["yes", "Ja"], ["no", "Nein"], ["abstain", "Enth."]] as [Filter, string][]).map(([k, l]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setFilter(k)}
                          className={cn("h-[34px] rounded-full border px-3 text-[13px] font-semibold", filter === k ? "border-primary bg-primary/10 text-primary" : "bg-background")}
                        >
                          {l} <span className="font-medium opacity-70">{counts[k]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {!voting && !decided && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5">
                    <span className="text-sm text-muted-foreground">
                      {eligible.length === 0 ? "Noch niemand als anwesend abgehakt." : `${eligible.length} stimmberechtigte Einheiten anwesend oder vertreten.`}
                    </span>
                    <Button onClick={() => startVoting.mutate()} disabled={startVoting.isPending || eligible.length === 0} className="gap-1.5">
                      {startVoting.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Abstimmung starten
                    </Button>
                  </div>
                )}

                <div className="max-h-[460px] overflow-y-auto">
                  {rows.map((a: any) => {
                    const cba = a.contact_building_assignments;
                    const { vote, implied } = effective(a);
                    const instr = a.pre_vote_instructions?.[item.id];
                    const explicit = voteBy.get(a.assignment_id);
                    return (
                      <div
                        key={a.id}
                        className={cn("grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-1.5 last:border-0 md:grid-cols-[64px_minmax(0,1.2fr)_minmax(0,1fr)_auto]",
                          explicit?.vote === "no" && "bg-red-50/60 dark:bg-red-950/20", explicit?.vote === "abstain" && "bg-muted/40")}
                      >
                        <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">{cba?.unit_number || "–"}</span>
                        <span className="truncate text-sm font-medium">{contactSortName(cba?.contacts)}</span>
                        <span className="hidden truncate text-xs text-muted-foreground md:block">
                          {a.attendance_type === "proxy" ? `Vollmacht an ${proxyName(a)}` : "anwesend"}
                          {instr && <span className="ml-1 font-semibold text-blue-700 dark:text-blue-400">· W {instr === "yes" ? "Ja" : instr === "no" ? "Nein" : "Enth."}</span>}
                          {getHeadWeight(a) === 0 && principle === "headcount" && " · zählt nicht extra"}
                          {explicit && !explicit.is_manual_override && explicit.voted_by_user_id && " · selbst abgestimmt"}
                        </span>
                        <span role="group" aria-label={`Stimme ${contactName(cba?.contacts)}`} className="flex rounded-lg bg-muted p-0.5">
                          {(["yes", "no", "abstain"] as Vote[]).map((v) => {
                            const on = vote === v;
                            return (
                              <button
                                key={v}
                                type="button"
                                disabled={!voting}
                                aria-pressed={on}
                                onClick={() => cast.mutate({ a, vote: explicit?.vote === v ? null : v })}
                                className={cn("h-8 min-w-[44px] rounded-md px-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed",
                                  on ? (implied ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" : VOTE_LOOK[v].on) : "text-muted-foreground hover:text-foreground")}
                              >
                                {VOTE_LOOK[v].label}
                              </button>
                            );
                          })}
                        </span>
                      </div>
                    );
                  })}
                  {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">{eligible.length ? "Niemand passt zur Auswahl." : "Bitte zuerst die Anwesenheit abhaken."}</p>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
                  <span>{rows.length} von {eligible.length} angezeigt · {sum.units - eligible.length} nicht anwesende ausgeblendet · „W“ = Weisung aus Vollmacht</span>
                  {voting && votes.length > 0 && (
                    <button type="button" className="font-semibold text-primary" onClick={async () => { if (!confirm("Alle Stimmen dieses Punkts löschen? Danach die Abstimmung neu starten.")) return; await resetTop([item.id]); }}>
                      Eingaben leeren
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Ergebnis */}
            {needsVote && (voting || decided) && (
              <div className={cn("flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4",
                (decided ? item.result === "passed" : passes) ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30")}>
                <div className="min-w-[260px] flex-1 space-y-1.5">
                  <div className={cn("text-base font-semibold", (decided ? item.result === "passed" : passes) ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300")}>
                    {decided ? (item.result === "passed" ? "Festgestellt: angenommen" : "Festgestellt: abgelehnt") : passes ? "Stand jetzt: angenommen" : "Stand jetzt: keine Mehrheit"}
                  </div>
                  <div className="flex h-2 max-w-[420px] overflow-hidden rounded-full bg-foreground/10">
                    {(() => { const tot = tally.yes + tally.no + tally.abstain + tally.open || 1; return (<>
                      <span className="block bg-emerald-700" style={{ width: `${(tally.yes / tot) * 100}%` }} />
                      <span className="block bg-red-700" style={{ width: `${(tally.no / tot) * 100}%` }} />
                      <span className="block bg-slate-500" style={{ width: `${(tally.abstain / tot) * 100}%` }} />
                    </>); })()}
                  </div>
                  <div className="text-[13px] text-foreground/80">
                    Ja {fmt(tally.yes)} · Nein {fmt(tally.no)} · Enthaltung {fmt(tally.abstain)}{tally.openN ? ` · ${tally.openN} offen` : ""} ({unit}) – Enthaltungen zählen nicht (§ 25 Abs. 1 WEG)
                  </div>
                  {dqRelevant && (
                    <div className={cn("text-[13px] font-semibold", dqOk ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300")}>
                      Doppelt qualifiziert (mehr als 2/3 der abgegebenen Stimmen und mehr als die Hälfte aller Anteile): {dqOk ? "erreicht" : "nicht erreicht"}
                    </div>
                  )}
                </div>
                {voting && (
                  <Button className="h-11 px-5" onClick={() => decide.mutate()} disabled={decide.isPending || eligible.length === 0}>
                    {decide.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Beschluss feststellen
                  </Button>
                )}
                {decided && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="h-11" onClick={() => reopen.mutate()} disabled={reopen.isPending}>Wieder öffnen</Button>
                    {idx < items.length - 1 && <Button className="h-11" onClick={() => setSelId(items[idx + 1].id)}>Nächster Punkt</Button>}
                  </div>
                )}
              </div>
            )}

            {!needsVote && idx < items.length - 1 && (
              <div className="flex justify-end"><Button variant="outline" onClick={() => setSelId(items[idx + 1].id)}>Nächster Punkt</Button></div>
            )}

            <div className="space-y-1.5 border-t pt-4">
              <Label htmlFor="live-notes" className="flex items-center justify-between">Notizen fürs Protokoll {savedHint === "admin_notes" && <span className="text-xs font-normal text-emerald-700">gespeichert</span>}</Label>
              <Textarea id="live-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => saveField("admin_notes", notes)} placeholder="Wortmeldungen, Hinweise …" />
            </div>
          </EtvCard>
        ) : (
          <EtvCard className="px-6 py-12 text-center text-sm text-muted-foreground">Kein Punkt ausgewählt.</EtvCard>
        )}
      </div>

      <Sheet open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Anwesenheit</SheetTitle>
            <SheetDescription>Schalter an = anwesend bzw. Vertreter ist da. Vollmachten und Weisungen kannst du hier ebenfalls nachtragen.</SheetDescription>
          </SheetHeader>
          <div className="mt-5"><AttendancePanel meetingId={meetingId} buildingId={buildingId} mode="live" /></div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Was soll zurückgesetzt werden?</AlertDialogTitle>
            <AlertDialogDescription>Anwesenheit, Vollmachten und Texte bleiben erhalten. Nur Stimmen und Ergebnisse werden gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <Button variant="outline" disabled={!item} onClick={() => doReset(false)}>Nur {item ? `TOP ${idx + 1}` : "diesen Punkt"}</Button>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => doReset(true)}>Alle Abstimmungen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Punkt löschen?</AlertDialogTitle>
            <AlertDialogDescription>„{item?.title}“ wird mit allen Stimmen gelöscht, die folgenden Punkte rücken auf. Das Löschen eines geladenen Punkts sollte im Protokoll vermerkt werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteTop}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddTopDialog open={addOpen} onOpenChange={setAddOpen} meetingId={meetingId} items={items} defaultPrinciple={meeting.default_voting_principle || "headcount"} />
      <ProceduralDialog open={procOpen} onOpenChange={setProcOpen} meetingId={meetingId} count={items.length} />
    </div>
  );
};

/** Geheime Abstimmung: Eigentümer sehen im Portal nicht, wer wie gestimmt hat. */
const SecretBallotToggle = ({ meetingId, value }: { meetingId: string; value: boolean }) => {
  const qc = useQueryClient();
  const [on, setOn] = useState(value);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setOn(value); }, [value]);
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border px-2.5 text-[13px]" title="Eigentümer sehen im Portal nicht, wer wie abgestimmt hat">
      <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Geheim
      <Switch
        checked={on}
        onCheckedChange={async (v) => {
          setOn(v);
          await (supabase as any).from("etv_meetings").update({ is_secret_ballot: v }).eq("id", meetingId);
          qc.invalidateQueries({ queryKey: ["etv-meeting", meetingId] });
        }}
      />
    </label>
  );
};
