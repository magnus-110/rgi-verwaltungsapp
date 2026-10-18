import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Makler-Modus: ein einziger Maklerbereich (früher getrennt in Vermietung
 * und Verkauf). Gespeichert unter dem alten Schlüssel „brokerMode" – alte
 * Werte „rent"/„sale" gelten als eingeschaltet.
 */
interface BrokerModeContextType {
  /** Ist der Maklerbereich gerade aktiv (und darf die Person ihn nutzen)? */
  brokerActive: boolean;
  setBrokerActive: (on: boolean) => void;
  /** Darf die Person den Maklerbereich überhaupt nutzen? */
  brokerAllowed: boolean;
}

const BrokerModeContext = createContext<BrokerModeContextType | undefined>(undefined);
const KEY = "brokerMode";

function gespeichert(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "rent" || v === "sale";
  } catch {
    return false;
  }
}

export const useBrokerMode = () => {
  const ctx = useContext(BrokerModeContext);
  if (!ctx) throw new Error("useBrokerMode must be used within BrokerModeProvider");
  return ctx;
};

/** Wie useBrokerMode, nur ohne Absturz außerhalb des Providers. */
export const useBrokerModeOptional = (): BrokerModeContextType | null => useContext(BrokerModeContext) ?? null;

export const BrokerModeProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const location = useLocation();
  const brokerAllowed = profile?.role === "admin" || (profile?.role === "employee" && !!profile?.broker_mode_enabled);
  const [on, setOn] = useState<boolean>(gespeichert);

  const setBrokerActive = useCallback((next: boolean) => {
    setOn(next);
    try {
      if (next) localStorage.setItem(KEY, "on");
      else localStorage.removeItem(KEY);
    } catch {
      /* egal */
    }
  }, []);

  // Wer per Link direkt im Maklerbereich landet, sieht auch das Makler-Menü.
  useEffect(() => {
    if (brokerAllowed && location.pathname.startsWith("/makler") && !on) setBrokerActive(true);
  }, [brokerAllowed, location.pathname, on, setBrokerActive]);

  return (
    <BrokerModeContext.Provider value={{ brokerActive: brokerAllowed && on, setBrokerActive, brokerAllowed }}>
      {children}
    </BrokerModeContext.Provider>
  );
};
