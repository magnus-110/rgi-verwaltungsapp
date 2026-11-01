// ============================================================
// DMS-Ablage-Regeln für generierte Finanzdokumente (UI + Server)
// ------------------------------------------------------------
// Single Source of Truth für:
//   - Ordner-Slugs (building_file_categories.slug) je DMS-Ordner
//     (verwendet von src/components/finance/lib/resolveDmsFolder.ts)
//   - Anzeigename-Bereinigung + Storage-Pfad
//     (verwendet von src/components/finance/lib/uploadGeneratedPdfToDms.ts)
//   - Anzeigenamen/Ordner/Sichtbarkeit für Gesamtabrechnung, Einzelabrechnung
//     und Vermögensbericht (verwendet von BillingSettlement.tsx → DmsJobsProvider)
//
// Deno-kompatibel: nur relative Imports mit .ts-Endung.
// ============================================================

import { unitFilePrefix } from "./unitFilePrefix.ts";

export type DmsFolderKey =
  | "gesamtabrechnung"
  | "einzelabrechnung"
  | "wirtschaftsplan_gesamt"
  | "wirtschaftsplan_einzel"
  | "paragraph_35a"
  | "sammelbericht"
  | "vermoegensbericht";

/**
 * Soll-Struktur (Auszug, relevant für Finance), angelegt per RPC
 * `ensure_stammakte_categories(p_building_id)`, Lookup über den (eindeutigen) Slug:
 *   Jahresbericht
 *     ├── Gesamtabrechnung            (jahresbericht-gesamtabrechnung)
 *     ├── Einzelabrechnung            (jahresbericht-einzelabrechnung)
 *     ├── Gesamtwirtschaftsplan       (jahresbericht-gesamt-wp)
 *     ├── Einzelwirtschaftsplan       (jahresbericht-einzel-wp)
 *     ├── Vermögensbericht            (jahresbericht-vermoegen)
 *     ├── §35a Bescheinigung          (jahresbericht-35a)
 *     └── Sammelberichte              (jahresbericht-sammelberichte)
 */
export const DMS_FOLDER_SLUGS: Record<DmsFolderKey, string> = {
  gesamtabrechnung:       "jahresbericht-gesamtabrechnung",
  einzelabrechnung:       "jahresbericht-einzelabrechnung",
  wirtschaftsplan_gesamt: "jahresbericht-gesamt-wp",
  wirtschaftsplan_einzel: "jahresbericht-einzel-wp",
  paragraph_35a:          "jahresbericht-35a",
  sammelbericht:          "jahresbericht-sammelberichte",
  vermoegensbericht:      "jahresbericht-vermoegen",
};

/** Bereinigung des Anzeigenamens (building_files.display_name). */
export const sanitizeDmsDisplayName = (s: string) =>
  s.replace(/[^a-zA-Z0-9äöüÄÖÜß_\-. ]+/g, "_").replace(/\s+/g, "_").slice(0, 120);

/** Finaler display_name in building_files (bereinigt + ".pdf"-Endung). */
export const dmsDisplayNameMitEndung = (displayName: string) =>
  sanitizeDmsDisplayName(displayName) +
  (displayName.toLowerCase().endsWith(".pdf") ? "" : ".pdf");

/** Storage-Pfad im Bucket "building-files". `id` = crypto.randomUUID(). */
export const dmsStoragePfad = (buildingId: string, periodId: string | null | undefined, id: string) =>
  `${buildingId}/abrechnungen/${periodId || "general"}/${id}.pdf`;

export const DMS_STORAGE_BUCKET = "building-files";

export interface DmsAblageInfo {
  /** DmsJobItem.title */
  title: string;
  /** Label der DMS-Job-Queue (enqueueDms(label, …)) */
  jobLabel: string;
  /** DmsJobItem.displayName (vor sanitizeDmsDisplayName / .pdf) */
  displayName: string;
  folderKey: DmsFolderKey;
  visibility: "alle" | "eigentuemer_only";
  managementMode: "weg";
  /** file_prefix für generate-billing-document */
  filePrefix: string;
}

export function dmsAblageGesamtabrechnung(fiscalYear: number): DmsAblageInfo {
  return {
    title: `Gesamtabrechnung ${fiscalYear}`,
    jobLabel: `Gesamtabrechnung ${fiscalYear}`,
    displayName: `Gesamtabrechnung_${fiscalYear}`,
    folderKey: "gesamtabrechnung",
    visibility: "alle",
    managementMode: "weg",
    filePrefix: `Gesamtabrechnung_${fiscalYear}`,
  };
}

export function dmsAblageVermoegensbericht(fiscalYear: number): DmsAblageInfo {
  return {
    title: `Vermögensbericht ${fiscalYear}`,
    jobLabel: `Vermögensbericht ${fiscalYear}`,
    displayName: `Vermoegensbericht_${fiscalYear}`,
    folderKey: "vermoegensbericht",
    visibility: "alle",
    managementMode: "weg",
    filePrefix: `Vermoegensbericht_${fiscalYear}`,
  };
}

/**
 * Einzelabrechnung: Einheitennummer im Anzeigenamen, damit Eigentuemer mit mehreren
 * Einheiten (z. B. Wohnung + Garage) je Einheit ein eigenes, eindeutiges Dokument
 * im DMS erhalten. `unitNo` = assignment.unit_number als String oder "".
 */
export function dmsAblageEinzelabrechnung(fiscalYear: number, ownerName: string, unitNo: string): DmsAblageInfo {
  return {
    title: ownerName,
    jobLabel: `Einzelabrechnungen ${fiscalYear}`,
    displayName: `${unitFilePrefix(unitNo)}Einzelabrechnung_${fiscalYear}_${ownerName}${unitNo ? `_${unitNo}` : ""}`,
    folderKey: "einzelabrechnung",
    visibility: "eigentuemer_only",
    managementMode: "weg",
    filePrefix: `Einzelabrechnung_${fiscalYear}`,
  };
}
