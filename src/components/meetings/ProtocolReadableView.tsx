import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { ProtocolSignaturesInline } from "./ProtocolSignaturesInline";

function fmtMea(n: number) {
  return Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function principleLabel(p?: string | null) {
  if (p === "headcount") return "nach Köpfen";
  if (p === "double_qualified") return "nach doppelt qualifizierter Mehrheit";
  return "nach Anteilen (MEA)";
}

type ProtocolMeeting = {
  meeting_date: string | null;
  location: string | null;
  meeting_chair: string | null;
  minutes_taker: string | null;
  buildings: { name: string | null; address: string | null; manager_name: string | null } | null;
};

type ProtocolAgendaItem = {
  id: string;
  title: string | null;
  description: string | null;
  resolution_text: string | null;
  admin_notes: string | null;
  result: string | null;
  voting_principle: string | null;
  yes_count: number | null;
  no_count: number | null;
  abstain_count: number | null;
  total_mea_yes?: number | null;
  total_mea_no?: number | null;
  total_mea_abstain?: number | null;
};

type ProtocolAttendee = {
  attendance_type: string | null;
  contact_building_assignments?: {
    contact_building_shares?: { share_type: string | null; share_value: number | string | null }[] | null;
  } | null;
};

type ProtocolVote = { agenda_item_id: string; vote: string | null; mea_weight: number | string | null };

export function ProtocolReadableView({
  meetingId,
  compact = false,
  showSignatures = true,
}: {
  meetingId: string;
  compact?: boolean;
  showSignatures?: boolean;
}) {
  const { data: meeting } = useQuery<ProtocolMeeting>({
    queryKey: ["protocol-view-meeting", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("*, buildings(name, address, postal_code, city, manager_name)")
        .eq("id", meetingId)
        .single();
      if (error) throw error;
      return data as unknown as ProtocolMeeting;
    },
  });

  const { data: agendaItems = [] } = useQuery<ProtocolAgendaItem[]>({
    queryKey: ["protocol-view-agenda", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as ProtocolAgendaItem[];
    },
  });

  const { data: attendees = [] } = useQuery<ProtocolAttendee[]>({
    queryKey: ["protocol-view-attendees", meetingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("etv_attendees")
        .select(`*, contact_building_assignments!inner(contact_building_shares(share_type, share_value))`)
        .eq("meeting_id", meetingId);
      return (data || []) as unknown as ProtocolAttendee[];
    },
  });

  const itemIds = agendaItems.map((it) => it.id);
  const { data: votes = [] } = useQuery<ProtocolVote[]>({
    queryKey: ["protocol-view-votes", meetingId, itemIds.join(",")],
    queryFn: async () => {
      if (itemIds.length === 0) return [];
      const { data, error } = await supabase
        .from("etv_votes")
        .select("agenda_item_id, vote, mea_weight")
        .in("agenda_item_id", itemIds);
      if (error) throw error;
      return (data || []) as unknown as ProtocolVote[];
    },
    enabled: itemIds.length > 0,
  });

  if (!meeting) return null;

  const building = meeting.buildings;
  const getMea = (a: ProtocolAttendee) => {
    const shares = a.contact_building_assignments?.contact_building_shares || [];
    return Number(shares.find((s) => s.share_type === "mea")?.share_value || 0);
  };
  const presentLike = attendees.filter((a) => a.attendance_type === "present" || a.attendance_type === "proxy");
  const totalMea = attendees.reduce((s, a) => s + getMea(a), 0);
  const presentMea = presentLike.reduce((s, a) => s + getMea(a), 0);
  const meaUnit = totalMea > 950 && totalMea < 1050 ? "Tausendstel" : "MEA";

  const meetingDate = meeting.meeting_date ? new Date(meeting.meeting_date) : null;
  const dateStr = formatGermanDateLong(meeting.meeting_date);
  const beginStr = meeting.meeting_date ? `${formatGermanTime(meeting.meeting_date)} Uhr` : "—";

  return (
    <div className={compact ? "px-4 py-5 space-y-6" : "px-8 py-8 space-y-7 max-w-4xl mx-auto"}>
      {/* Header */}
      <header className="border-b-2 border-primary/80 pb-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">
          Protokoll · Eigentümerversammlung
        </div>
        <h1 className="text-2xl font-semibold mt-1 leading-tight">{building?.name || "WEG"}</h1>
        {building?.address && (
          <p className="text-sm text-muted-foreground mt-0.5">{[building.address, [(building as any).postal_code, (building as any).city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
        )}
      </header>

      {/* Eckdaten */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Eckdaten</h2>
        <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Datum</dt>
          <dd>{dateStr}</dd>
          <dt className="text-muted-foreground">Beginn</dt>
          <dd>{beginStr}</dd>
          {meeting.location && (<><dt className="text-muted-foreground">Ort</dt><dd>{meeting.location}</dd></>)}
          {meeting.meeting_chair && (<><dt className="text-muted-foreground">Versammlungsleitung</dt><dd>{meeting.meeting_chair}</dd></>)}
          {meeting.minutes_taker && (<><dt className="text-muted-foreground">Protokollführung</dt><dd>{meeting.minutes_taker}</dd></>)}
        </dl>
      </section>

      {/* Anwesenheit */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Anwesenheit</h2>
        <p className="text-sm leading-relaxed">
          Von insgesamt <span className="tabular-nums font-medium">{fmtMea(totalMea)}</span> {meaUnit} waren{" "}
          <span className="tabular-nums font-medium">{fmtMea(presentMea)}</span> {meaUnit} anwesend oder vertreten.
          {Math.abs(presentMea - totalMea) < 0.001 && totalMea > 0 && ` Es waren alle ${meaUnit} vertreten.`}
        </p>
      </section>

      {/* TOPs */}
      <section className="space-y-5">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tagesordnung</h2>
        {agendaItems.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Keine TOPs erfasst.</p>
        )}
        {agendaItems.map((it, idx) => {
          const hasResolution = !!(it.resolution_text && it.resolution_text.trim());
          const hasNotes = !!(it.admin_notes && it.admin_notes.trim());
          const itemVotes = votes.filter((v) => v.agenda_item_id === it.id);
          const sumMea = (vote: string) => itemVotes
            .filter((v) => v.vote === vote)
            .reduce((sum, v) => sum + Number(v.mea_weight || 0), 0);
          const isMea = it.voting_principle === "mea";
          const headJa = Number(it.yes_count ?? 0);
          const headNein = Number(it.no_count ?? 0);
          const headEnth = Number(it.abstain_count ?? 0);
          const meaJa = Number(it.total_mea_yes ?? sumMea("yes"));
          const meaNein = Number(it.total_mea_no ?? sumMea("no"));
          const meaEnth = Number(it.total_mea_abstain ?? sumMea("abstain"));
          const ja = isMea ? meaJa : headJa;
          const nein = isMea ? meaNein : headNein;
          const enth = isMea ? meaEnth : headEnth;
          const total = ja + nein + enth;
          const formatResultValue = (n: number) => isMea ? fmtMea(n) : String(n);
          const passed = it.result === "passed" || (it.result == null && ja > nein && total > 0);
          const failed = it.result === "failed" || (it.result == null && nein >= ja && total > 0);
          return (
            <article key={it.id} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                  TOP {idx + 1}
                </span>
                <h3 className="text-base font-semibold leading-snug">{it.title}</h3>
              </div>
              {it.description && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{it.description}</p>
              )}

              {hasResolution && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Beschluss</div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{it.resolution_text}</p>
                  {total > 0 && (
                    <>
                      <div className="border-t" />
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                        <span className="text-muted-foreground text-xs">Abstimmung {principleLabel(it.voting_principle)}</span>
                        <span className="flex items-center gap-1.5 text-green-700">
                          <CheckCircle2 className="h-4 w-4" /> Ja <span className="tabular-nums font-medium">{formatResultValue(ja)}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-red-700">
                          <XCircle className="h-4 w-4" /> Nein <span className="tabular-nums font-medium">{formatResultValue(nein)}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <MinusCircle className="h-4 w-4" /> Enth. <span className="tabular-nums font-medium">{formatResultValue(enth)}</span>
                        </span>
                        {passed && (
                          <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">Angenommen</Badge>
                        )}
                        {failed && (
                          <Badge variant="destructive">Abgelehnt</Badge>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {hasNotes && (
                <div className="text-xs text-muted-foreground italic border-l-2 border-muted-foreground/30 pl-3 py-1">
                  <span className="font-medium not-italic">Notiz: </span>{it.admin_notes}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {/* Schlusswort */}
      <section className="border-t pt-4">
        <p className="text-sm leading-relaxed text-foreground/90">
          Die Verwaltung bedankt sich bei den anwesenden Eigentümern für ihr Erscheinen und beendet die Versammlung.
        </p>
      </section>

      {/* Unterschriften eingebettet */}
      {showSignatures && (
        <section className="border-t pt-5">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Unterschriften</h2>
          <ProtocolSignaturesInline meetingId={meetingId} />
        </section>
      )}

      <footer className="text-[10px] text-muted-foreground border-t pt-3">
        Erstellt am {format(new Date(), "dd.MM.yyyy", { locale: de })} · {building?.manager_name || "Hausverwaltung"}
      </footer>
    </div>
  );
}
