/**
 * Übersetzt Supabase-/Netzwerkfehler in verständliche deutsche Meldungen.
 * Serverausfälle werden klar von falschen Zugangsdaten getrennt.
 */

export const BACKEND_DOWN_MESSAGE =
  "Anmeldung derzeit nicht möglich — der Server ist vorübergehend nicht erreichbar. Bitte in wenigen Minuten erneut versuchen.";

const BACKEND_DOWN_PATTERNS = [
  "database error",
  "failed to fetch",
  "networkerror",
  "network error",
  "schema cache",
  "unexpected_failure",
  "service unavailable",
  "upstream connect error",
  "load failed",
];

/** Erkennt, ob ein Fehler auf einen Server-/Datenbankausfall hindeutet. */
export const isBackendOutageError = (error: unknown): boolean => {
  if (!error) return false;
  const err = error as any;
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;

  const code = String(err?.code ?? err?.error_code ?? "").toLowerCase();
  if (code === "unexpected_failure" || code === "pgrst002" || code === "pgrst001") return true;

  const message = String(err?.message ?? err ?? "").toLowerCase();
  return BACKEND_DOWN_PATTERNS.some((p) => message.includes(p));
};

/** Liefert eine nutzerfreundliche Meldung für Login-/Auth-Fehler. */
export const getAuthErrorMessage = (error: unknown): string => {
  if (!error) return "Ein unbekannter Fehler ist aufgetreten.";
  const err = error as any;
  const message = String(err?.message ?? "").toLowerCase();

  if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return "E-Mail oder Passwort ist falsch.";
  }
  if (message.includes("email not confirmed")) {
    return "Ihre E-Mail-Adresse wurde noch nicht bestätigt.";
  }
  if (message.includes("too many requests") || Number(err?.status) === 429) {
    return "Zu viele Versuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.";
  }
  if (isBackendOutageError(error)) {
    return BACKEND_DOWN_MESSAGE;
  }
  return err?.message || "Ein unbekannter Fehler ist aufgetreten.";
};
