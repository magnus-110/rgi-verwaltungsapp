/**
 * Single Source of Truth zur Klassifizierung von Konten.
 *
 * Wird im Wirtschaftsplan (Editor + PDF-Preview) und in der Abrechnung
 * verwendet, um den EHR/Vorschuss-Split korrekt zu bestimmen.
 *
 * Erkennungsreihenfolge für EHR-Zuführungskonten:
 *  1. settlement_section === 'reserve'  (sauberster Marker)
 *  2. is_reserve_funded === true        (Legacy)
 *  3. category === 'ruecklage'
 *  4. Name-Heuristik (rücklage / erhaltung / IHR / instandhaltung)
 *
 * Entnahmekonten (reserve_role='withdrawal') werden explizit AUSGESCHLOSSEN —
 * sie sind im Wirtschaftsplan Aufwand, nicht Rücklagenbildung.
 */
export interface AccountLike {
  account_name?: string | null;
  category?: string | null;
  settlement_section?: string | null;
  is_reserve_funded?: boolean | null;
  reserve_role?: string | null;
}

export function isReserveContributionAccount(acc: AccountLike): boolean {
  if (!acc) return false;
  if (acc.reserve_role === "withdrawal") return false; // Entnahme ≠ Zuführung

  // Explizite Marker — primär:
  if (acc.settlement_section === "reserve") return true;

  // Wenn settlement_section explizit auf einen NICHT-Rücklagen-Wert gesetzt ist
  // (z. B. operating_non_distributable für 1600 "Lfd. Instandhaltung"), dann
  // ist es ein Aufwandskonto — Name-Heuristik darf NICHT greifen.
  const hasExplicitNonReserveSection =
    !!acc.settlement_section && acc.settlement_section !== "reserve";
  if (hasExplicitNonReserveSection) return false;

  if (acc.is_reserve_funded === true) return true;
  if (acc.category === "ruecklage") return true;

  // Name-Heuristik nur als letzter Fallback und nur, wenn KEIN settlement_section gesetzt.
  // Bewusst eng gehalten: "instandhaltung" allein ist KEIN Rücklagenindikator
  // (1600 "Lfd. Instandhaltung / Reparaturen" ist Aufwand, keine Rücklage).
  const name = (acc.account_name || "").toLowerCase();
  return /rücklage|erhaltung|\bihr\b|instandhaltungsrücklage/.test(name);
}

/**
 * Entnahmekonten aus der Erhaltungsrücklage
 * (z. B. 1920 "Rep. aus Entnahme RL").
 *
 * Hinweis: Legacy `is_reserve_funded` wurde historisch teils für Entnahmen
 * genutzt — daher hier mit beibehalten (vgl. BillingSettlement.tsx).
 */
export function isReserveWithdrawalAccount(acc: AccountLike): boolean {
  if (!acc) return false;
  return acc.reserve_role === "withdrawal" || acc.is_reserve_funded === true;
}
