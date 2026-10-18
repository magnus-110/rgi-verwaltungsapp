import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Maklerbereich – gemeinsame Bausteine.
 *
 * Die neuen Tabellen (Fotos, Unterlagen, Einstellungen, Vertretungen) und die
 * neuen Spalten stehen noch nicht in types.ts. Deshalb läuft der ganze
 * Maklerbereich über diesen untypisierten Client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<any>;

export const FOTO_BUCKET = "makler-fotos";
export const UNTERLAGEN_BUCKET = "makler-unterlagen";
export const RGI_LOGO_URL =
  "https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/Logo/RGI%20Logo.png";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------
export type ObjektStatus = "entwurf" | "vermarktung" | "reserviert" | "abgeschlossen";
export type WebsiteStand = "aktiv" | "reserviert" | "verkauft" | "vermietet";
export type LeadStatus = "neu" | "kontaktiert" | "besichtigung" | "angebot" | "abschluss" | "absage";

export interface BrokerProperty {
  id: string;
  listing_type: "rent" | "sale";
  is_active: boolean;
  title: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  price_eur: number | null;
  deposit_eur: number | null;
  cold_rent_eur: number | null;
  warm_rent_eur: number | null;
  service_charge_eur: number | null;
  heating_cost_eur: number | null;
  commission_text: string | null;
  commission_note: string | null;
  living_space_sqm: number | null;
  plot_size_sqm: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  available_from: string | null;
  property_type: string | null;
  property_subtype: string | null;
  condition: string | null;
  heating_type: string | null;
  energy_source: string | null;
  energy_certificate_type: string | null;
  energy_certificate_date: string | null;
  energy_class: string | null;
  energy_value: number | null;
  features: string[] | null;
  description: string | null;
  internal_notes: string | null;
  owner_contact_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status: ObjektStatus;
  website_state: WebsiteStand;
  show_on_website: boolean;
  show_in_portal: boolean;
  is_reference: boolean;
  reference_order: number | null;
  display_order: number | null;
  display_hidden: boolean;
  assigned_to: string | null;
  slug: string | null;
  street: string | null;
  house_number: string | null;
  district: string | null;
  closed_at: string | null;
}

export interface BrokerImage {
  id: string;
  property_id: string;
  storage_path: string;
  sort_order: number;
  caption: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface BrokerDocument {
  id: string;
  property_id: string;
  category: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface LeadContact {
  short_name: string | null;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface BrokerLead {
  id: string;
  property_id: string;
  contact_id: string | null;
  external_name: string | null;
  external_email: string | null;
  external_phone: string | null;
  status: LeadStatus;
  rating: number | null;
  notes: string | null;
  source: string | null;
  inquiry_id: string | null;
  last_contact_at: string | null;
  outcome_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contacts?: LeadContact | null;
  broker_properties?: { id: string; title: string; listing_type: string; assigned_to: string | null } | null;
}

export interface LeadEvent {
  id: string;
  lead_id: string;
  event_type: string;
  occurred_at: string;
  title: string | null;
  body: string | null;
  email_id: string | null;
  calendar_event_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StaffMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string;
  broker_mode_enabled: boolean | null;
}

// ---------------------------------------------------------------------------
// Bezeichnungen
// ---------------------------------------------------------------------------
export const STATUS_LABEL: Record<ObjektStatus, string> = {
  entwurf: "Entwurf",
  vermarktung: "In Vermarktung",
  reserviert: "Reserviert",
  abgeschlossen: "Abgeschlossen",
};
export const STATUS_FARBE: Record<ObjektStatus, string> = {
  entwurf: "bg-muted text-muted-foreground border-border",
  vermarktung: "bg-emerald-50 text-emerald-800 border-emerald-200",
  reserviert: "bg-amber-50 text-amber-800 border-amber-200",
  abgeschlossen: "bg-slate-100 text-slate-700 border-slate-200",
};
export const OBJEKT_STATUS: ObjektStatus[] = ["entwurf", "vermarktung", "reserviert", "abgeschlossen"];

export const LEAD_LABEL: Record<LeadStatus, string> = {
  neu: "Neu",
  kontaktiert: "Kontaktiert",
  besichtigung: "Besichtigung",
  angebot: "Angebot",
  abschluss: "Zusage",
  absage: "Absage",
};
export const LEAD_FARBE: Record<LeadStatus, string> = {
  neu: "bg-blue-50 text-blue-800 border-blue-200",
  kontaktiert: "bg-violet-50 text-violet-800 border-violet-200",
  besichtigung: "bg-amber-50 text-amber-800 border-amber-200",
  angebot: "bg-orange-50 text-orange-800 border-orange-200",
  abschluss: "bg-emerald-50 text-emerald-800 border-emerald-200",
  absage: "bg-red-50 text-red-800 border-red-200",
};
export const LEAD_STATUS: LeadStatus[] = ["neu", "kontaktiert", "besichtigung", "angebot", "abschluss", "absage"];

/** Die fünf Spalten / Schritte. „Abgeschlossen" fasst Zusage und Absage zusammen. */
export type LeadSpalte = "neu" | "kontaktiert" | "besichtigung" | "angebot" | "abgeschlossen";
export const LEAD_SPALTEN: { key: LeadSpalte; label: string }[] = [
  { key: "neu", label: "Neu" },
  { key: "kontaktiert", label: "Kontaktiert" },
  { key: "besichtigung", label: "Besichtigung" },
  { key: "angebot", label: "Angebot" },
  { key: "abgeschlossen", label: "Abgeschlossen" },
];
export function spalteVon(status: LeadStatus): LeadSpalte {
  return status === "abschluss" || status === "absage" ? "abgeschlossen" : status;
}
export function schrittIndex(status: LeadStatus): number {
  return LEAD_SPALTEN.findIndex((s) => s.key === spalteVon(status));
}

export const QUELLEN: { key: string; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "portal", label: "Nutzer-App" },
  { key: "email", label: "E-Mail" },
  { key: "telefon", label: "Telefon" },
  { key: "manuell", label: "Manuell" },
];
export function quelleLabel(q: string | null | undefined): string {
  if (!q) return "Manuell";
  return QUELLEN.find((x) => x.key === q)?.label ?? q;
}

export const UNTERLAGEN_KATEGORIEN: { key: string; label: string }[] = [
  { key: "expose", label: "Exposé" },
  { key: "grundrisse", label: "Grundrisse" },
  { key: "energieausweis", label: "Energieausweis" },
  { key: "grundbuchauszug", label: "Grundbuchauszug" },
  { key: "teilungserklaerung", label: "Teilungserklärung" },
  { key: "protokolle", label: "Protokolle" },
  { key: "abrechnungen", label: "Abrechnungen" },
  { key: "wirtschaftsplan", label: "Wirtschaftsplan" },
  { key: "sonstiges", label: "Sonstiges" },
];
export const UNTERLAGEN_CHECKLISTE = ["energieausweis", "grundrisse", "grundbuchauszug", "expose"];
export function kategorieLabel(k: string): string {
  return UNTERLAGEN_KATEGORIEN.find((x) => x.key === k)?.label ?? k;
}

export const OBJEKTARTEN = [
  "Wohnung", "Haus", "Grundstück", "Gewerbe", "Garage / Stellplatz", "Sonstiges",
];
export const UNTERARTEN: Record<string, string[]> = {
  Wohnung: ["Etagenwohnung", "Erdgeschosswohnung", "Dachgeschosswohnung", "Maisonette", "Penthouse", "Apartment", "Souterrain"],
  Haus: ["Einfamilienhaus", "Doppelhaushälfte", "Reihenhaus", "Mehrfamilienhaus", "Bauernhaus", "Villa"],
  Grundstück: ["Baugrundstück", "Wiese / Acker", "Wald"],
  Gewerbe: ["Büro", "Laden", "Praxis", "Gastronomie", "Halle / Lager"],
  "Garage / Stellplatz": ["Garage", "Tiefgarage", "Stellplatz"],
};
export const ZUSTAENDE = [
  "Neubau", "Erstbezug", "Neuwertig", "Saniert", "Modernisiert", "Gepflegt",
  "Renovierungsbedürftig", "Sanierungsbedürftig",
];
export const HEIZUNGEN = [
  "Zentralheizung", "Fußbodenheizung", "Etagenheizung", "Fernwärme", "Wärmepumpe", "Ofenheizung", "Sonstige",
];
export const ENERGIETRAEGER = [
  "Gas", "Öl", "Strom", "Fernwärme", "Holz / Pellets", "Erdwärme", "Luft-Wärmepumpe", "Solar", "Sonstiges",
];
export const ENERGIEKLASSEN = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];
export const AUSSTATTUNG = [
  "Balkon", "Terrasse", "Garten", "Garage", "Stellplatz", "Aufzug", "Keller", "Einbauküche",
  "Barrierefrei", "Möbliert", "Haustiere erlaubt", "Glasfaser", "Kamin", "Bergblick",
];

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
export function euro(v: number | null | undefined, genau = false): string {
  if (v == null) return "";
  return (genau ? eur2 : eur0).format(Number(v));
}
export function zahl(v: number | null | undefined): string {
  if (v == null) return "";
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(v));
}

/** Hauptpreis eines Objekts für Karten und Listen. */
export function preisText(p: Pick<BrokerProperty, "listing_type" | "price_eur" | "cold_rent_eur" | "warm_rent_eur">): string {
  if (p.listing_type === "sale") return p.price_eur != null ? euro(p.price_eur) : "Preis fehlt";
  if (p.cold_rent_eur != null) return `${euro(p.cold_rent_eur)} kalt`;
  if (p.warm_rent_eur != null) return `${euro(p.warm_rent_eur)} warm`;
  return "Miete fehlt";
}

export function artLabel(t: string): string {
  return t === "sale" ? "Kauf" : "Miete";
}

export function personName(p: Pick<StaffMember, "first_name" | "last_name" | "email"> | null | undefined): string {
  if (!p) return "";
  const n = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return n || p.email || "";
}
export function initialen(p: Pick<StaffMember, "first_name" | "last_name" | "email"> | null | undefined): string {
  if (!p) return "";
  const a = (p.first_name || "").trim()[0] || "";
  const b = (p.last_name || "").trim()[0] || "";
  return (a + b).toUpperCase() || (p.email || "?")[0].toUpperCase();
}

export function kontaktLabel(c: LeadContact | null | undefined): string {
  if (!c) return "";
  return c.short_name || c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "";
}

export function leadName(l: Pick<BrokerLead, "external_name" | "external_email" | "contacts">): string {
  return l.external_name?.trim() || kontaktLabel(l.contacts) || l.external_email || "Ohne Namen";
}

export function fotoUrl(path: string): string {
  return db.storage.from(FOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Tage seit einem Zeitpunkt (abgerundet). */
export function tageSeit(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Stand „still": Kontaktiert/Angebot und seit mehr als 5 Tagen nichts passiert. */
export function istStill(l: Pick<BrokerLead, "status" | "last_contact_at" | "created_at">): number | null {
  if (l.status !== "kontaktiert" && l.status !== "angebot") return null;
  const t = tageSeit(l.last_contact_at || l.created_at);
  return t > 5 ? t : null;
}

/** Was für die Website noch fehlt (nur Fotos, Beschreibung, Preis). */
export function fehlendeAngaben(p: BrokerProperty, fotoAnzahl: number): string[] {
  const f: string[] = [];
  if (fotoAnzahl === 0) f.push("Fotos");
  if (!p.description?.trim()) f.push("Beschreibung");
  const preis = p.listing_type === "sale" ? p.price_eur : p.cold_rent_eur ?? p.warm_rent_eur;
  if (preis == null) f.push("Preis");
  return f;
}

/** Fehlen bei einem Kaufobjekt die Angaben zum Energieausweis? */
export function energieFehlt(p: BrokerProperty): boolean {
  return p.listing_type === "sale" && (!p.energy_certificate_type || (p.energy_value == null && !p.energy_class));
}

/** Dateinamen ohne Umlaute, Leerzeichen und Sonderzeichen. */
export function dateinameBereinigen(name: string): string {
  const punkt = name.lastIndexOf(".");
  const basis = punkt > 0 ? name.slice(0, punkt) : name;
  const endung = punkt > 0 ? name.slice(punkt + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const sauber = basis
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .replace(/_+/g, "_")
    .slice(0, 80) || "datei";
  return endung ? `${sauber}.${endung}` : sauber;
}

/** Bild im Browser auf max. 2000 px (lange Seite) als JPEG verkleinern. */
export async function bildVerkleinern(
  file: File,
  max = 2000,
  qualitaet = 0.85,
): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Dieses Bild kann nicht gelesen werden. Bitte JPG oder PNG verwenden."));
      i.src = url;
    });
    const faktor = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * faktor));
    const height = Math.max(1, Math.round(img.naturalHeight * faktor));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Das Bild konnte nicht verkleinert werden.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Das Bild konnte nicht verkleinert werden."))), "image/jpeg", qualitaet),
    );
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Einheitliche Fehlermeldung. */
export function fehler(titel: string, e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  toast.error(titel, { description: msg || undefined });
}

/**
 * Objekt ändern und prüfen, dass wirklich eine Zeile geändert wurde.
 * (Ohne Berechtigung meldet die Datenbank keinen Fehler, ändert aber nichts.)
 */
export async function objektAendern(id: string, patch: Record<string, unknown>) {
  const { data, error } = await db.from("broker_properties").update(patch).eq("id", id).select("id, updated_at");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Keine Berechtigung für dieses Objekt – oder es wurde inzwischen gelöscht.");
  return data[0] as { id: string; updated_at: string };
}

/** Stand eines Interessenten ändern und im Verlauf vermerken. */
export async function leadStandSetzen(
  leadId: string,
  status: LeadStatus,
  userId: string | null | undefined,
  grund?: string | null,
) {
  const patch: Record<string, unknown> = { status };
  if (status === "absage") patch.outcome_reason = grund?.trim() || null;
  const { data, error } = await db.from("broker_leads").update(patch).eq("id", leadId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Keine Berechtigung für diesen Interessenten.");
  const { error: e2 } = await db.from("broker_lead_events").insert({
    lead_id: leadId,
    event_type: "status_change",
    title: `Stand: ${LEAD_LABEL[status]}`,
    body: status === "absage" && grund?.trim() ? `Grund: ${grund.trim()}` : null,
    occurred_at: new Date().toISOString(),
    created_by: userId ?? null,
  });
  if (e2) throw e2;
}

export function datum(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function datumZeit(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function kurzDatumZeit(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
