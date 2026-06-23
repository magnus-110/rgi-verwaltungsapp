import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type TimeClockStatus = "pending" | "approved" | "rejected";

export type TimeClockEntry = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  source: "button" | "manual";
  status: TimeClockStatus;
  reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  edited_by: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
};

const K = {
  active: (uid: string) => ["timeclock", "active", uid] as const,
  mine: (uid: string) => ["timeclock", "mine", uid] as const,
  all: ["timeclock", "all"] as const,
};

export function useActiveTimeEntry() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const qc = useQueryClient();

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`timeclock-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_clock_entries", filter: `user_id=eq.${uid}` },
        () => {
          qc.invalidateQueries({ queryKey: K.active(uid) });
          qc.invalidateQueries({ queryKey: K.mine(uid) });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, qc]);

  return useQuery({
    queryKey: K.active(uid),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_clock_entries")
        .select("*")
        .eq("user_id", uid)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as TimeClockEntry | null) ?? null;
    },
  });
}

export function useMyTimeEntries(days = 60) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  return useQuery({
    queryKey: K.mine(uid),
    enabled: !!uid,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("time_clock_entries")
        .select("*")
        .eq("user_id", uid)
        .gte("started_at", since)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TimeClockEntry[];
    },
  });
}

export function useAllTimeEntries(days = 90) {
  return useQuery({
    queryKey: [...K.all, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("time_clock_entries")
        .select("*")
        .gte("started_at", since)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TimeClockEntry[];
    },
  });
}

export function useClockIn() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note?: string) => {
      if (!user) throw new Error("Nicht angemeldet");
      const { data, error } = await supabase
        .from("time_clock_entries")
        .insert({ user_id: user.id, note: note ?? null, source: "button" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (user) {
        qc.invalidateQueries({ queryKey: K.active(user.id) });
        qc.invalidateQueries({ queryKey: K.mine(user.id) });
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Einstempeln fehlgeschlagen"),
  });
}

export function useClockOut() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await supabase
        .from("time_clock_entries")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", entryId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (user) {
        qc.invalidateQueries({ queryKey: K.active(user.id) });
        qc.invalidateQueries({ queryKey: K.mine(user.id) });
      }
      qc.invalidateQueries({ queryKey: K.all });
    },
    onError: (e: any) => toast.error(e.message ?? "Ausstempeln fehlgeschlagen"),
  });
}

export function useUpsertTimeEntry() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      user_id?: string;
      started_at: string;
      ended_at: string | null;
      note?: string | null;
      reason?: string | null;
      source?: "button" | "manual";
    }) => {
      if (!user) throw new Error("Nicht angemeldet");
      const isUpdate = !!payload.id;
      const row: any = {
        user_id: payload.user_id ?? user.id,
        started_at: payload.started_at,
        ended_at: payload.ended_at,
        note: payload.note ?? null,
        source: payload.source ?? (isUpdate ? "button" : "manual"),
      };
      if (payload.reason !== undefined) row.reason = payload.reason;
      if (isUpdate) {
        row.edited_by = user.id;
        row.edited_at = new Date().toISOString();
        const { data, error } = await supabase
          .from("time_clock_entries")
          .update(row)
          .eq("id", payload.id!)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("time_clock_entries")
          .insert(row)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      if (user) {
        qc.invalidateQueries({ queryKey: K.active(user.id) });
        qc.invalidateQueries({ queryKey: K.mine(user.id) });
      }
      qc.invalidateQueries({ queryKey: K.all });
    },
    onError: (e: any) => toast.error(e.message ?? "Speichern fehlgeschlagen"),
  });
}

export function useDeleteTimeEntry() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_clock_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) {
        qc.invalidateQueries({ queryKey: K.active(user.id) });
        qc.invalidateQueries({ queryKey: K.mine(user.id) });
      }
      qc.invalidateQueries({ queryKey: K.all });
    },
    onError: (e: any) => toast.error(e.message ?? "Löschen fehlgeschlagen"),
  });
}

// ---------- helpers ----------

export function durationMinutes(e: Pick<TimeClockEntry, "started_at" | "ended_at">, nowMs = Date.now()) {
  const start = new Date(e.started_at).getTime();
  const end = e.ended_at ? new Date(e.ended_at).getTime() : nowMs;
  return Math.max(0, Math.round((end - start) / 60000));
}

export function fmtHM(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, "0")} h`;
}

export function fmtHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export function startOfWeek() {
  const d = startOfToday();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}
export function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sumMinutesSince(entries: TimeClockEntry[], since: Date, nowMs = Date.now()) {
  const sinceMs = since.getTime();
  let total = 0;
  for (const e of entries) {
    const startMs = new Date(e.started_at).getTime();
    const endMs = e.ended_at ? new Date(e.ended_at).getTime() : nowMs;
    if (endMs <= sinceMs) continue;
    const effStart = Math.max(startMs, sinceMs);
    total += Math.max(0, Math.round((endMs - effStart) / 60000));
  }
  return total;
}
