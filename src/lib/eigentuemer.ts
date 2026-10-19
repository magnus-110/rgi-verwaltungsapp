import { supabase } from "@/integrations/supabase/client";

/** Ein Eigentümer (Zuordnung zu einer Einheit) mit Konto, Mandat und Hausgeld. */
export interface Eigentuemer {
  assignmentId: string;
  contactId: string | null;
  name: string;
  einheit: string;
  /** Lage der Einheit, z. B. „EG links" */
  lage: string | null;
  kontoinhaber: string | null;
  iban: string | null;
  bic: string | null;
  /** monatliches Hausgeld heute laut Kostenzeilen (aus dem gültigen Wirtschaftsplan) */
  hausgeldMonat: number;
  mandat: Mandat | null;
  /** Mandat zur Freigabe (z. B. aus dem Eigentümer-Fragebogen) */
  vorschlag: Mandat | null;
}

export interface Mandat {
  id: string;
  building_id: string;
  assignment_id: string | null;
  mandatsreferenz: string;
  kontoinhaber: string | null;
  iban: string | null;
  bic: string | null;
  unterschrieben_am: string | null;
  dokument_pfad: string | null;
  dokument_name: string | null;
  quelle: string;
  status: string;
  zuletzt_genutzt: string | null;
  notiz?: string | null;
}

const cleanIban = (i: string | null | undefined) => (i ?? "").replace(/\s+/g, "").toUpperCase() || null;

function anzeigeName(a: any): string {
  const c = a.contacts ?? {};
  const firma = a.company_name_override || c.company_name;
  const vor = a.first_name_override || c.first_name;
  const nach = a.last_name_override || c.last_name;
  return (firma || [vor, nach].filter(Boolean).join(" ") || c.short_name || "Eigentümer").trim();
}

export function monatlich(betrag: number, intervall: string | null): number {
  if (intervall === "quartal" || intervall === "quarterly") return betrag / 3;
  if (intervall === "jaehrlich" || intervall === "yearly" || intervall === "jahr") return betrag / 12;
  if (intervall === "halbjaehrlich") return betrag / 6;
  return betrag;
}

/** Alle aktiven Eigentümer einer Liegenschaft, sortiert nach Einheit. */
export async function ladeEigentuemer(buildingId: string, stichtag = new Date().toISOString().slice(0, 10)): Promise<Eigentuemer[]> {
  const { data: zuordnungen, error } = await (supabase as any)
    .from("contact_building_assignments")
    .select(
      "id, contact_id, unit_number, floor_location, iban_override, iban_holder_override, first_name_override, last_name_override, company_name_override, " +
        "contacts(first_name, last_name, company_name, short_name), contact_bank_accounts!contact_building_assignments_bank_account_id_fkey(account_holder, iban, bic)",
    )
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .eq("role_in_building", "eigentuemer");
  if (error) throw error;
  const ids = (zuordnungen ?? []).map((a: any) => a.id);
  if (!ids.length) return [];

  const kontaktIds = [...new Set((zuordnungen ?? []).map((a: any) => a.contact_id).filter(Boolean))];
  const [{ data: kosten }, { data: mandate }, { data: standardKonten }] = await Promise.all([
    (supabase as any)
      .from("contact_building_costs")
      .select("assignment_id, amount, interval, valid_from, valid_to")
      .in("assignment_id", ids)
      .eq("cost_type", "Hausgeld"),
    (supabase as any).from("sepa_mandates").select("*").eq("building_id", buildingId).in("status", ["aktiv", "pruefen"]),
    kontaktIds.length
      ? (supabase as any).from("contact_bank_accounts").select("contact_id, account_holder, iban, bic, is_default").in("contact_id", kontaktIds)
      : Promise.resolve({ data: [] }),
  ]);

  return (zuordnungen ?? [])
    .map((a: any): Eigentuemer => {
      // Konto der Zuordnung, sonst das Standardkonto des Kontakts
      const eigene = (standardKonten ?? []).filter((k: any) => k.contact_id === a.contact_id);
      const konto = a.contact_bank_accounts ?? eigene.find((k: any) => k.is_default) ?? eigene[0] ?? {};
      const hausgeld = (kosten ?? [])
        .filter((k: any) => k.assignment_id === a.id && (!k.valid_from || k.valid_from <= stichtag) && (!k.valid_to || k.valid_to >= stichtag))
        .reduce((s: number, k: any) => s + monatlich(Number(k.amount) || 0, k.interval), 0);
      return {
        assignmentId: a.id,
        contactId: a.contact_id,
        name: anzeigeName(a),
        einheit: a.unit_number ?? "",
        lage: (a.floor_location ?? "").trim() || null,
        kontoinhaber: a.iban_holder_override || konto.account_holder || null,
        iban: cleanIban(a.iban_override || konto.iban),
        bic: konto.bic ?? null,
        hausgeldMonat: Math.round(hausgeld * 100) / 100,
        mandat: (mandate ?? []).find((m: any) => m.assignment_id === a.id && m.status === "aktiv") ?? null,
        vorschlag: (mandate ?? []).find((m: any) => m.assignment_id === a.id && m.status === "pruefen") ?? null,
      };
    })
    .sort((x: Eigentuemer, y: Eigentuemer) => x.einheit.localeCompare(y.einheit, "de", { numeric: true }) || x.name.localeCompare(y.name, "de"));
}

/** Mandat einsatzbereit: IBAN, Unterschriftsdatum und Referenz vorhanden, nicht verfallen. */
export function mandatBereit(m: Mandat | null | undefined): boolean {
  return !!m && m.status === "aktiv" && !!m.iban && !!m.unterschrieben_am && !!m.mandatsreferenz && !mandatVerfallen(m);
}

/** Ein Mandat verfällt, wenn es 36 Monate nicht genutzt wurde. */
export function mandatVerfallen(m: Mandat): boolean {
  // Bei übernommenen Mandaten ist die letzte Nutzung (im alten System) unbekannt.
  if (!m.zuletzt_genutzt && m.quelle === "uebernahme") return false;
  const basis = m.zuletzt_genutzt ?? m.unterschrieben_am;
  if (!basis) return false;
  const grenze = new Date();
  grenze.setMonth(grenze.getMonth() - 36);
  return basis < grenze.toISOString().slice(0, 10);
}
