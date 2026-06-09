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

export interface FiscalYearOptions {
  /** 1–12, Default 1 (Januar) */
  startMonth?: number;
  /** 1–28, Default 1 */
  startDay?: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Liefert das Enddatum (YYYY-MM-DD) für einen Wirtschaftsjahr-Start (1 Jahr − 1 Tag). */
function computeEnd(startYear: number, startMonth: number, startDay: number): string {
  // start = startYear-startMonth-startDay, end = (gleiches Datum +1 Jahr) − 1 Tag
  const endDate = new Date(Date.UTC(startYear + 1, startMonth - 1, startDay));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return `${endDate.getUTCFullYear()}-${pad2(endDate.getUTCMonth() + 1)}-${pad2(endDate.getUTCDate())}`;
}

export function buildFiscalYears(
  currentYear = new Date().getFullYear(),
  opts: FiscalYearOptions = {}
): FiscalYearOption[] {
  const startMonth = Math.min(12, Math.max(1, opts.startMonth ?? 1));
  const startDay = Math.min(28, Math.max(1, opts.startDay ?? 1));
  const calendar = startMonth === 1 && startDay === 1;

  const years: FiscalYearOption[] = [];
  for (let y = currentYear - 2; y <= currentYear + 2; y++) {
    const start = `${y}-${pad2(startMonth)}-${pad2(startDay)}`;
    const end = calendar ? `${y}-12-31` : computeEnd(y, startMonth, startDay);
    const label = calendar ? `${y}` : `${y}/${y + 1}`;
    years.push({ start, end, label });
  }
  return years;
}
