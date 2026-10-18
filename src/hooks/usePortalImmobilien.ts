/**
 * „Immobilien von RGI“ in der Nutzer-App: Angebote, Gesuche, eigener Suchauftrag.
 * Solange der Hauptschalter (Makler-Einstellungen) aus ist, sehen Eigentümer
 * nichts davon; RGI-Mitarbeiter sehen es zur Vorschau.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const db = supabase as any;
export const PK = "portal-immobilien";

export interface Angebot {
  id: string;
  listing_type: "rent" | "sale";
  website_state: string;
  title: string;
  description: string | null;
  postal_code: string | null;
  city: string | null;
  district: string | null;
  property_type: string | null;
  price_eur: number | null;
  cold_rent_eur: number | null;
  warm_rent_eur: number | null;
  commission_text: string | null;
  living_space_sqm: number | null;
  plot_size_sqm: number | null;
  rooms: number | null;
  year_built: number | null;
  available_from: string | null;
  energy_class: string | null;
  features: string[] | null;
  created_at: string;
  images: { path: string; caption: string | null }[];
  startseite?: boolean;
  gemeldet?: boolean;
}

export interface PortalGesuch {
  id: string;
  art: "rgi" | "eigentuemer";
  status: "pruefung" | "sichtbar" | "abgelehnt";
  titel: string;
  objektart: string | null;
  ort: string | null;
  umkreis_km: number | null;
  zimmer_ab: number | null;
  flaeche_ab: number | null;
  preis_bis: number | null;
  beschreibung: string | null;
  fuer_wen: string | null;
  eigen: boolean;
  gemeldet: boolean;
  seit: string;
}

const FOTO_BASIS = "https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/makler-fotos/";
export const fotoUrl = (p: string) => FOTO_BASIS + p.split("/").map(encodeURIComponent).join("/");

const euro = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
export const zahl = (v: number | null | undefined) => (v == null ? null : new Intl.NumberFormat("de-DE").format(v));

export function preisText(a: Angebot) {
  if (a.listing_type === "sale") return a.price_eur ? euro(a.price_eur) : "Preis auf Anfrage";
  if (a.cold_rent_eur) return `${euro(a.cold_rent_eur)} kalt`;
  if (a.warm_rent_eur) return `${euro(a.warm_rent_eur)} warm`;
  return "Miete auf Anfrage";
}

export function gesuchEckdatenPortal(g: PortalGesuch): string[] {
  const t: string[] = [];
  if (g.objektart) t.push(g.objektart);
  if (g.zimmer_ab) t.push(`ab ${zahl(g.zimmer_ab)} Zimmer`);
  if (g.flaeche_ab) t.push(`ab ${zahl(g.flaeche_ab)} m²`);
  if (g.preis_bis) t.push(`bis ${euro(g.preis_bis)}`);
  if (g.ort) t.push(g.umkreis_km ? `${g.ort} + ${g.umkreis_km} km` : g.ort);
  return t;
}

/** Ist der Bereich zu sehen? (an für alle – oder Vorschau für RGI) */
export function usePortalImmobilienStatus() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: [PK, "status", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ aktiv: boolean; vorschau: boolean }> => {
      const { data, error } = await db.rpc("portal_immobilien_status");
      if (error || !data) return { aktiv: false, vorschau: false };
      return { aktiv: !!data.aktiv, vorschau: !!data.vorschau };
    },
  });
  const s = q.data ?? { aktiv: false, vorschau: false };
  return { ...s, sichtbar: s.aktiv || s.vorschau, isLoading: q.isLoading };
}

export function usePortalAngebote(enabled = true) {
  return useQuery({
    queryKey: [PK, "angebote"],
    enabled,
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<Angebot[]> => {
      const { data, error } = await db.rpc("portal_listings");
      if (error) return [];
      return Array.isArray(data) ? (data as Angebot[]) : [];
    },
  });
}

export function usePortalGesuche(enabled = true) {
  return useQuery({
    queryKey: [PK, "gesuche"],
    enabled,
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<PortalGesuch[]> => {
      const { data, error } = await db.rpc("portal_gesuche");
      if (error) return [];
      return Array.isArray(data) ? (data as PortalGesuch[]) : [];
    },
  });
}

export interface OwnerEinstellungen {
  angebote_startseite: boolean;
  angebote_hinweis: boolean;
}

export function useOwnerPortalEinstellungen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [PK, "einstellungen", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<OwnerEinstellungen> => {
      const { data } = await db.from("owner_portal_einstellungen").select("angebote_startseite, angebote_hinweis").eq("user_id", user!.id).maybeSingle();
      return { angebote_startseite: !!data?.angebote_startseite, angebote_hinweis: !!data?.angebote_hinweis };
    },
  });
  const setzen = async (patch: Partial<OwnerEinstellungen>) => {
    if (!user) return;
    const neu = { ...(q.data ?? { angebote_startseite: false, angebote_hinweis: false }), ...patch };
    const { error } = await db
      .from("owner_portal_einstellungen")
      .upsert({ user_id: user.id, ...neu, updated_at: new Date().toISOString() });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: [PK, "einstellungen"] });
  };
  return { data: q.data ?? { angebote_startseite: false, angebote_hinweis: false }, setzen, isLoading: q.isLoading };
}

/** Wohnungen des Eigentümers (für „Um welche Immobilie geht es?“). */
export function useMeineWohnungen(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [PK, "wohnungen", user?.id],
    enabled: enabled && !!user,
    queryFn: async (): Promise<{ id: string; label: string }[]> => {
      const { data: c } = await db.from("contacts").select("id").eq("user_id", user!.id).maybeSingle();
      if (!c) return [];
      const { data } = await db
        .from("contact_building_assignments")
        .select("id, unit_number, buildings:building_id(name)")
        .eq("contact_id", c.id)
        .eq("is_active", true);
      return (data ?? []).map((a: any) => ({
        id: a.id,
        label: `${a.buildings?.name ?? "Wohnung"}${a.unit_number ? ` · WE ${a.unit_number}` : ""}`,
      }));
    },
  });
}
