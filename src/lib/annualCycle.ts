export const ANNUAL_CYCLE_TASKS: { key: string; label: string; auto?: boolean }[] = [
  { key: "beschluesse_umgesetzt", label: "Beschlüsse umgesetzt" },
  { key: "heizkostenabrechnung_beantragt", label: "Heizkostenabrechnung eingereicht" },
  { key: "jahresabrechnung_erstellt", label: "Jahresabrechnung erstellt", auto: true },
  { key: "vermoegensbericht_erstellt", label: "Vermögensbericht erstellt", auto: true },
  { key: "wirtschaftsplan_erstellt", label: "Wirtschaftsplan erstellt", auto: true },
  { key: "tops_abfragen", label: "TOPs abfragen" },
  { key: "kassenpruefung", label: "Kassenprüfung" },
  { key: "etv_einberufen", label: "ETV einberufen", auto: true },
  { key: "etv_protokoll_fertig", label: "ETV-Protokoll fertig", auto: true },
  { key: "beschlusssammlung_aktualisiert", label: "Beschlusssammlung aktualisiert", auto: true },
  { key: "paragraph_35a_versendet", label: "§35a-Bescheinigung versendet" },
  { key: "abrechnungsspitzen_gebucht", label: "Abrechnungsspitzen gebucht", auto: true },
  { key: "hausgeldanpassung_umgesetzt", label: "Hausgeldanpassung umgesetzt" },
  { key: "bankabgleich_jahr_abgeschlossen", label: "Bankabgleich Jahr abgeschlossen", auto: true },
  { key: "jahresabschluss_archiviert", label: "Jahresabschluss archiviert" },
];

export const STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Abgeschlossen",
};

export const STATUS_CLASSES: Record<string, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

export type AnnualCycleStatus = "open" | "in_progress" | "done";

export interface FiscalYearOption {
  start: string; // ISO date
  end: string;
  label: string;
}

export function buildFiscalYears(currentYear = new Date().getFullYear()): FiscalYearOption[] {
  // Default: Kalenderjahr-basiert. Liefert 5 Jahre (2 vergangen, jetzt, 2 zukünftig).
  const years: FiscalYearOption[] = [];
  for (let y = currentYear - 2; y <= currentYear + 2; y++) {
    years.push({
      start: `${y}-01-01`,
      end: `${y}-12-31`,
      label: `${y}`,
    });
  }
  return years;
}
