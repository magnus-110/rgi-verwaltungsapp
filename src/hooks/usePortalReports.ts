import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { reportsDb } from "@/integrations/supabase/reports";
import { useAuth } from "@/hooks/useAuth";
import type { ReportAttachment, ReportEvent, ReportRow } from "@/hooks/useReports";

/**
 * Meldungen aus Sicht des Melders (Eigentümer- und Mieterportal).
 *
 * Der Melder sieht seine eigenen Meldungen, den aktuellen Stand, die
 * bisherigen Schritte und die Nachrichten der Verwaltung. Antworten kann er
 * nur, wenn die Verwaltung das bei einer Nachricht oder einem Stand
 * freigegeben hat (reply_open). Interne Einträge sieht er nie — das regelt
 * die Datenbank.
 */

export type PortalMode = "weg" | "rent";

export interface PortalReport extends ReportRow {
  building: { id: string; name: string } | null;
}

export interface PortalBuilding {
  id: string;
  name: string;
  address: string | null;
}

export interface ReporterContext {
  buildings: PortalBuilding[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

export function usePortalReports() {
  const { profile } = useAuth();
  const userId = profile?.user_id;
  return useQuery({
    queryKey: ["portal-reports", userId],
    enabled: !!userId,
    queryFn: async (): Promise<PortalReport[]> => {
      const { data, error } = await reportsDb
        .from("reports")
        .select("*, building:buildings(id, name)")
        .eq("reported_by", userId!)
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PortalReport[];
    },
  });
}

/** Für den Melder sichtbare Einträge (die Datenbank liefert nur diese). */
export function usePortalReportEvents(reportId: string | null) {
  return useQuery({
    queryKey: ["portal-report-events", reportId],
    enabled: !!reportId,
    queryFn: async (): Promise<ReportEvent[]> => {
      const { data, error } = await reportsDb
        .from("report_events")
        .select("*")
        .eq("report_id", reportId!)
        .eq("visible_to_reporter", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

/** Neue Stände und Nachrichten erscheinen ohne Neuladen. */
export function usePortalReportsLive() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const userId = profile?.user_id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`portal-reports-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports", filter: `reported_by=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["portal-reports"] }),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "report_events" }, (payload) => {
        const reportId = (payload.new as { report_id?: string }).report_id;
        qc.invalidateQueries({ queryKey: ["portal-report-events", reportId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

/** Antwort des Melders — nur möglich, solange die Verwaltung sie freigegeben hat. */
export function usePortalReply() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportId: string; body: string }) => {
      const { error } = await reportsDb.from("report_events").insert({
        report_id: input.reportId,
        kind: "reply",
        body: input.body.trim(),
        visible_to_reporter: true,
        created_by: profile!.user_id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["portal-report-events", v.reportId] });
      qc.invalidateQueries({ queryKey: ["portal-reports"] });
    },
  });
}

/** Gebäude und Kontaktdaten des Melders, um das Formular vorzubelegen. */
export function useReporterContext(mode: PortalMode) {
  const { profile } = useAuth();
  const userId = profile?.user_id;
  return useQuery({
    queryKey: ["reporter-context", mode, userId],
    enabled: !!userId,
    queryFn: async (): Promise<ReporterContext> => {
      const p = profile as unknown as {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
        building_id?: string | null;
      };
      let contactName = [p.first_name, p.last_name].filter(Boolean).join(" ");
      let contactEmail = p.email || "";
      let contactPhone = p.phone || "";
      let buildings: PortalBuilding[] = [];

      if (mode === "weg") {
        const { data: owner } = await supabase
          .from("weg_owners")
          .select("first_name, last_name, email, phone")
          .eq("user_id", userId!)
          .maybeSingle();
        if (owner) {
          contactName = [owner.first_name, owner.last_name].filter(Boolean).join(" ") || contactName;
          contactEmail = owner.email || contactEmail;
          contactPhone = owner.phone || contactPhone;
        }
        const { data: links } = await supabase.from("weg_owner_buildings").select("building_id").eq("user_id", userId!);
        const ids = (links || []).map((l) => l.building_id);
        if (ids.length) {
          const { data } = await supabase.from("buildings").select("id, name, address").in("id", ids).order("name");
          buildings = (data || []) as PortalBuilding[];
        }
      } else {
        let buildingId = p.building_id || null;
        const { data: tenant } = await supabase
          .from("tenants")
          .select("first_name, last_name, email, phone, building_id")
          .eq("user_id", userId!)
          .maybeSingle();
        if (tenant) {
          contactName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || contactName;
          contactEmail = tenant.email || contactEmail;
          contactPhone = tenant.phone || contactPhone;
          buildingId = buildingId || tenant.building_id;
        }
        if (buildingId) {
          const { data } = await supabase.from("buildings").select("id, name, address").eq("id", buildingId).maybeSingle();
          if (data) buildings = [data as PortalBuilding];
        }
      }

      return {
        buildings,
        contactName: contactName || contactEmail || (mode === "weg" ? "Eigentümer" : "Mieter"),
        contactEmail,
        contactPhone,
      };
    },
  });
}

/** Neue Meldung aus dem Portal, inklusive Fotos und Dokumente. */
export function useCreatePortalReport(mode: PortalMode) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      buildingId: string | null;
      buildingLabel: string;
      title: string;
      description: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      files: File[];
    }) => {
      const userId = profile!.user_id;
      const uploaded: ReportAttachment[] = [];
      for (const file of input.files) {
        const ext = file.name.split(".").pop();
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("report-attachments").upload(path, file);
        if (error) throw new Error(`„${file.name}“ konnte nicht hochgeladen werden`);
        uploaded.push({ name: file.name, path, size: file.size, type: file.type });
      }
      const { error } = await reportsDb.from("reports").insert({
        management_mode: mode,
        channel: "portal",
        reported_by: userId,
        building_id: input.buildingId,
        title: input.title.trim(),
        description: input.description.trim(),
        contact_name: input.contactName.trim(),
        contact_email: input.contactEmail.trim(),
        contact_phone: input.contactPhone.trim() || null,
        contact_address: input.buildingLabel || null,
        attachments: uploaded as unknown as ReportRow["attachments"],
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-reports"] }),
  });
}
