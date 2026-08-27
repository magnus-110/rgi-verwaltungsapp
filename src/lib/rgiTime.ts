// Rechnen mit Zeit — an einer Stelle, weil Liste, Projektansicht und
// Erfassung sonst dreimal leicht unterschiedlich runden würden.

import type { RgiTimeEntry, RgiProject } from "@/hooks/useRgi";

/** Nimmt „1:30“, „1,5“ oder „90“ und macht daraus Minuten. */
export function parseDuration(input: string): number {
  const s = (input ?? "").trim();
  if (!s) return 0;
  if (s.includes(":")) {
    const [h, m] = s.split(":").map((x) => Number(x));
    return (h || 0) * 60 + (m || 0);
  }
  if (s.includes(",") || s.includes(".")) {
    const hours = Number(s.replace(",", "."));
    return isNaN(hours) ? 0 : Math.round(hours * 60);
  }
  return Number(s) || 0;
}

/** 90 → „1,5 Std“, 45 → „45 Min“ */
export function shortDuration(min: number): string {
  if (min <= 0) return "—";
  if (min < 60) return `${min} Min`;
  return `${(min / 60).toLocaleString("de-DE", { maximumFractionDigits: 2 })} Std`;
}

/** Ausgeschrieben für die Kontrollzeile beim Eintragen. */
export function longDuration(min: number): string {
  if (min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} Minuten`;
  if (m === 0) return h === 1 ? "1 Stunde" : `${h} Stunden`;
  return `${h} Std. ${m} Min.`;
}

export function formatHours(min: number): string {
  return (min / 60).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

export function formatEuro(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function formatDay(d: string | null | undefined): string {
  if (!d) return "";
  const s = d.slice(0, 10);
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Der Satz greift in dieser Reihenfolge: Eintrag, Projekt, sonst nichts. */
export function rateFor(entry: Partial<RgiTimeEntry>, project?: RgiProject | null): number {
  return Number(entry.hourly_rate ?? project?.default_hourly_rate ?? 0);
}

export function valueOf(entry: Partial<RgiTimeEntry>, project?: RgiProject | null): number {
  return (rateFor(entry, project) * Number(entry.minutes ?? 0)) / 60;
}

/** Offen heißt: abrechenbar und noch auf keiner Rechnung. */
export function isOpen(e: RgiTimeEntry): boolean {
  return e.billable && !e.invoice_item_id;
}

export interface ProjectTotals {
  entries: number;
  openMinutes: number;
  openValue: number;
  billedMinutes: number;
  undatedCount: number;
  lastDay: string | null;
}

export function totalsFor(entries: RgiTimeEntry[], project?: RgiProject | null): ProjectTotals {
  let openMinutes = 0, openValue = 0, billedMinutes = 0, undatedCount = 0;
  let lastDay: string | null = null;
  for (const e of entries) {
    if (e.invoice_item_id) billedMinutes += e.minutes;
    else if (e.billable) {
      openMinutes += e.minutes;
      openValue += valueOf(e, project);
    }
    if (!e.date) undatedCount++;
    else if (!lastDay || e.date > lastDay) lastDay = e.date;
  }
  return {
    entries: entries.length,
    openMinutes,
    openValue: Math.round(openValue * 100) / 100,
    billedMinutes,
    undatedCount,
    lastDay,
  };
}

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export interface MonthGroup {
  key: string;
  title: string;
  undated: boolean;
  entries: RgiTimeEntry[];
  minutes: number;
}

/**
 * Nach Monat gruppiert, neueste zuerst — Einträge ohne Datum ganz
 * oben, weil sie eine offene Aufgabe sind und nicht ans Ende gehören.
 */
export function groupByMonth(entries: RgiTimeEntry[]): MonthGroup[] {
  const map = new Map<string, RgiTimeEntry[]>();
  for (const e of entries) {
    const key = e.date ? e.date.slice(0, 7) : "";
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  const keys = [...map.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : b.localeCompare(a)));
  return keys.map((key) => {
    const list = (map.get(key) ?? []).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return {
      key: key || "ohne",
      title: key
        ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
        : "Ohne Datum — bitte nachtragen",
      undated: !key,
      entries: list,
      minutes: list.reduce((s, e) => s + e.minutes, 0),
    };
  });
}
