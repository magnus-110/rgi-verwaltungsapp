import { supabase } from "@/integrations/supabase/client";

/** Ein Treffer aus public.aehnliche_kontakte (Dubletten-Prüfung und Kontaktsuche). */
export interface AehnlicherKontakt {
  contact_id: string;
  anzeige: string;
  kurzname: string | null;
  ort: string | null;
  kontakt_typ: string | null;
  dienstleister: boolean;
  gruende: string[];
  punkte: number;
  /** gleiche E-Mail, Telefonnummer, IBAN oder gleicher Name */
  sicher: boolean;
}

export interface KontaktEingabe {
  name?: string | null;
  telefon?: string | null;
  email?: string | null;
  iban?: string | null;
}

/** Ähnliche Kontakte suchen (Name normalisiert, Personen, Telefon, E-Mail, IBAN). */
export async function aehnlicheKontakte(e: KontaktEingabe, limit = 10): Promise<AehnlicherKontakt[]> {
  const leer = (v?: string | null) => (v ?? "").trim() || null;
  if (!leer(e.name) && !leer(e.telefon) && !leer(e.email) && !leer(e.iban)) return [];
  const { data, error } = await (supabase as any).rpc("aehnliche_kontakte", {
    p_name: leer(e.name),
    p_telefon: leer(e.telefon),
    p_email: leer(e.email),
    p_iban: leer(e.iban),
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as AehnlicherKontakt[];
}

/** Suchtext aus einem Eingabefeld deuten: E-Mail, Telefonnummer oder Name. */
export function sucheAusText(text: string): KontaktEingabe {
  const t = text.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return { email: t };
  if (/^[+\d][\d\s/()-]{5,}$/.test(t)) return { telefon: t };
  return { name: t };
}

/** Anzeigename eines Kontakts (wie in der Adressen-Liste). */
export function kontaktAnzeigename(c: {
  company_name?: string | null;
  short_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string {
  if (!c) return "";
  return (
    c.company_name?.trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    c.short_name?.trim() ||
    "Ohne Namen"
  );
}
