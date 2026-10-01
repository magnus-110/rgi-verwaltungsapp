/**
 * Versammlungen – Phasen, Fristen und „nächster Schritt“.
 *
 * Eine Versammlung durchläuft vier Phasen:
 *   Planung → Einladung → Durchführung → Protokoll
 * Danach ist sie abgeschlossen (Archiv). Die Umsetzung der Beschlüsse
 * läuft bewusst nicht hier, sondern in der Liegenschaft.
 */

export type EtvPhase = "planung" | "einladung" | "durchfuehrung" | "protokoll" | "abgeschlossen";

export const PHASES: { key: Exclude<EtvPhase, "abgeschlossen">; label: string }[] = [
  { key: "planung", label: "Planung" },
  { key: "einladung", label: "Einladung" },
  { key: "durchfuehrung", label: "Durchführung" },
  { key: "protokoll", label: "Protokoll" },
];

/** Mindestens 3 Wochen zwischen Zugang der Einladung und Versammlung (§ 24 Abs. 4 S. 2 WEG). */
export const LADUNGSFRIST_TAGE = 21;

export type Urgency = "red" | "amber" | "blue" | "gray" | "green";

export interface MeetingLike {
  id: string;
  building_id: string;
  title?: string | null;
  meeting_date: string | null;
  status: string | null;
  invitation_sent_at?: string | null;
  ended_at?: string | null;
  protocol_published?: boolean | null;
  protocol_filed_at?: string | null;
  created_at?: string | null;
}

export interface MeetingExtras {
  /** Anzahl Tagesordnungspunkte */
  agendaCount?: number;
  /** Unterschriebenes Protokoll im DMS abgelegt */
  protocolFiled?: boolean;
  /** Anzahl Unterschriften (von 3) */
  signatureCount?: number;
}

const DAY = 24 * 60 * 60 * 1000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const daysBetween = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);

/** Letzter Tag, an dem die Einladung zugehen muss. */
export const invitationDeadline = (meetingDate: string | Date) => {
  const d = startOfDay(new Date(meetingDate));
  return new Date(d.getTime() - LADUNGSFRIST_TAGE * DAY);
};

export const relativeDays = (target: Date, now = new Date()): string => {
  const n = daysBetween(now, target);
  if (n === 0) return "heute";
  if (n === 1) return "morgen";
  if (n === -1) return "gestern";
  if (n > 1 && n < 14) return `in ${n} Tagen`;
  if (n >= 14) return `in ${Math.round(n / 7)} Wochen`;
  if (n < -1 && n > -14) return `vor ${-n} Tagen`;
  return `vor ${Math.round(-n / 7)} Wochen`;
};

export const isMeetingCompleted = (m: MeetingLike) => m.status === "completed" || !!m.ended_at;

export function getPhase(m: MeetingLike, x: MeetingExtras = {}): EtvPhase {
  if (m.status === "cancelled") return "abgeschlossen";
  if (isMeetingCompleted(m)) return x.protocolFiled || m.protocol_filed_at ? "abgeschlossen" : "protokoll";
  if (m.status === "in_progress") return "durchfuehrung";
  if (!m.meeting_date) return "planung";
  if (m.invitation_sent_at) return "durchfuehrung";
  const now = new Date();
  if (new Date(m.meeting_date) < startOfDay(now)) return "durchfuehrung";
  return "einladung";
}

/** Index 0..3 der Phase (abgeschlossen = 4). */
export const phaseIndex = (p: EtvPhase) =>
  p === "abgeschlossen" ? 4 : PHASES.findIndex((x) => x.key === p);

export interface NextStep {
  label: string;
  tag: string;
  urgency: Urgency;
  /** Sortierung innerhalb der Liste (kleiner = dringender) */
  rank: number;
  group: "handeln" | "protokoll" | "geplant" | "erledigt";
}

export function getNextStep(m: MeetingLike, x: MeetingExtras = {}): NextStep {
  const now = new Date();
  const phase = getPhase(m, x);
  const date = m.meeting_date ? new Date(m.meeting_date) : null;

  if (m.status === "cancelled") return { label: "Abgesagt", tag: "Abgesagt", urgency: "gray", rank: 90, group: "erledigt" };

  if (phase === "abgeschlossen") return { label: "Abgeschlossen", tag: "Erledigt", urgency: "green", rank: 99, group: "erledigt" };

  if (phase === "protokoll") {
    const sig = x.signatureCount ?? 0;
    if (sig < 3) return { label: `Protokoll unterschreiben lassen (${sig} von 3)`, tag: "Unterschrift", urgency: "blue", rank: 40, group: "protokoll" };
    return { label: "Protokoll ablegen und versenden", tag: "Versand", urgency: "blue", rank: 41, group: "protokoll" };
  }

  if (phase === "planung") {
    return { label: "Termin festlegen oder Terminumfrage starten", tag: "Termin", urgency: "amber", rank: 30, group: "handeln" };
  }

  if (phase === "einladung" && date) {
    const deadline = invitationDeadline(date);
    const left = daysBetween(now, deadline);
    if (left < 0) return { label: "Ladungsfrist unterschritten – Termin prüfen", tag: "Frist", urgency: "red", rank: 5, group: "handeln" };
    if (left <= 3) return { label: `Einladung versenden – Frist ${relativeDays(deadline, now)}`, tag: left === 0 ? "Heute fällig" : "Fällig", urgency: "red", rank: 10 + left, group: "handeln" };
    if (left <= 14) return { label: `Einladung vorbereiten – Versand bis ${deadline.toLocaleDateString("de-DE")}`, tag: "Einladung", urgency: "amber", rank: 20 + left, group: "handeln" };
    return { label: `Einladung bis ${deadline.toLocaleDateString("de-DE")} versenden`, tag: "Geplant", urgency: "gray", rank: 60, group: "geplant" };
  }

  // durchfuehrung
  if (date && startOfDay(date) < startOfDay(now) && m.status !== "in_progress") {
    return { label: "Termin vorbei – Ergebnis erfassen", tag: "Status", urgency: "amber", rank: 25, group: "handeln" };
  }
  if (m.status === "in_progress") return { label: "Versammlung läuft", tag: "Live", urgency: "red", rank: 1, group: "handeln" };
  return { label: date ? `Versammlung ${relativeDays(date, now)}` : "Versammlung vorbereiten", tag: "Eingeladen", urgency: "gray", rank: 70, group: "geplant" };
}

export const URGENCY_CLASSES: Record<Urgency, string> = {
  red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  gray: "bg-muted text-muted-foreground",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export const meetingYear = (m: MeetingLike) =>
  new Date(m.meeting_date || m.created_at || Date.now()).getFullYear();

export const formatMeetingDate = (iso: string | null | undefined, opts: { weekday?: boolean; time?: boolean } = {}) => {
  if (!iso) return "kein Termin";
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: opts.weekday ? "short" : undefined,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (!opts.time) return date;
  const time = d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time} Uhr`;
};
