import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBackendOutageError } from "@/lib/authErrorMessage";

type BackendStatus = "online" | "offline";

interface BackendHealthValue {
  status: BackendStatus;
  checking: boolean;
  lastCheckedAt: Date | null;
  /** Manuell (oder nach einem Fehlerereignis) prüfen. */
  checkNow: () => Promise<boolean>;
  /** Einen aufgetretenen Fehler melden – löst nur bei Ausfall-Indizien eine Prüfung aus. */
  reportError: (error: unknown) => void;
}

const OFFLINE_RECHECK_MS = 60_000;

const BackendHealthContext = createContext<BackendHealthValue | null>(null);

/** Leichter Ping: minimaler HEAD-Select auf eine lesbare Tabelle. */
const pingBackend = async (): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("buildings")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (!error) return true;
    // Berechtigungsfehler bedeuten: Server antwortet -> online
    return !isBackendOutageError(error);
  } catch (e) {
    return !isBackendOutageError(e);
  }
};

export const BackendHealthProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<BackendStatus>("online");
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const checkNow = useCallback(async () => {
    if (inFlight.current) return status === "online";
    inFlight.current = true;
    setChecking(true);
    try {
      const ok = typeof navigator !== "undefined" && navigator.onLine === false ? false : await pingBackend();
      setStatus(ok ? "online" : "offline");
      setLastCheckedAt(new Date());
      return ok;
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [status]);

  const reportError = useCallback(
    (error: unknown) => {
      if (isBackendOutageError(error)) {
        void checkNow();
      }
    },
    [checkNow],
  );

  // Kein Dauer-Polling: nur während eines Ausfalls im 60-s-Takt nachprüfen.
  useEffect(() => {
    if (status !== "offline") return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void checkNow();
    }, OFFLINE_RECHECK_MS);
    return () => window.clearInterval(interval);
  }, [status, checkNow]);

  // Sofort prüfen, wenn der Tab wieder aktiv wird oder das Netz zurückkommt.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && status === "offline") void checkNow();
    };
    const onOnline = () => {
      if (status === "offline") void checkNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [status, checkNow]);

  return (
    <BackendHealthContext.Provider value={{ status, checking, lastCheckedAt, checkNow, reportError }}>
      {children}
    </BackendHealthContext.Provider>
  );
};

/** Nutzbar auch außerhalb des Providers (z. B. Login-Seite) – dann lokaler Zustand. */
export const useBackendHealth = (): BackendHealthValue => {
  const ctx = useContext(BackendHealthContext);
  const [status, setStatus] = useState<BackendStatus>("online");
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      const ok = await pingBackend();
      setStatus(ok ? "online" : "offline");
      setLastCheckedAt(new Date());
      return ok;
    } finally {
      setChecking(false);
    }
  }, []);

  const reportError = useCallback(
    (error: unknown) => {
      if (isBackendOutageError(error)) void checkNow();
    },
    [checkNow],
  );

  useEffect(() => {
    if (ctx || status !== "offline") return;
    const interval = window.setInterval(() => {
      if (!document.hidden) void checkNow();
    }, OFFLINE_RECHECK_MS);
    return () => window.clearInterval(interval);
  }, [ctx, status, checkNow]);

  return ctx ?? { status, checking, lastCheckedAt, checkNow, reportError };
};
