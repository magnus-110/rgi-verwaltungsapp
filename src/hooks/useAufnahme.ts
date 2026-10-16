/**
 * Lädt die Aufnahme eines Gebäudes und speichert jede Änderung nach kurzer
 * Pause von selbst. Ohne Netz bleibt der Stand auf dem Gerät liegen und
 * wird nachgeschickt, sobald wieder Verbindung da ist.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AufnahmeAntworten } from "@/lib/aufnahme";

export type SpeicherStatus = "gespeichert" | "speichert" | "offline";

export interface AufnahmeZeile {
  id?: string;
  building_id: string;
  termin_am: string | null;
  gespraechspartner: string | null;
  antworten: AufnahmeAntworten;
  updated_at?: string;
}

const lokalKey = (id: string) => `aufnahme:${id}`;

export function useAufnahme(buildingId: string) {
  const qc = useQueryClient();
  const [zeile, setZeile] = useState<AufnahmeZeile | null>(null);
  const [status, setStatus] = useState<SpeicherStatus>("gespeichert");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aktuell = useRef<AufnahmeZeile | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["aufnahme", buildingId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("aufnahmen")
        .select("id, building_id, termin_am, gespraechspartner, antworten, updated_at")
        .eq("building_id", buildingId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AufnahmeZeile | null;
    },
  });

  useEffect(() => {
    // Nur einmal übernehmen – sonst würde ein Neuladen im Hintergrund laufende Eingaben überschreiben
    if (isLoading || aktuell.current) return;
    let start: AufnahmeZeile = data ?? { building_id: buildingId, termin_am: null, gespraechspartner: null, antworten: {} };
    // Ungesendeter Stand auf dem Gerät hat Vorrang
    try {
      const lokal = localStorage.getItem(lokalKey(buildingId));
      if (lokal) {
        start = JSON.parse(lokal);
        setStatus("offline");
      }
    } catch {
      /* egal */
    }
    aktuell.current = start;
    setZeile(start);
  }, [data, isLoading, buildingId]);

  const senden = useCallback(async () => {
    const z = aktuell.current;
    if (!z) return;
    setStatus("speichert");
    const { error } = await (supabase as any)
      .from("aufnahmen")
      .upsert(
        { building_id: buildingId, termin_am: z.termin_am, gespraechspartner: z.gespraechspartner, antworten: z.antworten },
        { onConflict: "building_id" },
      );
    if (error) {
      try {
        localStorage.setItem(lokalKey(buildingId), JSON.stringify(z));
      } catch {
        /* egal */
      }
      setStatus("offline");
      return;
    }
    try {
      localStorage.removeItem(lokalKey(buildingId));
    } catch {
      /* egal */
    }
    setStatus("gespeichert");
    qc.invalidateQueries({ queryKey: ["aufnahmen-liste"] });
  }, [buildingId, qc]);

  // Liegt beim Öffnen noch ein ungesendeter Stand auf dem Gerät: gleich nachschicken
  const ersterVersuch = useRef(false);
  useEffect(() => {
    if (!zeile || ersterVersuch.current) return;
    ersterVersuch.current = true;
    if (status === "offline") senden();
  }, [zeile, status, senden]);

  useEffect(() => {
    const wieder = () => aktuell.current && senden();
    window.addEventListener("online", wieder);
    return () => window.removeEventListener("online", wieder);
  }, [senden]);

  // Beim Verlassen noch ausstehende Änderungen senden
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        senden();
      }
    },
    [senden],
  );

  const aendern = useCallback(
    (fn: (z: AufnahmeZeile) => AufnahmeZeile) => {
      if (!aktuell.current) return;
      const neu = fn(aktuell.current);
      aktuell.current = neu;
      setZeile(neu);
      setStatus("speichert");
      try {
        localStorage.setItem(lokalKey(buildingId), JSON.stringify(neu));
      } catch {
        /* egal */
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        senden();
      }, 700);
    },
    [buildingId, senden],
  );

  /** Ändert einen Bereich der Antworten, z. B. setze("heizung", { art: "Öl" }) */
  const setze = useCallback(
    <K extends keyof AufnahmeAntworten>(bereich: K, teil: Partial<NonNullable<AufnahmeAntworten[K]>>) =>
      aendern((z) => ({
        ...z,
        antworten: { ...z.antworten, [bereich]: { ...((z.antworten[bereich] as object) ?? {}), ...teil } },
      })),
    [aendern],
  );

  return { zeile, antworten: zeile?.antworten ?? {}, laedt: isLoading || !zeile, status, setze, aendern };
}
