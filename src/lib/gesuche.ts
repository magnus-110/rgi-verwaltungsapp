/**
 * Gesuche im Maklerbereich: was RGI-Kunden suchen (art „rgi“) und
 * Suchaufträge, die Eigentümer in der Nutzer-App einstellen (art „eigentuemer“).
 * Eigentümer-Suchaufträge gehen erst live, wenn RGI sie freigibt.
 * Zusammengebracht wird nie über die App, sondern persönlich (Maklervertrag).
 */
import type { BrokerProperty, Zielgruppe } from "@/lib/makler";

export type GesuchArt = "rgi" | "eigentuemer";
export type GesuchStatus = "entwurf" | "pruefung" | "sichtbar" | "abgelehnt" | "beendet";

export interface Gesuch {
  id: string;
  art: GesuchArt;
  status: GesuchStatus;
  titel: string;
  objektart: string | null;
  ort: string | null;
  umkreis_km: number | null;
  zimmer_ab: number | null;
  flaeche_ab: number | null;
  preis_bis: number | null;
  beschreibung: string | null;
  fuer_wen: string | null;
  zielgruppe: Zielgruppe;
  orte: string[];
  gebaeude: string[];
  sichtbar_bis: string | null;
  eingestellt_von: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  geprueft_von: string | null;
  geprueft_am: string | null;
  ablehnungsgrund: string | null;
  created_at: string;
  updated_at: string;
}

export const GESUCH_STATUS_LABEL: Record<GesuchStatus, string> = {
  entwurf: "Entwurf",
  pruefung: "Zur Prüfung",
  sichtbar: "In der App",
  abgelehnt: "Nicht freigegeben",
  beendet: "Beendet",
};

export const OBJEKTARTEN_GESUCH = ["Wohnung", "Haus", "Grundstück", "Garage / Stellplatz"];

const euro = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const zahl = (v: number) => new Intl.NumberFormat("de-DE").format(v);

/** Kurze Eckdaten: „ab 3 Zimmer · ab 70 m² · bis 350.000 € · Pfronten + 5 km“ */
export function gesuchEckdaten(g: Pick<Gesuch, "zimmer_ab" | "flaeche_ab" | "preis_bis" | "ort" | "umkreis_km" | "objektart">): string[] {
  const t: string[] = [];
  if (g.objektart) t.push(g.objektart);
  if (g.zimmer_ab) t.push(`ab ${zahl(g.zimmer_ab)} Zimmer`);
  if (g.flaeche_ab) t.push(`ab ${zahl(g.flaeche_ab)} m²`);
  if (g.preis_bis) t.push(`bis ${euro(g.preis_bis)}`);
  if (g.ort) t.push(g.umkreis_km ? `${g.ort} + ${g.umkreis_km} km` : g.ort);
  return t;
}

/**
 * Passt ein Objekt grob zu einem Gesuch? Nur ein Hinweis für den Makler –
 * geprüft wird immer persönlich.
 */
export function passtZu(g: Gesuch, p: Pick<BrokerProperty, "listing_type" | "city" | "price_eur" | "rooms" | "living_space_sqm" | "property_type">): boolean {
  if (p.listing_type !== "sale") return false;
  if (g.ort && p.city && !p.city.toLowerCase().includes(g.ort.toLowerCase().split(/[ ,+]/)[0])) return false;
  if (g.preis_bis && p.price_eur && Number(p.price_eur) > Number(g.preis_bis) * 1.1) return false;
  if (g.zimmer_ab && p.rooms && Number(p.rooms) < Number(g.zimmer_ab)) return false;
  if (g.flaeche_ab && p.living_space_sqm && Number(p.living_space_sqm) < Number(g.flaeche_ab) * 0.9) return false;
  if (g.objektart && p.property_type) {
    const a = g.objektart.toLowerCase();
    const b = p.property_type.toLowerCase();
    if ((a.startsWith("wohnung") && !b.includes("wohn")) || (a.startsWith("haus") && !b.includes("haus"))) return false;
  }
  return true;
}
