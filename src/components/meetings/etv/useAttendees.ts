import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyHeadGrouping, getHeadWeight } from "@/lib/etvHeadcount";

export const ATTENDEE_SELECT = `
  *,
  contact_building_assignments!inner(
    id, unit_number, role_in_building,
    contacts!inner(id, first_name, last_name, company_name, contact_emails(email, is_primary)),
    contact_building_shares(share_type, share_value)
  ),
  proxy_document:building_files(id, display_name, file_path)
`;

export const contactName = (c: any) => {
  if (!c) return "Unbekannt";
  if (c.company_name) return c.company_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
};

/** „Nachname, Vorname“ – für lange Listen alphabetisch lesbar. */
export const contactSortName = (c: any) => {
  if (!c) return "";
  if (c.company_name) return c.company_name;
  return [c.last_name, c.first_name].filter(Boolean).join(", ");
};

export const contactEmail = (c: any): string | null => {
  const list = c?.contact_emails || [];
  return (list.find((e: any) => e.is_primary) || list[0])?.email || null;
};

export const shareOf =(a: any, type: "mea" | "sqm") =>
  Number((a?.contact_building_assignments?.contact_building_shares || []).find((s: any) => s.share_type === type)?.share_value || 0);

export const useAttendees = (meetingId: string) =>
  useQuery({
    queryKey: ["etv-attendees-live", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("etv_attendees").select(ATTENDEE_SELECT).eq("meeting_id", meetingId);
      if (error) throw error;
      return (data || []).sort((a: any, b: any) =>
        String(a.contact_building_assignments?.unit_number || "").localeCompare(String(b.contact_building_assignments?.unit_number || ""), "de", { numeric: true }),
      );
    },
  });

export const useBuildingContacts = (buildingId: string) =>
  useQuery({
    queryKey: ["building-contacts-proxy", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select("id, contacts!inner(id, first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

/** Teilnehmerliste aus den aktiven Eigentümern anlegen (Kopfprinzip wird gleich angewendet). */
export async function initAttendees(meetingId: string, buildingId: string) {
  const [{ data: owners }, { data: existing }] = await Promise.all([
    supabase.from("contact_building_assignments").select("id").eq("building_id", buildingId).eq("role_in_building", "eigentuemer").eq("is_active", true),
    supabase.from("etv_attendees").select("assignment_id").eq("meeting_id", meetingId),
  ]);
  const have = new Set((existing || []).map((a: any) => a.assignment_id));
  const rows = (owners || []).filter((o: any) => !have.has(o.id)).map((o: any) => ({ meeting_id: meetingId, assignment_id: o.id, attendance_type: "absent" }));
  if (rows.length) {
    const { error } = await supabase.from("etv_attendees").insert(rows as any);
    if (error) throw error;
    await applyHeadGrouping(meetingId);
  }
  return rows.length;
}

export interface AttendeeSummary {
  units: number;
  heads: number;
  present: number;
  proxies: number;
  absent: number;
  zusagen: number;
  absagen: number;
  vollmachten: number;
  mitWeisung: number;
}

export const summarize = (attendees: any[]): AttendeeSummary => {
  const present = attendees.filter((a) => a.attendance_type === "present").length;
  const proxiesIn = attendees.filter((a) => a.attendance_type === "proxy" && a.checked_in_at).length;
  return {
    units: attendees.length,
    heads: attendees.reduce((s, a) => s + getHeadWeight(a), 0),
    present,
    proxies: proxiesIn,
    absent: attendees.length - present - proxiesIn,
    zusagen: attendees.filter((a) => a.self_reported_type === "present").length,
    absagen: attendees.filter((a) => a.self_reported_type === "absent").length,
    vollmachten: attendees.filter((a) => !!a.proxy_type || a.self_reported_type === "proxy").length,
    mitWeisung: attendees.filter((a) => a.pre_vote_instructions && Object.keys(a.pre_vote_instructions).length > 0).length,
  };
};
