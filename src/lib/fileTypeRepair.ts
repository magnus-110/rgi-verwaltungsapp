import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Startet einmal pro Browser im Hintergrund die Reparatur falsch gespeicherter
 * PDF-Dateitypen (Edge Function repair-file-types). Danach werden z. B. die
 * Rechnungen von Absendern, deren Programm PDFs als „octet-stream“ schickt,
 * überall wieder in der Vorschau angezeigt statt heruntergeladen.
 *
 * Läuft still: Bricht der Lauf ab (Tab geschlossen, keine Rechte, Funktion noch
 * nicht bereitgestellt), wird es beim nächsten Öffnen der App erneut versucht.
 */

const DONE_KEY = "rgi.fileTypeRepair.v1";
const START_DELAY_MS = 20_000;
const TARGETS = ["email_attachments", "building_files", "invoices"] as const;

const isDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === "done";
  } catch {
    return true; // ohne Speicher lieber gar nicht laufen
  }
};

const markDone = () => {
  try {
    localStorage.setItem(DONE_KEY, "done");
  } catch {
    /* ignore */
  }
};

let running = false;

const runRepair = async () => {
  if (running || isDone()) return;
  running = true;
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session) return; // nicht angemeldet — später erneut

    let totalFixed = 0;
    for (const target of TARGETS) {
      let cursor: string | null = null;
      // Sicherheitsgrenze gegen Endlosschleifen
      for (let round = 0; round < 2000; round++) {
        const { data, error } = await supabase.functions.invoke("repair-file-types", {
          body: { target, cursor },
        });
        if (error || !data || (data as any).error) {
          console.warn("[fileTypeRepair] abgebrochen:", error?.message || (data as any)?.error);
          return; // später erneut versuchen
        }
        const res = data as { done: boolean; cursor: string | null; fixed: number };
        totalFixed += res.fixed || 0;
        if (res.done || !res.cursor) break;
        cursor = res.cursor;
      }
    }
    console.info(`[fileTypeRepair] fertig, ${totalFixed} Datei(en) korrigiert`);
    markDone();
  } catch (e) {
    console.warn("[fileTypeRepair] Fehler:", e);
  } finally {
    running = false;
  }
};

/** Unsichtbare Komponente fürs Admin-Layout. */
export const FileTypeRepairOnce = () => {
  useEffect(() => {
    if (isDone()) return;
    const t = setTimeout(runRepair, START_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return null;
};
