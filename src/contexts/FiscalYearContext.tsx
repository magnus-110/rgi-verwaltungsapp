import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * Pro-Gebäude gemerkter Wirtschaftsjahr-Zustand.
 * Persistiert in sessionStorage. Sobald irgendwo (Buchhaltung, Abrechnung,
 * Jahreszyklus, DMS-Upload, Kassenprüfung) ein Jahr ausgewählt wird, schreiben
 * wir hier rein – alle anderen Stellen lesen daraus und übernehmen es als
 * Default-Auswahl.
 */

const STORAGE_KEY = "fiscal-year:by-building:v1";
const GLOBAL_KEY = "__global__";

interface PerBuildingState {
  fiscalYear?: number | null;
  periodId?: string | null;
}

type StateMap = Record<string, PerBuildingState>;

interface FiscalYearContextValue {
  /** Für ein konkretes Gebäude gemerktes Jahr (null = noch nichts gewählt). */
  getFiscalYear: (buildingId: string | null | undefined) => number | null;
  /** Für ein konkretes Gebäude gemerkte billing_period_id (für Abrechnung etc.). */
  getPeriodId: (buildingId: string | null | undefined) => string | null;
  /** Setzt das aktuell ausgewählte Jahr für ein Gebäude. */
  setFiscalYear: (buildingId: string | null | undefined, year: number | null) => void;
  /** Setzt die aktuell ausgewählte billing_period_id (zusätzlich zum Jahr). */
  setPeriodId: (buildingId: string | null | undefined, periodId: string | null) => void;
  /** Aktualisiert beides in einem Schritt. */
  setBoth: (buildingId: string | null | undefined, year: number | null, periodId: string | null) => void;
  /** Globaler Wert für Übersichten (Jahreszyklus über alle Gebäude). */
  globalFiscalYear: number | null;
  setGlobalFiscalYear: (year: number | null) => void;
}

const FiscalYearContext = createContext<FiscalYearContextValue | null>(null);

export const FiscalYearProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<StateMap>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StateMap) : {};
    } catch {
      return {};
    }
  });

  // sessionStorage Schreiben gebündelt (vermeidet Hot-Path-Cost)
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* ignore quota errors */
      }
    }, 150);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [state]);

  const keyFor = (buildingId: string | null | undefined) => buildingId || GLOBAL_KEY;

  const getFiscalYear = useCallback(
    (buildingId: string | null | undefined) => {
      const k = keyFor(buildingId);
      return state[k]?.fiscalYear ?? null;
    },
    [state]
  );

  const getPeriodId = useCallback(
    (buildingId: string | null | undefined) => {
      const k = keyFor(buildingId);
      return state[k]?.periodId ?? null;
    },
    [state]
  );

  const setFiscalYear = useCallback((buildingId: string | null | undefined, year: number | null) => {
    const k = keyFor(buildingId);
    setState((prev) => {
      const current = prev[k] || {};
      if (current.fiscalYear === year) return prev;
      return { ...prev, [k]: { ...current, fiscalYear: year } };
    });
  }, []);

  const setPeriodId = useCallback((buildingId: string | null | undefined, periodId: string | null) => {
    const k = keyFor(buildingId);
    setState((prev) => {
      const current = prev[k] || {};
      if (current.periodId === periodId) return prev;
      return { ...prev, [k]: { ...current, periodId } };
    });
  }, []);

  const setBoth = useCallback(
    (buildingId: string | null | undefined, year: number | null, periodId: string | null) => {
      const k = keyFor(buildingId);
      setState((prev) => {
        const current = prev[k] || {};
        if (current.fiscalYear === year && current.periodId === periodId) return prev;
        return { ...prev, [k]: { ...current, fiscalYear: year, periodId } };
      });
    },
    []
  );

  const globalFiscalYear = state[GLOBAL_KEY]?.fiscalYear ?? null;
  const setGlobalFiscalYear = useCallback(
    (year: number | null) => setFiscalYear(null, year),
    [setFiscalYear]
  );

  const value = useMemo<FiscalYearContextValue>(
    () => ({
      getFiscalYear,
      getPeriodId,
      setFiscalYear,
      setPeriodId,
      setBoth,
      globalFiscalYear,
      setGlobalFiscalYear,
    }),
    [getFiscalYear, getPeriodId, setFiscalYear, setPeriodId, setBoth, globalFiscalYear, setGlobalFiscalYear]
  );

  return <FiscalYearContext.Provider value={value}>{children}</FiscalYearContext.Provider>;
};

/** Liefert immer den Context (no-op-Fallback, falls Provider fehlt – z. B. in Tests). */
export function useFiscalYearContext(): FiscalYearContextValue {
  const ctx = useContext(FiscalYearContext);
  if (ctx) return ctx;
  // Defensive fallback: leise statt crash – aber im Dev warnen.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("useFiscalYearContext: FiscalYearProvider fehlt – Auswahl wird nicht geteilt.");
  }
  const noop = () => {};
  return {
    getFiscalYear: () => null,
    getPeriodId: () => null,
    setFiscalYear: noop,
    setPeriodId: noop,
    setBoth: noop,
    globalFiscalYear: null,
    setGlobalFiscalYear: noop,
  };
}

/**
 * Bequemer Hook für einen einzelnen building-scoped Konsumenten.
 * `defaultYear` wird nur als Anzeige-Default benutzt, NICHT in den Context geschrieben –
 * so wird der Context erst dann „belegt", wenn der User aktiv auswählt.
 */
export function useFiscalYear(buildingId: string | null | undefined) {
  const ctx = useFiscalYearContext();
  return {
    fiscalYear: ctx.getFiscalYear(buildingId),
    periodId: ctx.getPeriodId(buildingId),
    setFiscalYear: (y: number | null) => ctx.setFiscalYear(buildingId, y),
    setPeriodId: (id: string | null) => ctx.setPeriodId(buildingId, id),
    setBoth: (y: number | null, id: string | null) => ctx.setBoth(buildingId, y, id),
  };
}
