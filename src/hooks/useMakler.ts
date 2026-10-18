import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  db,
  fehler,
  type BrokerDocument,
  type BrokerImage,
  type BrokerLead,
  type BrokerProperty,
  type LeadEvent,
  type StaffMember,
} from "@/lib/makler";

/** Alle Abfragen des Maklerbereichs hängen unter diesem Schlüssel. */
export const MK = "broker";

/** Fehler einer Abfrage einmal als Hinweis zeigen. */
function useFehlerHinweis(error: unknown, titel: string) {
  useEffect(() => {
    if (error) fehler(titel, error);
  }, [error, titel]);
}

/** Wer darf in den Maklerbereich? Admins immer, sonst mit Freigabe. */
export function useBrokerAccess() {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === "admin";
  const canUse = isAdmin || (!!profile?.broker_mode_enabled && profile?.role === "employee");
  return { canUse, isAdmin, userId: user?.id ?? profile?.user_id ?? null, profile };
}

/** Die Invalidierung für alles im Maklerbereich. */
export function useMaklerNeuLaden() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [MK] });
}

export type PropertyListItem = BrokerProperty & {
  broker_property_images: { storage_path: string; sort_order: number; created_at: string }[];
  broker_leads: { count: number }[];
};

export function titelbildPfad(p: PropertyListItem): string | null {
  const imgs = [...(p.broker_property_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
  return imgs[0]?.storage_path ?? null;
}
export function leadAnzahl(p: PropertyListItem): number {
  return p.broker_leads?.[0]?.count ?? 0;
}

export function useBrokerProperties() {
  const q = useQuery({
    queryKey: [MK, "properties"],
    queryFn: async () => {
      const { data, error } = await db
        .from("broker_properties")
        .select("*, broker_property_images(storage_path, sort_order, created_at), broker_leads(count)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PropertyListItem[];
    },
  });
  useFehlerHinweis(q.error, "Objekte konnten nicht geladen werden");
  return q;
}

export function useBrokerProperty(id: string | undefined) {
  const q = useQuery({
    queryKey: [MK, "property", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("broker_properties").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as BrokerProperty | null;
    },
  });
  useFehlerHinweis(q.error, "Objekt konnte nicht geladen werden");
  return q;
}

export function useBrokerImages(propertyId: string | undefined) {
  const q = useQuery({
    queryKey: [MK, "images", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("broker_property_images")
        .select("*")
        .eq("property_id", propertyId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as BrokerImage[];
    },
  });
  useFehlerHinweis(q.error, "Fotos konnten nicht geladen werden");
  return q;
}

export function useBrokerDocuments(propertyId: string | undefined) {
  const q = useQuery({
    queryKey: [MK, "documents", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("broker_property_documents")
        .select("*")
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BrokerDocument[];
    },
  });
  useFehlerHinweis(q.error, "Unterlagen konnten nicht geladen werden");
  return q;
}

const LEAD_SELECT =
  "*, contacts(short_name, company_name, first_name, last_name), broker_properties(id, title, listing_type, assigned_to)";

/** Alle Interessenten (optional nur eines Objekts). */
export function useBrokerLeads(propertyId?: string) {
  const q = useQuery({
    queryKey: [MK, "leads", propertyId ?? "alle"],
    queryFn: async () => {
      let query = db.from("broker_leads").select(LEAD_SELECT).order("created_at", { ascending: false });
      if (propertyId) query = query.eq("property_id", propertyId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as BrokerLead[];
    },
  });
  useFehlerHinweis(q.error, "Interessenten konnten nicht geladen werden");
  return q;
}

export function useBrokerLead(id: string | undefined) {
  const q = useQuery({
    queryKey: [MK, "lead", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("broker_leads").select(LEAD_SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as BrokerLead | null;
    },
  });
  useFehlerHinweis(q.error, "Interessent konnte nicht geladen werden");
  return q;
}

export function useLeadEvents(leadId: string | undefined) {
  const q = useQuery({
    queryKey: [MK, "lead-events", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await db
        .from("broker_lead_events")
        .select("*")
        .eq("lead_id", leadId!)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as LeadEvent[];
    },
  });
  useFehlerHinweis(q.error, "Verlauf konnte nicht geladen werden");
  return q;
}

export interface MaklerTermin {
  id: string;
  title: string;
  start_datetime: string;
  end_datetime: string | null;
  broker_property_id: string | null;
  broker_lead_id: string | null;
}

/** Makler-Termine (Besichtigungen) ab heute 0 Uhr für die nächsten Tage. */
export function useMaklerTermine(tage = 60) {
  const q = useQuery({
    queryKey: [MK, "termine", tage],
    queryFn: async () => {
      const ab = new Date();
      ab.setHours(0, 0, 0, 0);
      const bis = new Date(ab.getTime() + tage * 86_400_000);
      const { data, error } = await db
        .from("calendar_events")
        .select("id, title, start_datetime, end_datetime, broker_property_id, broker_lead_id")
        .not("broker_property_id", "is", null)
        .gte("start_datetime", ab.toISOString())
        .lt("start_datetime", bis.toISOString())
        .order("start_datetime");
      if (error) throw error;
      return (data ?? []) as MaklerTermin[];
    },
  });
  useFehlerHinweis(q.error, "Termine konnten nicht geladen werden");
  return q;
}

/** Mitarbeiter, die den Maklerbereich nutzen dürfen (für „Zuständig"). */
export function useBrokerStaff() {
  const q = useQuery({
    queryKey: [MK, "staff"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("user_id, first_name, last_name, email, role, broker_mode_enabled")
        .in("role", ["admin", "employee"])
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as StaffMember[];
    },
  });
  useFehlerHinweis(q.error, "Mitarbeiter konnten nicht geladen werden");
  const alle = q.data ?? [];
  const makler = alle.filter((p) => p.role === "admin" || p.broker_mode_enabled);
  const nachId = new Map(alle.map((p) => [p.user_id, p]));
  return { ...q, alle, makler, nachId };
}

export interface MaklerEmail {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  to_addresses: unknown;
  date: string | null;
}
const EMAIL_SELECT = "id, subject, from_name, from_address, to_addresses, date";

export function usePropertyEmails(propertyId: string | undefined) {
  const q = useQuery({
    queryKey: [MK, "property-emails", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("emails")
        .select(EMAIL_SELECT)
        .eq("broker_property_id", propertyId!)
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as MaklerEmail[];
    },
  });
  useFehlerHinweis(q.error, "E-Mails konnten nicht geladen werden");
  return q;
}

/** E-Mails eines Interessenten: zugeordnet, von ihm oder an ihn. */
export function useLeadEmails(leadId: string | undefined, email: string | null | undefined) {
  const adresse = email?.trim() || "";
  const q = useQuery({
    queryKey: [MK, "lead-emails", leadId, adresse],
    enabled: !!leadId,
    queryFn: async () => {
      const abfragen = [
        db.from("emails").select(EMAIL_SELECT).eq("broker_lead_id", leadId!).is("deleted_at", null).order("date", { ascending: false }).limit(50),
      ];
      if (adresse) {
        abfragen.push(
          db.from("emails").select(EMAIL_SELECT).ilike("from_address", adresse).is("deleted_at", null).order("date", { ascending: false }).limit(50),
        );
        const varianten = Array.from(new Set([adresse, adresse.toLowerCase()]));
        for (const v of varianten) {
          abfragen.push(
            db.from("emails").select(EMAIL_SELECT).contains("to_addresses", [v]).is("deleted_at", null).order("date", { ascending: false }).limit(50),
          );
        }
      }
      const ergebnisse = await Promise.all(abfragen);
      const map = new Map<string, MaklerEmail>();
      for (const r of ergebnisse) {
        if (r.error) throw r.error;
        for (const m of (r.data ?? []) as MaklerEmail[]) map.set(m.id, m);
      }
      return [...map.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 50);
    },
  });
  useFehlerHinweis(q.error, "E-Mails konnten nicht geladen werden");
  return q;
}

export interface BrokerSettings {
  id: boolean;
  team_sees_all: boolean;
}
export function useBrokerSettings() {
  const q = useQuery({
    queryKey: [MK, "settings"],
    queryFn: async () => {
      const { data, error } = await db.from("broker_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as BrokerSettings | null;
    },
  });
  useFehlerHinweis(q.error, "Einstellungen konnten nicht geladen werden");
  return q;
}

export interface BrokerDeputy {
  id: string;
  broker_id: string;
  deputy_id: string;
  until: string | null;
  created_at: string;
}
export function useBrokerDeputies() {
  const q = useQuery({
    queryKey: [MK, "deputies"],
    queryFn: async () => {
      const { data, error } = await db.from("broker_deputies").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as BrokerDeputy[];
    },
  });
  useFehlerHinweis(q.error, "Vertretungen konnten nicht geladen werden");
  return q;
}
