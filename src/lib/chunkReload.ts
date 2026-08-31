/**
 * Hilfsfunktionen für den Umgang mit fehlgeschlagenen Chunk-Loads.
 *
 * Nach jedem Deployment ändern sich die gehashten Dateinamen der
 * lazy geladenen Module (z. B. Buildings-BRCFIJEt.js). Eine im Browser
 * noch laufende alte App-Version versucht dann Chunks nachzuladen, die
 * nicht mehr existieren oder nicht zur geladenen index.html passen.
 * Einzig sinnvolle Reaktion: die Seite einmal komplett neu laden —
 * und zwar mit Cache-Busting, damit nicht wieder die alte index.html
 * aus dem Browser-Cache kommt (sonst schlägt der nächste Chunk erneut fehl
 * und der Nutzer landet in der „Neue App-Version verfügbar"-Karte).
 */

const ATTEMPT_KEY = "rgi-chunk-reload-attempts";
const LAST_TS_KEY = "rgi-chunk-reload-at";
/** Mindestabstand zwischen zwei automatischen Reloads (Schleifenschutz). */
const MIN_INTERVAL_MS = 3_000;
/** Maximale automatische Reloads, bevor die manuelle Karte erscheint. */
const MAX_ATTEMPTS = 3;

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
 * Meldet, dass die App erfolgreich gestartet ist — der Zähler für
 * automatische Reloads wird zurückgesetzt, damit ein späterer
 * Deployment-Wechsel wieder automatisch behandelt werden kann.
 */
export function markAppLoadedSuccessfully(): void {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
    sessionStorage.removeItem(LAST_TS_KEY);
  } catch {
    /* sessionStorage nicht verfügbar */
  }
}

/** Erzwingt einen Reload, der den HTML-Cache umgeht. */
function hardReload(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/**
 * Lädt die Seite neu, um die aktuelle App-Version zu holen.
 * Abgesichert gegen Reload-Schleifen: max. 3 Versuche pro Tab und
 * mindestens 3 Sekunden Abstand.
 *
 * @returns true, wenn ein Reload ausgelöst wurde.
 */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(LAST_TS_KEY) || 0);
    const attempts = Number(sessionStorage.getItem(ATTEMPT_KEY) || 0);
    if (attempts >= MAX_ATTEMPTS) return false;
    if (Date.now() - last < MIN_INTERVAL_MS) return false;
    sessionStorage.setItem(LAST_TS_KEY, String(Date.now()));
    sessionStorage.setItem(ATTEMPT_KEY, String(attempts + 1));
  } catch {
    // sessionStorage nicht verfügbar → trotzdem neu laden
  }
  hardReload();
  return true;
}

/** Manueller Reload aus der Fehlerkarte — immer mit Cache-Busting. */
export function forceReloadNow(): void {
  markAppLoadedSuccessfully();
  hardReload();
}
