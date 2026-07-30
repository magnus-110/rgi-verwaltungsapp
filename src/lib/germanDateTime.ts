/**
 * Einheitliche Formatierung von Versammlungs-Datum/Uhrzeit in deutscher
 * Zeitzone (Europe/Berlin), unabhängig von der Zeitzone des Browsers.
 */
export const BERLIN_TZ = "Europe/Berlin";

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WEEKDAYS_DE = [
  "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag",
];

type Input = string | number | Date | null | undefined;

function toDate(value: Input): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Datum/Uhrzeit-Bestandteile in Europe/Berlin */
export function berlinParts(value: Input) {
  const d = toDate(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // Wochentag/Monatsname sprachunabhängig aus UTC-verschobenem Datum ableiten
  const iso = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`;
  const shifted = new Date(iso);
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    weekday: WEEKDAYS_DE[shifted.getUTCDay()],
    monthName: MONTHS_DE[shifted.getUTCMonth()],
  };
}

/** "20.08.2026" */
export function formatGermanDate(value: Input, fallback = "—"): string {
  const p = berlinParts(value);
  return p ? `${p.day}.${p.month}.${p.year}` : fallback;
}

/** "16:00" */
export function formatGermanTime(value: Input, fallback = "—"): string {
  const p = berlinParts(value);
  return p ? `${p.hour}:${p.minute}` : fallback;
}

/** "20.08.2026 um 16:00 Uhr" */
export function formatGermanDateTime(value: Input, fallback = "—"): string {
  const p = berlinParts(value);
  return p ? `${p.day}.${p.month}.${p.year} um ${p.hour}:${p.minute} Uhr` : fallback;
}

/** "Donnerstag, 20. August 2026" */
export function formatGermanDateLong(value: Input, fallback = "—"): string {
  const p = berlinParts(value);
  return p ? `${p.weekday}, ${Number(p.day)}. ${p.monthName} ${p.year}` : fallback;
}

/** "2026-08-20" (für <input type="date">) */
export function berlinDateInputValue(value: Input): string {
  const p = berlinParts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : "";
}

/** "16:00" (für <input type="time">) */
export function berlinTimeInputValue(value: Input): string {
  const p = berlinParts(value);
  return p ? `${p.hour}:${p.minute}` : "";
}

/**
 * Wandelt Datum + Uhrzeit aus Formularfeldern (immer als deutsche Ortszeit
 * gemeint) in einen korrekten UTC-ISO-String um – unabhängig von der
 * Browser-Zeitzone.
 */
export function berlinLocalToIso(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || "00:00";
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  if (!y || !m || !d) return null;
  // Startwert: als UTC interpretieren, dann Offset von Europe/Berlin abziehen
  const utcGuess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  const offset = berlinOffsetMs(new Date(utcGuess));
  return new Date(utcGuess - offset).toISOString();
}

function berlinOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - at.getTime();
}
