import type { ReportFolder } from "@/hooks/useReports";

/**
 * Kleine Helfer rund um Meldungen, die keine Komponenten sind.
 */

/**
 * Die Meldungs-Ordner im Postfach. Sie sind „virtuelle“ Ordner wie
 * Telefonate oder Rundmails: keine E-Mail-Ordner, sondern Ansichten der App.
 */
export const REPORT_FOLDER_IDS: Record<ReportFolder, string> = {
  open: "__reports_open__",
  progress: "__reports_progress__",
  done: "__reports_done__",
};

export const isReportFolderId = (id: string | null | undefined): boolean =>
  !!id && Object.values(REPORT_FOLDER_IDS).includes(id);

export const reportFolderOfId = (id: string | null | undefined): ReportFolder | null => {
  const hit = (Object.entries(REPORT_FOLDER_IDS) as [ReportFolder, string][]).find(([, v]) => v === id);
  return hit ? hit[0] : null;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Kurzes Datum für Listen: heute nur die Uhrzeit, sonst TT.MM. */
export function shortDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

/** Datum mit Uhrzeit für den Verlauf. */
export function dateTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Fehlermeldung für einen Hinweis, egal was geworfen wurde. */
export function errorMessage(e: unknown, fallback = "Unbekannter Fehler"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object" && e && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return fallback;
}
