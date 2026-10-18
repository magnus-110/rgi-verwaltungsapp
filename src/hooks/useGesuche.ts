import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/makler";
import { MK } from "@/hooks/useMakler";
import type { Gesuch } from "@/lib/gesuche";

export type GesuchMitKontakt = Gesuch & {
  contacts: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
};

/** Alle Gesuche und Suchaufträge (nur Makler). */
export function useGesuche() {
  return useQuery({
    queryKey: [MK, "gesuche"],
    queryFn: async (): Promise<GesuchMitKontakt[]> => {
      const { data, error } = await db
        .from("broker_gesuche")
        .select("*, contacts(first_name, last_name, company_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GesuchMitKontakt[];
    },
  });
}

/** Häuser für die Auswahl „Wer soll es sehen?“. */
export function useGebaeudeAuswahl() {
  return useQuery({
    queryKey: [MK, "gebaeude-auswahl"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{ id: string; name: string; city: string | null }[]> => {
      const { data, error } = await db.from("buildings").select("id, name, city").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; city: string | null }[];
    },
  });
}
