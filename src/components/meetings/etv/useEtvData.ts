import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MeetingLike } from "@/lib/etvPhase";

const db = supabase as any;

export interface WegBuilding {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  etv_default_location: string | null;
}

export interface EtvMeetingRow extends MeetingLike {
  title: string;
  location: string | null;
}

/** Alle WEG-Liegenschaften (für Filter, Jahresplan und Archiv). */
export const useWegBuildings = () =>
  useQuery({
    queryKey: ["etv-weg-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address, city, etv_default_location")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return (data || []) as WegBuilding[];
    },
    staleTime: 5 * 60_000,
  });

/** Alle Versammlungen aller WEGs (jahresübergreifend) plus Kennzahlen für Phasen. */
export const useEtvMeetings = () =>
  useQuery({
    queryKey: ["etv-meetings", "overview"],
    queryFn: async () => {
      const { data, error } = await db
        .from("etv_meetings")
        .select("id, building_id, title, meeting_date, status, location, invitation_sent_at, ended_at, protocol_published, protocol_filed_at, steps_done, created_at")
        .order("meeting_date", { ascending: false, nullsFirst: true });
      if (error) throw error;
      const meetings = (data || []) as EtvMeetingRow[];

      const [{ data: sigs }, { data: renders }] = await Promise.all([
        supabase.from("etv_protocol_signatures").select("meeting_id, role"),
        supabase.from("etv_protocol_renders").select("meeting_id").eq("is_signed", true),
      ]);
      const sigRoles = new Map<string, Set<string>>();
      (sigs || []).forEach((s: any) => {
        const set = sigRoles.get(s.meeting_id) || new Set<string>();
        set.add(s.role);
        sigRoles.set(s.meeting_id, set);
      });
      const sigCount = new Map<string, number>(Array.from(sigRoles.entries()).map(([k, v]) => [k, v.size]));
      const filed = new Set((renders || []).map((r: any) => r.meeting_id));
      return meetings.map((m) => ({
        ...m,
        extras: { signatureCount: sigCount.get(m.id) || 0, protocolFiled: filed.has(m.id) || !!m.protocol_filed_at || !!m.protocol_published },
      }));
    },
  });

export type EtvMeetingWithExtras = NonNullable<ReturnType<typeof useEtvMeetings>["data"]>[number];

// ---------------------------------------------------------------------
// Themenspeicher
// ---------------------------------------------------------------------

export type TopicSource = "portal" | "email" | "note";
export type TopicStatus = "neu" | "eingeplant" | "zurueckgestellt" | "erledigt";

export interface Topic {
  key: string; // `${source}:${id}`
  source: TopicSource;
  id: string;
  buildingId: string | null;
  buildingName: string;
  title: string;
  text: string;
  from: string;
  fromEmail: string | null;
  date: string;
  attachments: string[];
  status: TopicStatus;
  outcome: string | null;
  reason: string | null;
  meetingId: string | null;
  agendaItemId: string | null;
  mergedInto: string | null;
  raw: any;
}

export const topicKey = (source: TopicSource, id: string) => `${source}:${id}`;

const portalStatus = (s: string): TopicStatus =>
  s === "accepted" ? "eingeplant" : s === "deferred" ? "zurueckgestellt" : s === "rejected" || s === "resolved" ? "erledigt" : "neu";

export const useEtvTopics = () =>
  useQuery({
    queryKey: ["etv-topics"],
    queryFn: async () => {
      const [portal, emails, notes, states, buildings, meetings] = await Promise.all([
        supabase
          .from("etv_submitted_tops")
          .select("*, buildings(id, name), profiles!etv_submitted_tops_submitted_by_user_id_fkey(first_name, last_name, email)")
          .order("created_at", { ascending: false }),
        db
          .from("emails")
          .select("id, subject, from_name, from_address, date, ai_summary, body_text, building_id, etv_meeting_id, etv_agenda_item_id, buildings!emails_building_id_fkey(id, name)")
          .eq("is_etv_relevant", true)
          .order("date", { ascending: false })
          .limit(400),
        db.from("etv_manual_notes").select("*, buildings(id, name)").order("created_at", { ascending: false }),
        db.from("etv_topic_states").select("*"),
        supabase.from("buildings").select("id, name"),
        db.from("etv_meetings").select("id, status, ended_at"),
      ]);
      for (const r of [portal, emails, notes, states]) if (r.error) throw r.error;

      const stateMap = new Map<string, any>();
      (states.data || []).forEach((s: any) => stateMap.set(topicKey(s.source_type, s.source_id), s));
      const bName = new Map<string, string>((buildings.data || []).map((b: any) => [b.id, b.name]));
      const completed = new Set((meetings.data || []).filter((m: any) => m.status === "completed" || m.ended_at).map((m: any) => m.id));

      const out: Topic[] = [];
      const push = (t: Omit<Topic, "status" | "outcome" | "reason" | "meetingId" | "agendaItemId" | "mergedInto">, fallback: { status: TopicStatus; meetingId?: string | null; agendaItemId?: string | null; reason?: string | null }) => {
        const st = stateMap.get(t.key);
        let status: TopicStatus = st?.status || fallback.status;
        let outcome: string | null = st?.outcome || null;
        const meetingId = st?.meeting_id ?? fallback.meetingId ?? null;
        // Behandelt, sobald die Versammlung abgeschlossen ist
        if (status === "eingeplant" && meetingId && completed.has(meetingId)) {
          status = "erledigt";
          outcome = outcome || "behandelt";
        }
        out.push({
          ...t,
          status,
          outcome,
          reason: st?.reason ?? fallback.reason ?? null,
          meetingId,
          agendaItemId: st?.agenda_item_id ?? fallback.agendaItemId ?? null,
          mergedInto: st?.merged_into || null,
        });
      };

      (portal.data || []).forEach((p: any) => {
        const prof = p.profiles;
        push(
          {
            key: topicKey("portal", p.id), source: "portal", id: p.id, buildingId: p.building_id,
            buildingName: p.buildings?.name || bName.get(p.building_id) || "–",
            title: p.title, text: p.description || "",
            from: prof ? `${prof.first_name || ""} ${prof.last_name || ""}`.trim() || "Eigentümer" : "Eigentümer",
            fromEmail: prof?.email || null, date: p.created_at, attachments: p.attachment_paths || [], raw: p,
          },
          { status: portalStatus(p.status), meetingId: p.accepted_into_meeting_id, reason: p.admin_notes },
        );
      });
      (emails.data || []).forEach((e: any) => {
        push(
          {
            key: topicKey("email", e.id), source: "email", id: e.id, buildingId: e.building_id,
            buildingName: e.buildings?.name || bName.get(e.building_id) || "ohne Liegenschaft",
            title: e.subject || "(ohne Betreff)", text: e.ai_summary || (e.body_text || "").slice(0, 1200),
            from: e.from_name || e.from_address || "Unbekannt", fromEmail: e.from_address || null,
            date: e.date, attachments: [], raw: e,
          },
          { status: e.etv_agenda_item_id ? "eingeplant" : "neu", meetingId: e.etv_meeting_id, agendaItemId: e.etv_agenda_item_id },
        );
      });
      (notes.data || []).forEach((n: any) => {
        push(
          {
            key: topicKey("note", n.id), source: "note", id: n.id, buildingId: n.building_id,
            buildingName: n.buildings?.name || bName.get(n.building_id) || "–",
            title: n.title, text: n.description || "", from: "Verwaltung", fromEmail: null,
            date: n.created_at, attachments: [], raw: n,
          },
          { status: "neu" },
        );
      });
      out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return out;
    },
  });
