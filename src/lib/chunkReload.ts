/**
 * Hilfsfunktionen für den Umgang mit fehlgeschlagenen Chunk-Loads.
 *
 * Nach jedem Deployment ändern sich die gehashten Dateinamen der
 * lazy geladenen Module (z. B. Buildings-BRCFIJEt.js). Eine im Browser
 * noch laufende alte App-Version versucht dann Chunks nachzuladen, die
 * nicht mehr existieren oder nicht zur geladenen index.html passen.
 * Einzig sinnvolle Reaktion: die Seite einmal komplett neu laden.
 */

const RELOAD_TS_KEY = "rgi-chunk-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

/** Muster der bekannten Chunk-Load-Fehlermeldungen (Chrome, Firefox, Safari). */
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\d\w-]+ failed/i,
  /'text\/html' is not a valid javascript mime type/i,
];

/** Erkennt, ob ein Fehler ein Chunk-/Modul-Ladefehler ist. */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return CHUNK_ERROR_PATTERNS.some((p) => p.test(message));
}

/**
 * Lädt die Seite einmalig neu, um die aktuelle App-Version zu holen.
 * Über sessionStorage gegen Reload-Schleifen abgesichert: höchstens
 * ein automatischer Reload pro Minute und Tab.
 *
 * @returns true, wenn ein Reload ausgelöst wurde.
 */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  } catch {
    // sessionStorage nicht verfügbar → trotzdem neu laden
  }
  window.location.reload();
  return true;
}
