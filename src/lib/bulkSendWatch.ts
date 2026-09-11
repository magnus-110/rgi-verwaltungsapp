import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Rundmails laufen im Hintergrund (siehe Edge Function comm-send-bulk-email).
 * Hier merkt sich der Browser, welche Rundmails von hier gestartet wurden,
 * meldet, sobald sie fertig sind, und stößt einen hängengebliebenen Versand
 * wieder an (kein Fortschritt seit einigen Minuten).
 */

const STORAGE_KEY = "rgi.bulkSend.watch";
const CHANGE_EVENT = "rgi-bulk-send-watch";
const POLL_MS = 10_000;
/** Muss zum Wert in der Edge Function passen. */
export const BULK_SEND_STALE_MS = 3 * 60_000;
const MAX_WATCH_AGE_MS = 24 * 60 * 60_000;

type WatchEntry = { id: string; startedAt: number };

const readEntries = (): WatchEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === "string") : [];
  } catch {
    return [];
  }
};

const writeEntries = (entries: WatchEntry[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* Speicher nicht verfügbar — dann eben ohne Fertig-Meldung */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

/** Rundmail beobachten, bis ihr Versand abgeschlossen ist. */
export const watchBulkSend = (campaignId: string) => {
  const entries = readEntries().filter((e) => e.id !== campaignId);
  entries.push({ id: campaignId, startedAt: Date.now() });
  writeEntries(entries);
};

const unwatch = (campaignId: string): boolean => {
  const entries = readEntries();
  const next = entries.filter((e) => e.id !== campaignId);
  if (next.length === entries.length) return false; // schon von einem anderen Tab erledigt
  writeEntries(next);
  return true;
};

export type BulkSendStartResult = {
  success?: boolean;
  /** true = läuft jetzt im Hintergrund */
  background?: boolean;
  /** Anzahl E-Mails in der Warteschlange */
  queued?: number;
  /** Empfänger, die diese Rundmail schon erhalten hatten und übersprungen werden */
  already_sent?: number;
};

/** Liest die Fehlermeldung aus einer Edge-Function-Antwort (statt „non-2xx status code“). */
const functionErrorMessage = async (error: any, fallback: string) => {
  let msg = error?.message || fallback;
  try {
    const text = error?.context ? await error.context.text?.() : "";
    const parsed = text ? JSON.parse(text) : null;
    if (parsed?.error) msg = parsed.error;
  } catch {
    /* ignore */
  }
  return msg;
};

/**
 * Startet den Versand einer Rundmail (oder die Wiederholung der fehlgeschlagenen
 * Empfänger). Die Antwort kommt sofort; der Versand läuft im Hintergrund und
 * wird automatisch beobachtet.
 */
export const startBulkSend = async (
  campaignId: string,
  opts: { retryFailedOnly?: boolean } = {},
): Promise<BulkSendStartResult> => {
  const { data, error } = await supabase.functions.invoke("comm-send-bulk-email", {
    body: { campaign_id: campaignId, ...(opts.retryFailedOnly ? { retry_failed_only: true } : {}) },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Versand konnte nicht gestartet werden"));
  const result = (data || {}) as BulkSendStartResult & { error?: string };
  if (result.error) throw new Error(result.error);
  if (result.background) watchBulkSend(campaignId);
  return result;
};

/** Laufenden Versand anhalten. Bereits verschickte Mails bleiben verschickt. */
export const stopBulkSend = async (campaignId: string) => {
  const { error } = await supabase
    .from("comm_campaigns")
    .update({ status: "failed", error_message: "Versand wurde angehalten." })
    .eq("id", campaignId)
    .eq("status", "sending");
  if (error) throw error;
};

/** Hängengebliebenen Versand fortsetzen (die Funktion prüft selbst, ob er wirklich hängt). */
export const resumeBulkSend = async (campaignId: string) => {
  const { data, error } = await supabase.functions.invoke("comm-send-bulk-email", {
    body: { campaign_id: campaignId, continue: true },
  });
  if (error) throw error;
  return data as { ok?: boolean; continued?: boolean; skipped?: string } | null;
};

/** Hat der Versand seit einigen Minuten keinen Fortschritt mehr gemacht? */
export const isBulkSendStalled = (c: { status?: string | null; updated_at?: string | null }) =>
  c.status === "sending" && !!c.updated_at && Date.now() - new Date(c.updated_at).getTime() > BULK_SEND_STALE_MS;

/** Unsichtbare Komponente fürs Layout: beobachtet laufende Rundmails. */
export const BulkSendWatcher = () => {
  useBulkSendWatcher();
  return null;
};

export const useBulkSendWatcher = () => {
  const qc = useQueryClient();
  const [entries, setEntries] = useState<WatchEntry[]>(() => readEntries());
  const lastResume = useRef<Record<string, number>>({});

  useEffect(() => {
    const sync = () => setEntries(readEntries());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const idsKey = entries.map((e) => e.id).sort().join(",");

  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;

    const tick = async () => {
      const current = readEntries();
      if (current.length === 0) return;
      const { data, error } = await supabase
        .from("comm_campaigns")
        .select("id, name, status, sent_count, failed_count, recipient_count, updated_at")
        .in("id", current.map((e) => e.id));
      if (cancelled || error) return;

      let changed = false;
      for (const entry of current) {
        const c = (data || []).find((x: any) => x.id === entry.id) as any;
        if (!c || Date.now() - entry.startedAt > MAX_WATCH_AGE_MS) {
          unwatch(entry.id);
          continue;
        }

        if (c.status === "sending") {
          changed = true; // Fortschritt in den Listen aktualisieren
          const last = lastResume.current[c.id] || 0;
          if (isBulkSendStalled(c) && Date.now() - last > BULK_SEND_STALE_MS) {
            lastResume.current[c.id] = Date.now();
            resumeBulkSend(c.id).catch((e) => console.warn("[bulk] Fortsetzen fehlgeschlagen:", e));
          }
          continue;
        }

        if (!unwatch(entry.id)) continue;
        changed = true;
        const name = c.name || "Rundmail";
        const detail = `${c.sent_count ?? 0} gesendet${c.failed_count ? `, ${c.failed_count} fehlgeschlagen` : ""}`;
        if (c.status === "sent") {
          if (c.failed_count) toast.warning(`„${name}“ versendet – mit Fehlern`, { description: detail, duration: 15_000 });
          else toast.success(`„${name}“ versendet`, { description: detail, duration: 10_000 });
        } else if (c.status === "failed") {
          toast.error(`„${name}“: Versand nicht abgeschlossen`, { description: detail, duration: 15_000 });
        }
      }

      if (changed) {
        qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
        qc.invalidateQueries({ queryKey: ["comm-campaigns"] });
      }
    };

    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [idsKey, qc]);
};
