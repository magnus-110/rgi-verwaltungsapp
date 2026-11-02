// Aus einem gewonnenen Angebot einen Verwaltervertrag anlegen – gemeinsam für App
// (useConvertOfferToContract) und Claude-Konnektor (angebot_gebaeude_anlegen).
import { contractEndDate, parseTermYears, toIsoDate } from "./angebot-vorgaben.ts";

/** Mindestangaben des Angebots (Tabelle offers, mit items aus offer_items). */
export type AngebotFuerVertrag = {
  id: string; offer_no: string | null; prospect_name: string; desired_start: string | null;
  units_apartment: number | null; units_commercial: number | null; units_parking: number | null; units_other: number | null;
  rate_apartment: number | null; rate_commercial: number | null; rate_parking: number | null; rate_other: number | null;
  contract_defaults: Record<string, any> | null;
  items?: any[];
};

/** "1.500,00" → 1500; Zahlen bleiben Zahlen; leer/ungültig → null */
export function deZahl(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Legt den Vertrag mit allen Vergütungsbausteinen an und setzt das Angebot auf
 * „gewonnen“ – ohne dass eine Zahl neu eingegeben werden muss.
 */
export async function vertragAusAngebot(db: any, offer: AngebotFuerVertrag, buildingId: string) {
  // appointed_until ist eine DATE-Spalte. Das Angebot fuehrt das Ende
  // als Datum, aeltere Angebote als Freitext — deshalb nach ISO wandeln
  // und im Zweifel aus Beginn und Laufzeit rechnen.
  const appointedUntil =
    toIsoDate(offer.contract_defaults?.["bestellung.bis"]) ||
    contractEndDate(
      offer.desired_start,
      parseTermYears(offer.contract_defaults?.["laufzeit.jahre_anzahl"]) ??
        parseTermYears(offer.contract_defaults?.["laufzeit.jahre"]),
    ) ||
    null;

  const { data: contract, error: cErr } = await db
    .from("management_contracts")
    .insert({
      building_id: buildingId,
      status: "active",
      appointed_from: offer.desired_start,
      appointed_until: appointedUntil,
      parking_billed_separately: (offer.units_parking ?? 0) > 0 && offer.rate_parking != null,
      units_apartment: offer.units_apartment,
      units_commercial: offer.units_commercial,
      units_parking: offer.units_parking,
      units_other: offer.units_other,
      // Vertragswert steht im deutschen Format ("1.500,00")
      approval_limit_amount: deZahl(offer.contract_defaults?.["freigabe.grenze"]) ?? 1500,
      template_version: "rgi_2026",
      notes: `Aus Angebot ${offer.offer_no ?? offer.prospect_name} übernommen.`,
    })
    .select()
    .single();
  if (cErr) throw cErr;

  const feeRows: any[] = [];
  const base = [
    { kind: "apartment", rate: offer.rate_apartment, count: offer.units_apartment, label: "Grundvergütung Wohnungen" },
    { kind: "commercial", rate: offer.rate_commercial, count: offer.units_commercial, label: "Grundvergütung Teileigentum" },
    { kind: "parking", rate: offer.rate_parking, count: offer.units_parking, label: "Grundvergütung Garagen und Stellplätze" },
    { kind: "other", rate: offer.rate_other, count: offer.units_other, label: "Grundvergütung Sonstige" },
  ];
  let pos = 0;
  for (const b of base) {
    if (b.rate == null || !b.count) continue;
    feeRows.push({
      contract_id: contract.id, fee_type: "base", label: b.label, unit_kind: b.kind,
      basis: "unit_month", amount: b.rate, quantity: b.count, is_gross: false,
      vat_rate: 19, debtor: "community", position: pos++, is_active: true,
      // Bei einem Insert mit mehreren Zeilen setzt PostgREST fehlende
      // Spalten auf NULL statt auf den Default — deshalb explizit setzen.
      halved_if_supervised: false,
    });
  }
  for (const it of offer.items ?? []) {
    if (it.is_included === false) continue;
    feeRows.push({
      contract_id: contract.id, fee_type: it.fee_type ?? "custom", label: it.label,
      basis: it.basis, amount: it.amount, percent: it.percent,
      threshold: it.threshold ?? null, min_amount: it.min_amount ?? null,
      max_count: it.max_count ?? null, tier_from: it.tier_from ?? null,
      tier_to: it.tier_to ?? null, halved_if_supervised: !!it.halved_if_supervised,
      is_gross: it.is_gross, vat_rate: it.vat_rate, debtor: it.debtor ?? "community",
      position: pos++, is_active: true,
    });
  }
  if (feeRows.length) {
    const { error: fErr } = await db
      .from("management_contract_fees")
      .insert(feeRows, { defaultToNull: false });
    if (fErr) {
      // Keinen halben Vertrag ohne Vergütung stehen lassen.
      await db.from("management_contracts").delete().eq("id", contract.id);
      throw fErr;
    }
  }

  const { error: uErr } = await db
    .from("offers")
    .update({ status: "won", decided_on: new Date().toISOString().slice(0, 10), won_contract_id: contract.id })
    .eq("id", offer.id);
  if (uErr) throw uErr;

  return contract;
}
