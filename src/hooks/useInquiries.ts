import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { InquiryFolder, InquiryKind } from "@/lib/inquiries";

// Die Tabellen stehen (noch) nicht in den erzeugten Typen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any>;

export interface Inquiry {
  id: string;
  nummer: number;
  kind: InquiryKind;
  source: string;
  status: InquiryFolder;
  outcome: "gewonnen" | "verloren" | null;
  assigned_to: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  data: Record<string, unknown>;
  attribution: Record<string, unknown>;
  page_url: string | null;
  broker_property_id: string | null;
  broker_lead_id: string | null;
  contact_id: string | null;
  consent_at: string | null;
  is_read: boolean;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InquiryEvent {
  id: string;
  inquiry_id: string;
  kind: "notiz" | "status" | "zuordnung" | "email" | "system";
  body: string | null;
  created_by: string | null;
  created_at: string;
}

export function useIsAdmin() {
  const { profile } = useAuth();
  return profile?.role === "admin";
}

export function useInquiryList(folder: InquiryFolder | null, search = "") {
  const isAdmin = useIsAdmin();
  const q = search.trim();
  return useQuery({
    queryKey: ["inquiries", "list", folder, q],
    enabled: isAdmin && (!!folder || q.length >= 2),
    queryFn: async (): Promise<Inquiry[]> => {
      let query = db.from("inquiries").select("*").order("created_at", { ascending: false }).limit(300);
      if (q.length >= 2) {
        const like = `%${q.replace(/[%_,()]/g, " ")}%`;
        query = /^\d+$/.test(q)
          ? query.eq("nummer", Number(q))
          : query.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
      } else if (folder) {
        query = query.eq("status", folder);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Inquiry[];
    },
  });
}

/** Zahl der neuen Anfragen für die Ordner-Leiste (0, wenn die Tabelle fehlt). */
export function useInquiryCounts() {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: ["inquiries", "counts"],
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("status", "neu");
      // Fehlt die Tabelle noch (Datenbank nicht umgestellt), Ordner ausblenden.
      if (error) return { neu: 0, available: false };
      return { neu: count ?? 0, available: true };
    },
  });
}

export function useInquiry(id: string | null) {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: ["inquiries", "one", id],
    enabled: isAdmin && !!id,
    queryFn: async (): Promise<Inquiry | null> => {
      const { data, error } = await db.from("inquiries").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Inquiry) ?? null;
    },
  });
}

export function useInquiryEvents(id: string | null) {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: ["inquiries", "events", id],
    enabled: isAdmin && !!id,
    queryFn: async (): Promise<InquiryEvent[]> => {
      const { data, error } = await db
        .from("inquiry_events")
        .select("*")
        .eq("inquiry_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InquiryEvent[];
    },
  });
}

export function useInquiriesLive(enabled = true) {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  useEffect(() => {
    if (!enabled || !isAdmin) return;
    const channel = supabase
      .channel("inquiries-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "inquiries" }, () => {
        qc.invalidateQueries({ queryKey: ["inquiries"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, isAdmin, qc]);
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ["inquiries", "list"] });
    qc.invalidateQueries({ queryKey: ["inquiries", "counts"] });
    if (id) {
      qc.invalidateQueries({ queryKey: ["inquiries", "one", id] });
      qc.invalidateQueries({ queryKey: ["inquiries", "events", id] });
    }
  };
}

async function logEvent(inquiryId: string, kind: InquiryEvent["kind"], body: string, userId?: string) {
  await db.from("inquiry_events").insert({ inquiry_id: inquiryId, kind, body, created_by: userId ?? null });
}

export function useUpdateInquiry() {
  const invalidate = useInvalidate();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: { id: string; patch: Partial<Inquiry>; event?: { kind: InquiryEvent["kind"]; body: string } }) => {
      const { error } = await db.from("inquiries").update(p.patch).eq("id", p.id);
      if (error) throw error;
      if (p.event) await logEvent(p.id, p.event.kind, p.event.body, user?.id);
    },
    onSuccess: (_d, p) => invalidate(p.id),
  });
}

export function useAddInquiryNote() {
  const invalidate = useInvalidate();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: { id: string; body: string }) => {
      const { error } = await db
        .from("inquiry_events")
        .insert({ inquiry_id: p.id, kind: "notiz", body: p.body, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: (_d, p) => invalidate(p.id),
  });
}

export function useDeleteInquiry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("inquiries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

export function useCreateInquiry() {
  const invalidate = useInvalidate();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: { kind: InquiryKind; name: string; email?: string; phone?: string; note?: string }) => {
      const { data, error } = await db
        .from("inquiries")
        .insert({
          kind: p.kind,
          source: "manuell",
          status: "neu",
          name: p.name,
          email: p.email || null,
          phone: p.phone || null,
          data: p.note ? { nachricht: p.note } : {},
          created_by: user?.id ?? null,
          assigned_to: user?.id ?? null,
          is_read: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Inquiry;
    },
    onSuccess: () => invalidate(),
  });
}
