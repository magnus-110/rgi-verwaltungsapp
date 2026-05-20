// ============================================================
// Sammelbericht-Payload-Remapper
// ------------------------------------------------------------
// Wandelt die bestehenden Sub-Payloads (buildOverallPayload,
// buildOwnerPayload, buildAssetReportPayload, buildOverall/OwnerPlanPayload,
// §35a-buildVarsFor) auf die Platzhalter-Konvention der NEUEN
// Sammelbericht-Vorlage RGI_WEG_Jahresbericht_v2_template.docx um.
//
// PRINZIP: NUR additiv — alte Felder bleiben erhalten, neue
// Aliase werden ergänzt. Einzel-Vorlagen funktionieren unverändert
// weiter, da diese Funktionen nur im Sammelbericht-Aggregator
// (BillingSettlement.tsx → downloadCombined) aufgerufen werden.
// ============================================================

const pick = <T,>(...vals: (T | undefined | null)[]): T | undefined => {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v as T;
  return undefined;
};

/** Deckblatt-Felder — wird in Top-Level UND in jeden Sub-Payload injiziert. */
export function remapCommon(src: any = {}): Record<string, any> {
  const out: Record<string, any> = { ...src };
  out.gebaeude_name = pick(src.gebaeude_name, src.building_name) ?? "";
  out.gebaeude_adresse = pick(src.gebaeude_adresse, src.building_address) ?? "";
  out.datum_heute = pick(src.datum_heute, src.erstell_datum, src.erstellt_am, src.created_at) ?? "";
  out.abrechnungszeitraum_von = pick(src.abrechnungszeitraum_von, src.periode_von, src.period_from) ?? "";
  out.abrechnungszeitraum_bis = pick(src.abrechnungszeitraum_bis, src.periode_bis, src.period_to) ?? "";
  out.wirtschaftsjahr = pick(src.wirtschaftsjahr, src.fiscal_year) ?? "";
  return out;
}

export function remapAbrechnungGesamt(src: any = {}): Record<string, any> {
  if (!src) return {};
  return {
    ...src,
    ...remapCommon(src),
  };
}

export function remapAbrechnungEinzel(src: any = {}): Record<string, any> {
  if (!src) return {};
  const sektionen = Array.isArray(src.sektionen)
    ? src.sektionen.map((s: any) => ({
        ...s,
        bezeichnung: pick(s.bezeichnung, s.sektion) ?? "",
        zeilen: Array.isArray(s.zeilen)
          ? s.zeilen.map((z: any) => ({
              ...z,
              // verteiler existiert bereits; verteilungsrelevant bleibt parallel erhalten
              verteiler: pick(z.verteiler, z.verteilungsrelevant) ?? "",
            }))
          : s.zeilen,
      }))
    : src.sektionen;
  return {
    ...src,
    ...remapCommon(src),
    sektionen,
  };
}

export function remapVermoegen(src: any = {}): Record<string, any> {
  if (!src) return {};
  const mapItems = (arr: any[]) =>
    Array.isArray(arr)
      ? arr.map((r: any) => ({
          ...r,
          konto_name: pick(r.konto_name, r.bezeichnung) ?? "",
          endbestand: pick(r.endbestand, r.betrag) ?? "",
        }))
      : arr;
  return {
    ...src,
    ...remapCommon(src),
    liquide_mittel: mapItems(src.liquide_mittel),
    guthaben_nachzahlung: mapItems(src.guthaben_nachzahlung),
    abgrenzung: mapItems(src.abgrenzung),
    forderungen: mapItems(src.forderungen),
    verbindlichkeiten: mapItems(src.verbindlichkeiten),
    carry_accounts: mapItems(src.carry_accounts),
    bestaende_ende: pick(src.bestaende_ende, src.sum_liquide_mittel) ?? "",
  };
}

export function remapP35a(src: any = {}): Record<string, any> {
  if (!src) return {};
  return {
    ...src,
    ...remapCommon(src),
  };
}

export function remapWirtschaftsplanGesamt(src: any = {}): Record<string, any> {
  if (!src) return {};
  return {
    ...src,
    ...remapCommon(src),
    summe_plan: pick(src.summe_plan, src.total_planned) ?? "",
  };
}

export function remapWirtschaftsplanEinzel(src: any = {}): Record<string, any> {
  if (!src) return {};
  return {
    ...src,
    ...remapCommon(src),
    summe_plan: pick(src.summe_plan, src.total_planned) ?? "",
  };
}
