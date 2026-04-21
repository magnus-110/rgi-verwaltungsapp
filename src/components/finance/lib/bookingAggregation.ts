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

/**
 * Quelle des Anfangsbestands eines Kontos für ein Wirtschaftsjahr.
 *  - "booking_4000": Erkannt aus Eröffnungsbuchung gegen Konto 4000 (SKR-Standard).
 *  - "manual":       Manueller Eintrag in account_balances.opening_balance.
 *  - "none":         Weder Buchung noch manueller Eintrag vorhanden.
 */
export type OpeningBalanceSource = "booking_4000" | "manual" | "none";

export interface OpeningBalanceResult {
  amount: number;
  source: OpeningBalanceSource;
  /** Anzahl Eröffnungsbuchungen gegen 4000, falls source='booking_4000' */
  bookingCount?: number;
  /** Datum der letzten erkannten Eröffnungsbuchung (ISO) */
  bookingDate?: string;
}

interface OpeningBookingLike extends BookingLike {
  booking_date?: string | null;
}

interface AccountBalanceLike {
  account_id: string;
  opening_balance: number | string | null;
}

/**
 * Erster Tag des Wirtschaftsjahres (vereinfacht: 01.01.YYYY).
 * Hinweis: bei abweichendem Wirtschaftsjahr ggf. erweitern.
 */
function isFirstDayOfFiscalYear(dateStr: string | null | undefined, fiscalYear: number): boolean {
  if (!dateStr) return false;
  // Akzeptiere alle Buchungen im Januar des Wirtschaftsjahres als Eröffnungsbuchung,
  // wenn sie das Saldovortragskonto 4000 berühren — praxisnah, da Eröffnungen
  // oft nicht exakt am 01.01. gebucht werden.
  return dateStr.startsWith(`${fiscalYear}-01-`);
}

/**
 * Ermittelt den effektiven Anfangsbestand eines Kontos.
 * Priorität: (A) Eröffnungsbuchungen gegen Konto 4000 im Januar des WJ,
 *            (B) manueller Eintrag in account_balances,
 *            (C) 0.
 *
 * @param accountId       Konto, für das der Anfangsbestand gesucht wird
 * @param bookings        Alle Buchungen des WJ (account_id, counter_account_id, amount, booking_date)
 * @param accountBalances Einträge aus account_balances für das WJ
 * @param fiscalYear      Wirtschaftsjahr
 * @param openingAccountId  ID des Kontos 4000 (Eröffnungsbuchungen)
 */
export function getEffectiveOpeningBalance(
  accountId: string,
  bookings: OpeningBookingLike[],
  accountBalances: AccountBalanceLike[],
  fiscalYear: number,
  openingAccountId: string | null | undefined,
): OpeningBalanceResult {
  // Priorität A: Eröffnungsbuchungen gegen Konto 4000
  if (openingAccountId && accountId !== openingAccountId) {
    const openingBookings = bookings.filter((b) => {
      if (!isFirstDayOfFiscalYear(b.booking_date, fiscalYear)) return false;
      const touchesAccount = b.account_id === accountId || b.counter_account_id === accountId;
      const touchesOpening = b.account_id === openingAccountId || b.counter_account_id === openingAccountId;
      return touchesAccount && touchesOpening;
    });
    if (openingBookings.length > 0) {
      const amount = openingBookings.reduce((s, b) => s + amountOnAccount(accountId, b), 0);
      const lastDate = openingBookings
        .map((b) => b.booking_date || "")
        .sort()
        .reverse()[0];
      return {
        amount,
        source: "booking_4000",
        bookingCount: openingBookings.length,
        bookingDate: lastDate || undefined,
      };
    }
  }

  // Priorität B: manueller Eintrag
  const manual = accountBalances.find((b) => b.account_id === accountId);
  if (manual && manual.opening_balance !== null && manual.opening_balance !== undefined) {
    const amount = Number(manual.opening_balance) || 0;
    if (amount !== 0) {
      return { amount, source: "manual" };
    }
  }

  return { amount: 0, source: "none" };
}
