/**
 * Booking aggregation helpers.
 *
 * Buchungen werden bank-zentrisch erfasst (Bank 1800 als Hauptkonto, Aufwand
 * im Gegenkonto). Auswertungen MÜSSEN immer beide Felder berücksichtigen.
 *
 * Vorzeichen-Konvention:
 *   - amount auf account_id  → +amount
 *   - amount auf counter_account_id → -amount
 *
 * Beispiel: Bankausgabe für Müll
 *   Bank 1800 (account_id) +100 EUR Soll  /  Müll 1010 (counter_account_id) -100 EUR
 *   → für Konto 1800 zählt +100, für Konto 1010 zählt +100 (Vorzeichen invertiert)
 *
 * Hinweis: Wir invertieren das Gegenkonto, weil Bankausgaben in `bookings.amount`
 * als positive Beträge gespeichert werden ("Geld weg" auf der Bankseite). Das
 * Aufwandskonto sieht denselben Betrag mit umgekehrtem Vorzeichen, was nach
 * Negation wieder zu einem positiven Aufwand führt.
 */

export interface BookingLike {
  account_id?: string | null;
  counter_account_id?: string | null;
  amount: number | string;
}

/**
 * Liefert den Saldo eines Kontos über alle Buchungen, in denen das Konto
 * entweder als Haupt- oder als Gegenkonto erscheint.
 */
export function sumForAccount(accountId: string, bookings: BookingLike[]): number {
  if (!accountId || !bookings?.length) return 0;
  return bookings.reduce((s, b) => {
    const amt = Number(b.amount) || 0;
    if (b.account_id === accountId) return s + amt;
    if (b.counter_account_id === accountId) return s - amt;
    return s;
  }, 0);
}

/**
 * Filtert alle Buchungen, die ein bestimmtes Konto berühren (Haupt oder Gegen).
 */
export function bookingsTouchingAccount<T extends BookingLike>(
  accountId: string,
  bookings: T[],
): T[] {
  if (!accountId) return [];
  return bookings.filter(
    (b) => b.account_id === accountId || b.counter_account_id === accountId,
  );
}

/**
 * Anzahl Buchungen, die ein Konto berühren (z. B. für Vollständigkeitschecks).
 */
export function countForAccount(accountId: string, bookings: BookingLike[]): number {
  return bookingsTouchingAccount(accountId, bookings).length;
}

/**
 * Liefert den effektiven Betrag, mit dem eine einzelne Buchung in das Konto
 * einfließt (positiv = Belastung des Kontos, negativ = Entlastung).
 */
export function amountOnAccount(accountId: string, booking: BookingLike): number {
  const amt = Number(booking.amount) || 0;
  if (booking.account_id === accountId) return amt;
  if (booking.counter_account_id === accountId) return -amt;
  return 0;
}
