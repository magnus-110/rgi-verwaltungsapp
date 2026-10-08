import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { reportsDb } from "@/integrations/supabase/reports";
import { useAuth } from "@/hooks/useAuth";
import { useAddCaseEvent } from "@/hooks/useCases";
import type { ReportEventRow, ReportRow as ReportRowDb, ReportStepRow } from "@/integrations/supabase/reports";

/**
 * Meldungen im Postfach.
 *
 * Eine Meldung ist alles, was von Eigentümern oder Mietern hereinkommt
 * (Portal, Chatbot, E-Mail, Anruf, Brief). Bearbeitet wird sie im Postfach,
 * Ordner „Meldungen“ — dort liegen die drei Unterordner Offen, In Bearbeitung
 * und Erledigt.
 *
 * Was mit einer Meldung passiert, steht im Verlauf (report_events). Der
 * Melder sieht davon nur, was ausdrücklich für ihn sichtbar ist: Stände,
 * Nachrichten und seine eigenen Antworten.
 */

export type ReportStatus = "open" | "in_progress" | "waiting" | "resolved";
export type ReportFolder = "open" | "progress" | "done";
export type ReportEventKind = "step" | "message" | "reply" | "note" | "assignment" | "system";
export type ReportChannel = "portal" | "email" | "phone" | "letter" | "in_person" | "chatbot";

export type ReportRow = ReportRowDb;
export type ReportEvent = ReportEventRow;
export type ReportStep = ReportStepRow;

export interface Report extends ReportRow {
  building: { id: string; name: string } | null;
  /** Melder, die das Büro beim Anlegen ausgewählt hat (leer bei Meldungen aus dem Portal). */
  participants: { contact_id: string; user_id: string | null }[];
}

/** Ein Kontakt eines Gebäudes, der als Melder ausgewählt werden kann. */
export interface BuildingContact {
  contact_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  unit_number: string | null;
}

export interface ReportAttachment {
  name: string;
  path: string;
  size?: number;
  type?: string;
}

export interface StaffProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  /** Kürzel wie bei den E-Mails (aus dem E-Mail-Konto der Person), sonst null. */
  short_code: string | null;
}

export const REPORT_FOLDER_STATUSES: Record<ReportFolder, ReportStatus[]> = {
  open: ["open"],
  progress: ["in_progress", "waiting"],
  done: ["resolved"],
};

export const REPORT_FOLDER_LABEL: Record<ReportFolder, string> = {
  open: "Offen",
  progress: "In Bearbeitung",
  done: "Erledigt",
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Neu",
  in_progress: "In Bearbeitung",
  waiting: "Wartet",
  resolved: "Erledigt",
};

export const REPORT_CHANNEL_LABEL: Record<ReportChannel, string> = {
  portal: "Portal",
  email: "E-Mail",
  phone: "Anruf",
  letter: "Brief",
  in_person: "Persönlich",
  chatbot: "Chatbot",
};

export const RESOLVE_REASONS = [
  "Gelöst",
  "Frage beantwortet",
  "Nicht zuständig (Sondereigentum)",
  "Doppelt gemeldet",
] as const;

export const folderOfStatus = (status: string): ReportFolder =>
  status === "open" ? "open" : status === "resolved" ? "done" : "progress";

/** Hat (mindestens ein) Melder einen Zugang zum Portal? Nur dann sieht er Nachrichten dort. */
export const hasPortalAccess = (
  r: Pick<ReportRow, "reported_by"> & { participants?: { user_id: string | null }[] | null },
) => !!r.reported_by || !!r.participants?.some((p) => p.user_id);

/** Was der Melder als aktuellen Stand sieht. */
export const currentStandOf = (r: Pick<ReportRow, "current_step" | "status">) =>
  r.current_step || (r.status === "open" ? "Eingegangen" : REPORT_STATUS_LABEL[r.status as ReportStatus]);

export const parseAttachments = (value: unknown): ReportAttachment[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as ReportAttachment[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const staffName = (p?: StaffProfile | null) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unbekannt" : "Niemand";

export const staffFirstName = (p?: StaffProfile | null) => p?.first_name || staffName(p);

export const staffInitials = (p?: StaffProfile | null) =>
  p?.short_code ||
  (p
    ? [p.first_name, p.last_name]
        .filter(Boolean)
        .map((n) => n![0])
        .join("")
        .toUpperCase() || "?"
    : "?");

const REPORT_SELECT = "*, building:buildings(id, name), participants:report_participants(contact_id, user_id)";

export interface ReportListFilter {
  buildingId?: string | null;
  contactName?: string | null;
}

export const ROLE_LABEL: Record<string, string> = {
  eigentuemer: "Eigentümer",
  mieter: "Mieter",
  beirat: "Beirat",
};

// ---------------------------------------------------------------------------
// Abfragen
// ---------------------------------------------------------------------------

export function useStaffProfiles() {
  return useQuery({
    // Eigener Schlüssel: das Postfach lädt unter "admin-profiles" dieselben
    // Personen, aber ohne Kürzel.
    queryKey: ["report-staff"],
    queryFn: async (): Promise<StaffProfile[]> => {
      const [profilesRes, accountsRes, linksRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, first_name, last_name, role")
          .in("role", ["admin", "employee"])
          .order("last_name"),
        supabase.from("email_accounts").select("id, short_code"),
        supabase.from("email_account_users").select("user_id, account_id"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      // Kürzel wie im Postfach: das Kürzel des E-Mail-Kontos, das der Person gehört.
      const codeOfAccount = new Map(
        (accountsRes.data || []).filter((a) => a.short_code).map((a) => [a.id, a.short_code as string]),
      );
      const codeOfUser = new Map<string, string>();
      (linksRes.data || []).forEach((l) => {
        const code = codeOfAccount.get(l.account_id);
        if (code && !codeOfUser.has(l.user_id)) codeOfUser.set(l.user_id, code);
      });
      return (profilesRes.data || []).map((p) => ({
        ...(p as Omit<StaffProfile, "short_code">),
        short_code: codeOfUser.get(p.user_id) ?? null,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

export function useReportList(folder: ReportFolder | null, filter: ReportListFilter = {}) {
  const buildingId = filter.buildingId || null;
  const contactName = filter.contactName || null;
  return useQuery({
    queryKey: ["reports", "list", folder, buildingId, contactName],
    enabled: !!folder,
    queryFn: async (): Promise<Report[]> => {
      let q = reportsDb
        .from("reports")
        .select(REPORT_SELECT)
        .in("status", REPORT_FOLDER_STATUSES[folder!])
        .order("last_activity_at", { ascending: false });
      if (buildingId) q = q.eq("building_id", buildingId);
      if (contactName) q = q.eq("contact_name", contactName);
      // Erledigte können viele werden; die jüngsten reichen für die Liste,
      // ältere findet man über die Filter oder die Suche.
      if (folder === "done") q = q.limit(300);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as Report[];
    },
  });
}

/**
 * Auswahl für die Filter im Ordner (Gebäude und Melder): alle Gebäude und
 * Namen, die in diesem Ordner vorkommen — auch über die angezeigten hinaus.
 */
export function useReportFilterOptions(folder: ReportFolder | null) {
  return useQuery({
    queryKey: ["reports", "filter-options", folder],
    enabled: !!folder,
    queryFn: async () => {
      const { data, error } = await reportsDb
        .from("reports")
        .select("building_id, contact_name, building:buildings(id, name)")
        .in("status", REPORT_FOLDER_STATUSES[folder!])
        .limit(5000);
      if (error) throw error;
      const rows = (data || []) as unknown as {
        building_id: string | null;
        contact_name: string | null;
        building: { id: string; name: string } | null;
      }[];
      const buildings = new Map<string, string>();
      const names = new Set<string>();
      rows.forEach((r) => {
        if (r.building) buildings.set(r.building.id, r.building.name);
        if (r.contact_name?.trim()) names.add(r.contact_name.trim());
      });
      return {
        buildings: [...buildings.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name, "de")),
        contacts: [...names].sort((a, b) => a.localeCompare(b, "de")),
      };
    },
    staleTime: 60_000,
  });
}

/**
 * Kontakte eines Gebäudes (Eigentümer, Mieter, Beirat), aus denen das Büro
 * beim Erfassen die Melder auswählt. Wer ein App-Konto hat, sieht die Meldung
 * danach im Portal.
 */
export function useBuildingContacts(buildingId: string | null) {
  return useQuery({
    queryKey: ["reports", "building-contacts", buildingId],
    enabled: !!buildingId,
    queryFn: async (): Promise<BuildingContact[]> => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(
          "contact_id, unit_number, role_in_building, contact:contacts(id, first_name, last_name, company_name, short_name, user_id, emails:contact_emails(email, is_primary), phones:contact_phones(phone_number))",
        )
        .eq("building_id", buildingId!)
        .in("role_in_building", ["eigentuemer", "mieter", "beirat"])
        .or("is_active.is.null,is_active.eq.true");
      if (error) throw error;
      const seen = new Set<string>();
      const list: BuildingContact[] = [];
      type Row = {
        unit_number: string | null;
        role_in_building: string | null;
        contact: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          company_name: string | null;
          short_name: string | null;
          user_id: string | null;
          emails: { email: string; is_primary: boolean | null }[] | null;
          phones: { phone_number: string | null }[] | null;
        } | null;
      };
      for (const row of (data || []) as unknown as Row[]) {
        const c = row.contact;
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        const person = [c.first_name, c.last_name].filter(Boolean).join(" ");
        const emails = (c.emails || []) as { email: string; is_primary: boolean | null }[];
        const email = emails.find((e) => e.is_primary)?.email || emails[0]?.email || null;
        list.push({
          contact_id: c.id,
          user_id: c.user_id ?? null,
          name: person || c.company_name || c.short_name || "Unbenannt",
          email,
          phone: (c.phones || [])[0]?.phone_number ?? null,
          role: row.role_in_building ?? "",
          unit_number: row.unit_number ?? null,
        });
      }
      return list.sort((a, b) => a.name.localeCompare(b.name, "de"));
    },
  });
}

/** Suche über alle Meldungen (Nummer, Titel, Name, Text). */
export function useReportSearch(term: string) {
  const t = term.trim();
  return useQuery({
    queryKey: ["reports", "search", t],
    enabled: t.length >= 2,
    queryFn: async (): Promise<Report[]> => {
      const like = `%${t.replace(/[%_,()]/g, " ")}%`;
      const { data, error } = await reportsDb
        .from("reports")
        .select(REPORT_SELECT)
        .or(
          [
            `report_number.ilike.${like}`,
            `title.ilike.${like}`,
            `contact_name.ilike.${like}`,
            `description.ilike.${like}`,
          ].join(","),
        )
        .order("last_activity_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as Report[];
    },
  });
}

export function useReport(id: string | null) {
  return useQuery({
    queryKey: ["reports", "one", id],
    enabled: !!id,
    queryFn: async (): Promise<Report | null> => {
      const { data, error } = await reportsDb.from("reports").select(REPORT_SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as unknown as Report) || null;
    },
  });
}

export function useReportEvents(reportId: string | null) {
  return useQuery({
    queryKey: ["reports", "events", reportId],
    enabled: !!reportId,
    queryFn: async (): Promise<ReportEvent[]> => {
      const { data, error } = await reportsDb
        .from("report_events")
        .select("*")
        .eq("report_id", reportId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

/** Offene Aufgaben, die aus dieser Meldung entstanden sind. */
export function useReportTodos(reportId: string | null) {
  return useQuery({
    queryKey: ["reports", "todos", reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("todos")
        .select("id, title, status, assigned_to, due_date")
        .eq("source_type", "report")
        .eq("source_id", reportId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Zahl der offenen Meldungen für Ordner und Menü. Gezählt werden nur eigene und
 * noch nicht zugeordnete - was jemand anderem zugeordnet ist, zählt hier nicht.
 */
export function useReportCounts(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["reports", "counts", user?.id ?? null],
    enabled: enabled && !!user?.id,
    queryFn: async () => {
      const { count } = await reportsDb
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .or(`assigned_to.is.null,assigned_to.eq.${user!.id}`);
      return { open: count ?? 0 };
    },
    staleTime: 15_000,
  });
}

export function useReportSteps(includeInactive = false) {
  return useQuery({
    queryKey: ["report-steps", includeInactive],
    queryFn: async (): Promise<ReportStep[]> => {
      let q = reportsDb.from("report_steps").select("*").order("sort_order").order("label");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

/** Meldung, die aus einer E-Mail entstanden ist (für den Hinweis in der E-Mail). */
export function useReportForEmail(emailId: string | null) {
  return useQuery({
    queryKey: ["reports", "for-email", emailId],
    enabled: !!emailId,
    queryFn: async () => {
      const { data, error } = await reportsDb
        .from("reports")
        .select("id, report_number, status")
        .eq("source_email_id", emailId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Meldung anhand ihrer Nummer, z. B. aus einem E-Mail-Betreff „[M-26-0012]“. */
export function useReportByNumber(number: string | null) {
  return useQuery({
    queryKey: ["reports", "by-number", number],
    enabled: !!number,
    queryFn: async () => {
      const { data, error } = await reportsDb
        .from("reports")
        .select("id, report_number, status")
        .eq("report_number", number!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Signierte Links für Anhänge (Bucket „report-attachments“) — der Meldung oder eines Verlaufseintrags. */
export function useReportAttachmentUrls(attachments: unknown) {
  const list = parseAttachments(attachments);
  return useQuery({
    queryKey: ["report-attachment-urls", list.map((a) => a.path).join("|")],
    enabled: list.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      return Promise.all(
        list.map(async (a) => {
          const { data } = await supabase.storage.from("report-attachments").createSignedUrl(a.path, 3600);
          return { ...a, url: data?.signedUrl ?? null };
        }),
      );
    },
  });
}

/**
 * Hält alle Meldungsansichten aktuell, wenn irgendwo eine Meldung oder ein
 * Verlaufseintrag dazukommt oder sich ändert — etwa wenn ein Melder im
 * Portal antwortet oder eine Kollegin eine Meldung übernimmt.
 */
export function useReportsLive(channelKey: string, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`reports-live-${channelKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        qc.invalidateQueries({ queryKey: ["reports"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "report_events" }, (payload) => {
        const reportId = (payload.new as { report_id?: string }).report_id;
        if (reportId) qc.invalidateQueries({ queryKey: ["reports", "events", reportId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelKey, enabled, qc]);
}

// ---------------------------------------------------------------------------
// Änderungen
// ---------------------------------------------------------------------------

function useInvalidateReports() {
  const qc = useQueryClient();
  return (reportId?: string) => {
    qc.invalidateQueries({ queryKey: ["reports", "list"] });
    qc.invalidateQueries({ queryKey: ["reports", "counts"] });
    qc.invalidateQueries({ queryKey: ["reports", "search"] });
    qc.invalidateQueries({ queryKey: ["reports", "filter-options"] });
    if (reportId) {
      qc.invalidateQueries({ queryKey: ["reports", "one", reportId] });
      qc.invalidateQueries({ queryKey: ["reports", "events", reportId] });
      qc.invalidateQueries({ queryKey: ["reports", "todos", reportId] });
    }
  };
}

async function insertEvent(event: Omit<Partial<ReportEvent>, "id"> & { report_id: string; kind: ReportEventKind }) {
  const { error } = await reportsDb.from("report_events").insert(event);
  if (error) throw error;
}

async function updateReport(id: string, patch: Partial<ReportRow>) {
  const { error } = await reportsDb.from("reports").update(patch).eq("id", id);
  if (error) throw error;
}

/** Beim Öffnen: als gelesen markieren (und den Hinweis „Neue Antwort“ entfernen). */
export function useMarkReportRead() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (report: Pick<ReportRow, "id" | "is_read" | "has_new_reply">) => {
      if (report.is_read && !report.has_new_reply) return;
      await updateReport(report.id, { is_read: true, has_new_reply: false });
    },
    onSuccess: (_d, r) => invalidate(r.id),
  });
}

/**
 * Zuständigkeit ändern. Der Status bleibt dabei unverändert - zuständig sein
 * heißt noch nicht, dass schon jemand daran arbeitet. Der Eintrag wird trotzdem
 * gespeichert: Er löst die Glocken-Benachrichtigung für den neuen Zuständigen aus.
 * Im Verlauf erscheint er nur, wenn eine Erklärung („Was soll Sandra tun?“) dabei ist.
 */
export function useAssignReport() {
  const { user } = useAuth();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: { report: ReportRow; userId: string | null; note?: string }) => {
      const { report, userId, note } = input;
      await updateReport(report.id, { assigned_to: userId });
      await insertEvent({
        report_id: report.id,
        kind: "assignment",
        assigned_to: userId,
        body: note?.trim() || null,
        created_by: user?.id ?? null,
      });
    },
    onSuccess: (_d, v) => invalidate(v.report.id),
  });
}

/** Neuen Stand eintragen — nur den Schritt, der gerade passiert ist. */
export function useAddReportStep() {
  const { user } = useAuth();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: {
      report: ReportRow;
      label: string;
      status: "in_progress" | "waiting";
      text: string;
      allowReply: boolean;
    }) => {
      const { report, label, status, text, allowReply } = input;
      await insertEvent({
        report_id: report.id,
        kind: "step",
        step_label: label,
        body: text.trim() || null,
        visible_to_reporter: true,
        allow_reply: allowReply,
        created_by: user?.id ?? null,
      });
      await updateReport(report.id, {
        status,
        current_step: label,
        assigned_to: report.assigned_to ?? user?.id ?? null,
        reply_open: allowReply ? true : report.reply_open,
        has_new_reply: false,
        is_read: true,
      });
    },
    onSuccess: (_d, v) => invalidate(v.report.id),
  });
}

/**
 * Nachricht an den Melder. Sie erscheint im Portal; auf Wunsch zusätzlich
 * per E-Mail (das Postfach öffnet dann ein vorausgefülltes Fenster). Hat der
 * Melder keinen Portalzugang, geht die Nachricht nur per E-Mail.
 */
export function useSendReportMessage() {
  const { user } = useAuth();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: { report: ReportRow; body: string; allowReply: boolean; viaEmail: boolean }) => {
      const { report, body, allowReply, viaEmail } = input;
      const portal = hasPortalAccess(report);
      await insertEvent({
        report_id: report.id,
        kind: "message",
        body: body.trim(),
        visible_to_reporter: portal,
        allow_reply: portal && allowReply,
        sent_by_email: viaEmail || !portal,
        created_by: user?.id ?? null,
      });
      await updateReport(report.id, {
        status: report.status === "open" ? "in_progress" : report.status,
        assigned_to: report.assigned_to ?? user?.id ?? null,
        reply_open: portal && allowReply ? true : report.reply_open,
        has_new_reply: false,
        is_read: true,
      });
    },
    onSuccess: (_d, v) => invalidate(v.report.id),
  });
}

export function useAddReportNote() {
  const { user } = useAuth();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: { reportId: string; body: string }) => {
      await insertEvent({
        report_id: input.reportId,
        kind: "note",
        body: input.body.trim(),
        created_by: user?.id ?? null,
      });
    },
    onSuccess: (_d, v) => invalidate(v.reportId),
  });
}

export function useSetReportReplyOpen() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: { reportId: string; open: boolean }) => {
      await updateReport(input.reportId, { reply_open: input.open });
    },
    onSuccess: (_d, v) => invalidate(v.reportId),
  });
}

export function useSetReportPriority() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: { reportId: string; urgent: boolean }) => {
      await updateReport(input.reportId, { priority: input.urgent ? "urgent" : "normal" });
    },
    onSuccess: (_d, v) => invalidate(v.reportId),
  });
}

/** Erledigen — mit Grund und optionaler Abschluss-Nachricht an den Melder. */
export function useResolveReport() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: {
      report: ReportRow;
      reason: string;
      message: string;
      closeTodos: boolean;
    }) => {
      const { report, reason, message, closeTodos } = input;
      const now = new Date().toISOString();
      await insertEvent({
        report_id: report.id,
        kind: "step",
        step_label: "Erledigt",
        body: message.trim() || null,
        visible_to_reporter: hasPortalAccess(report),
        created_by: user?.id ?? null,
      });
      await updateReport(report.id, {
        status: "resolved",
        current_step: "Erledigt",
        resolved_at: now,
        resolved_reason: reason,
        reply_open: false,
        has_new_reply: false,
        is_read: true,
        assigned_to: report.assigned_to ?? user?.id ?? null,
      });
      if (closeTodos) {
        const { error } = await supabase
          .from("todos")
          .update({ status: "done", completed_at: now })
          .eq("source_type", "report")
          .eq("source_id", report.id)
          .neq("status", "done");
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      invalidate(v.report.id);
      if (v.closeTodos) {
        qc.invalidateQueries({ queryKey: ["board-pins"] });
        qc.invalidateQueries({ queryKey: ["board-supply"] });
        qc.invalidateQueries({ queryKey: ["todos"] });
      }
    },
  });
}

export function useReopenReport() {
  const { user } = useAuth();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (report: ReportRow) => {
      await updateReport(report.id, {
        status: report.assigned_to ? "in_progress" : "open",
        current_step: null,
        resolved_at: null,
        resolved_reason: null,
      });
      await insertEvent({
        report_id: report.id,
        kind: "system",
        body: "Wieder geöffnet",
        created_by: user?.id ?? null,
      });
    },
    onSuccess: (_d, r) => invalidate(r.id),
  });
}

/** Einem Vorgang zuordnen. Im Vorgang erscheint die Meldung in der Zeitleiste. */
export function useLinkReportToCase() {
  const { user } = useAuth();
  const addCaseEvent = useAddCaseEvent();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: { report: ReportRow; caseId: string; caseTitle: string; created?: boolean }) => {
      const { report, caseId, caseTitle, created } = input;
      await updateReport(report.id, { case_id: caseId });
      await insertEvent({
        report_id: report.id,
        kind: "system",
        body: created ? `Neuer Vorgang angelegt: „${caseTitle}“` : `Dem Vorgang „${caseTitle}“ zugeordnet`,
        created_by: user?.id ?? null,
      });
      try {
        await addCaseEvent.mutateAsync({
          case_id: caseId,
          event_type: "note",
          title: created ? `Aus Meldung ${report.report_number} erstellt` : `Meldung ${report.report_number} verknüpft`,
          body: `${report.title}\n${report.description || ""}${report.contact_name ? `\n\nMelder: ${report.contact_name}` : ""}`,
          source_table: "reports",
          source_id: report.id,
          trigger_summary: false,
        });
      } catch (e) {
        // Die Verknüpfung steht; fehlt nur der Eintrag im Vorgang, ist das kein Grund abzubrechen.
        console.error(e);
      }
    },
    onSuccess: (_d, v) => invalidate(v.report.id),
  });
}

export function useUnlinkReportCase() {
  const { user } = useAuth();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (report: ReportRow) => {
      await updateReport(report.id, { case_id: null });
      await insertEvent({
        report_id: report.id,
        kind: "system",
        body: "Verknüpfung zum Vorgang gelöst",
        created_by: user?.id ?? null,
      });
    },
    onSuccess: (_d, r) => invalidate(r.id),
  });
}

/** KI-Vorschlag für eine Aufgabe (Mistral, Edge Function „report-task-suggest“). */
export async function suggestTaskFromReport(reportId: string): Promise<{ title: string; description: string }> {
  const { data, error } = await supabase.functions.invoke("report-task-suggest", { body: { report_id: reportId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { title: data?.title || "", description: data?.description || "" };
}

/**
 * Aufgabe aus einer Meldung. Sie liegt danach auf der Pinnwand (an der Wand
 * oder im Vorrat) und kennt ihre Meldung — so führt ein Klick zurück.
 */
export function useCreateTaskFromReport() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: {
      report: ReportRow;
      title: string;
      description: string;
      assignedTo: string;
      dueDate: string | null;
      pinToWall: boolean;
      assigneeName: string;
    }) => {
      const { report, title, description, assignedTo, dueDate, pinToWall, assigneeName } = input;
      const { data: todo, error } = await supabase
        .from("todos")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          building_id: report.building_id,
          case_id: report.case_id,
          due_date: dueDate,
          status: "open",
          priority: report.priority === "urgent" ? "high" : "medium",
          source_type: "report",
          source_id: report.id,
          created_by: user!.id,
          assigned_to: assignedTo,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (pinToWall) {
        const { data: top } = await supabase
          .from("board_pins")
          .select("sort_order")
          .eq("user_id", assignedTo)
          .eq("column_key", "wall")
          .order("sort_order", { ascending: true })
          .limit(1);
        const nextSort = top && top.length ? Number(top[0].sort_order) - 1 : 0;
        const { error: pinError } = await supabase.from("board_pins").insert({
          user_id: assignedTo,
          ref_type: "todo",
          ref_id: todo.id,
          column_key: "wall",
          sort_order: nextSort,
          pinned_by: user!.id,
        });
        if (pinError) throw pinError;
      }

      await insertEvent({
        report_id: report.id,
        kind: "system",
        body: `Aufgabe erstellt: „${title.trim()}“ für ${assigneeName}`,
        created_by: user?.id ?? null,
      });

      if (!report.assigned_to || report.status === "open") {
        await updateReport(report.id, {
          assigned_to: report.assigned_to ?? assignedTo,
          status: report.status === "open" ? "in_progress" : report.status,
        });
      }
      return todo.id as string;
    },
    onSuccess: (_d, v) => {
      invalidate(v.report.id);
      qc.invalidateQueries({ queryKey: ["board-pins"] });
      qc.invalidateQueries({ queryKey: ["board-supply"] });
      qc.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

/**
 * Meldung von Hand erfassen (Anruf, Brief) oder aus einer E-Mail übernehmen.
 * Sind Kontakte ausgewählt, sind sie die Melder: wer ein App-Konto hat, sieht
 * die Meldung im Portal und bekommt dort Stände und Nachrichten.
 */
export function useCreateReport() {
  const { user } = useAuth();
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async (input: {
      buildingId: string;
      managementMode: "weg" | "rent";
      title: string;
      description: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      channel: ReportChannel;
      sourceEmailId?: string | null;
      contacts?: BuildingContact[];
    }) => {
      const contacts = input.contacts || [];
      const withAccount = contacts.find((c) => c.user_id);
      const { data, error } = await reportsDb
        .from("reports")
        .insert({
          reported_by: withAccount?.user_id ?? null,
          building_id: input.buildingId,
          management_mode: input.managementMode,
          title: input.title.trim(),
          description: input.description.trim() || null,
          contact_name: input.contactName.trim() || null,
          contact_email: input.contactEmail.trim() || null,
          contact_phone: input.contactPhone.trim() || null,
          channel: input.channel,
          source_email_id: input.sourceEmailId ?? null,
          is_read: true,
        })
        .select("id, report_number, status")
        .single();
      if (error) throw error;
      if (contacts.length) {
        const { error: partError } = await reportsDb.from("report_participants").insert(
          contacts.map((c) => ({ report_id: data.id, contact_id: c.contact_id, user_id: c.user_id })),
        );
        if (partError) throw partError;
      }
      await insertEvent({
        report_id: data.id,
        kind: "system",
        body:
          input.channel === "email"
            ? "Aus einer E-Mail übernommen"
            : `Von Hand erfasst (${REPORT_CHANNEL_LABEL[input.channel]})`,
        created_by: user?.id ?? null,
      });
      return data;
    },
    onSuccess: (d) => {
      invalidate(d.id);
    },
  });
}

/**
 * Meldung endgültig löschen — samt Verlauf und hochgeladenen Dateien.
 * Aufgaben, die aus ihr entstanden sind, bleiben stehen.
 */
export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (report: Pick<ReportRow, "id" | "attachments">) => {
      const { data: events } = await reportsDb.from("report_events").select("attachments").eq("report_id", report.id);
      const paths = [
        ...parseAttachments(report.attachments),
        ...(events || []).flatMap((e) => parseAttachments(e.attachments)),
      ].map((a) => a.path);
      const { error } = await reportsDb.from("reports").delete().eq("id", report.id);
      if (error) throw error;
      // Dateien zuletzt: schlägt das fehl, ist die Meldung trotzdem weg.
      if (paths.length) await supabase.storage.from("report-attachments").remove(paths);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Schritte verwalten (Einstellungen)
// ---------------------------------------------------------------------------

export function useSaveReportStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (step: Partial<ReportStep> & { label: string; status: string }) => {
      if (step.id) {
        const { id, created_at: _c, updated_at: _u, ...patch } = step;
        const { error } = await reportsDb.from("report_steps").update(patch).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await reportsDb.from("report_steps").insert(step);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-steps"] }),
  });
}

export function useDeleteReportStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await reportsDb.from("report_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-steps"] }),
  });
}
