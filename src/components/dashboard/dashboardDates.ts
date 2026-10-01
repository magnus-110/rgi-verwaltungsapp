import { differenceInCalendarDays, format, isValid } from "date-fns";
import { de } from "date-fns/locale";

/** Datum sicher formatieren ("—" bei leeren/ungültigen Werten). */
export const fmt = (value: string | Date | null | undefined, pattern: string) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return isValid(d) ? format(d, pattern, { locale: de }) : "—";
};

export type Dringlichkeit = "red" | "orange" | "neutral";

/** „Überfällig“, „Heute“, „Morgen“, „In 5 Tagen“ — plus Farbe für das Etikett. */
export const relativTag = (date: Date): { text: string; tone: Dringlichkeit; days: number } => {
  const days = differenceInCalendarDays(date, new Date());
  if (days < 0) return { text: "Überfällig", tone: "red", days };
  if (days === 0) return { text: "Heute", tone: "orange", days };
  if (days === 1) return { text: "Morgen", tone: "neutral", days };
  return { text: `In ${days} Tagen`, tone: "neutral", days };
};

export const TONE_CLASSES: Record<Dringlichkeit, string> = {
  red: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  neutral: "bg-muted text-muted-foreground",
};

/** Einladungsfrist zur Eigentümerversammlung: mindestens drei Wochen (§ 24 Abs. 4 S. 2 WEG). */
export const EINLADUNGSFRIST_TAGE = 21;
