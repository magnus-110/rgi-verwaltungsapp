/**
 * Präfix aus der Einheitennummer (4-stellig, z. B. "0001_").
 * Ermöglicht die automatische Zuordnung persönlicher Anhänge in Rundmails
 * und verhindert Namenskollisionen bei Eigentümern mit mehreren Einheiten.
 */
export const unitFilePrefix = (unitNumber?: string | null): string => {
  const digits = String(unitNumber || "").match(/\d+/)?.[0];
  return digits ? `${String(Number(digits)).padStart(4, "0")}_` : "";
};
