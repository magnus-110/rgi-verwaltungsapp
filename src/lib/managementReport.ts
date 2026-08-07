export const REPORT_SECTIONS: { key: string; label: string }[] = [
  { key: "sachstand", label: "Sachstandsbericht" },
  { key: "instandhaltung", label: "Instandhaltungsbericht" },
  { key: "vermoegen", label: "Vermögensbericht" },
  { key: "sonstiges", label: "Sonstiges" },
];

export type ReportSections = Record<string, string>;

export const emptyReportSections = (): ReportSections => ({
  sachstand: "",
  instandhaltung: "",
  vermoegen: "",
  sonstiges: "",
});

/**
 * Baut aus den vier Berichtsabschnitten einen normalen Beschreibungstext.
 * Damit sehen Eigentümer den Bericht überall dort, wo die TOP-Beschreibung
 * angezeigt wird (Einladung, Portal, Protokoll), während die Einzelfelder
 * für die Word-Vorlage erhalten bleiben.
 */
export function composeReportDescription(sections: ReportSections | null | undefined): string {
  const s = sections ?? {};
  return REPORT_SECTIONS
    .filter((sec) => (s[sec.key] ?? "").trim().length > 0)
    .map((sec) => `${sec.label}\n${(s[sec.key] ?? "").trim()}`)
    .join("\n\n");
}
