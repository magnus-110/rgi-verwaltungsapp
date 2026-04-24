/**
 * Booking aggregation helpers (Deno port of src/components/finance/lib/bookingAggregation.ts).
 *
 * Buchungen werden bank-zentrisch erfasst (Bank 1800 als Hauptkonto, Aufwand
 * im Gegenkonto). Auswertungen MÜSSEN immer beide Felder berücksichtigen.
 *
 * Vorzeichen-Konvention:
 *   - amount auf account_id          → +amount
 *   - amount auf counter_account_id  → -amount
 *
 * Diese Datei MUSS funktional identisch zur Frontend-Version bleiben.
 */

export interface BookingLike {
  account_id?: string | null;
  counter_account_id?: string | null;
  amount: number | string;
}

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
 * Booking-type-aware Aggregation — IDENTISCH zur Frontend-Funktion
 * `getAccountBookingTotal` in BillingSettlement.tsx und `useAccountAggregation`.
 *
 *   account_id-Seite:         sign = booking_type === "income" ? +1 : -1
 *   counter_account_id-Seite: booking_type wird gedreht, dann derselbe Mapper
 *
 * Rückgabe ist signiert:
 *   - Aufwandskonten (1xxx) → negativ
 *   - Ertragskonten        → positiv
 * Erstattungen / Reposts wirken automatisch korrekt auf BEIDEN Konten.
 *
 * Diese Funktion MUSS für Abrechnungs-/Sektionssummen (UI + DOCX) verwendet werden,
 * damit beide Ansichten zwingend identische Zahlen liefern. `sumForAccount` bleibt
 * für Bilanz-/Saldenrechnungen (Bank, Rücklage, Eröffnungsbestände) zuständig.
 */
export interface BookingWithType extends BookingLike {
  booking_type?: string | null;
}

export function signedTotalForAccount(
  accountId: string,
  bookings: BookingWithType[],
): number {
  if (!accountId || !bookings?.length) return 0;
  return bookings.reduce((s, b) => {
    const amt = Number(b.amount) || 0;
    if (b.account_id === accountId) {
      const sign = b.booking_type === "income" ? 1 : -1;
      return s + sign * amt;
    }
    if (b.counter_account_id === accountId) {
      const flipped = b.booking_type === "income" ? "expense" : "income";
      const sign = flipped === "income" ? 1 : -1;
      return s + sign * amt;
    }
    return s;
  }, 0);
}

export function bookingsTouchingAccount<T extends BookingLike>(
  accountId: string,
  bookings: T[],
): T[] {
  if (!accountId) return [];
  return bookings.filter(
    (b) => b.account_id === accountId || b.counter_account_id === accountId,
  );
}

export function countForAccount(accountId: string, bookings: BookingLike[]): number {
  return bookingsTouchingAccount(accountId, bookings).length;
}

export function amountOnAccount(accountId: string, booking: BookingLike): number {
  const amt = Number(booking.amount) || 0;
  if (booking.account_id === accountId) return amt;
  if (booking.counter_account_id === accountId) return -amt;
  return 0;
}

export type OpeningBalanceSource = "booking_4000" | "manual" | "none";

export interface OpeningBalanceResult {
  amount: number;
  source: OpeningBalanceSource;
  bookingCount?: number;
  bookingDate?: string;
}

interface OpeningBookingLike extends BookingLike {
  booking_date?: string | null;
}

interface AccountBalanceLike {
  account_id: string;
  opening_balance: number | string | null;
}

function isFirstDayOfFiscalYear(dateStr: string | null | undefined, fiscalYear: number): boolean {
  if (!dateStr) return false;
  return dateStr.startsWith(`${fiscalYear}-01-`);
}

export function getEffectiveOpeningBalance(
  accountId: string,
  bookings: OpeningBookingLike[],
  accountBalances: AccountBalanceLike[],
  fiscalYear: number,
  openingAccountId: string | null | undefined,
): OpeningBalanceResult {
  if (openingAccountId && accountId !== openingAccountId) {
    const openingBookings = bookings.filter((b) => {
      if (!isFirstDayOfFiscalYear(b.booking_date, fiscalYear)) return false;
      const touchesAccount = b.account_id === accountId || b.counter_account_id === accountId;
      const touchesOpening = b.account_id === openingAccountId || b.counter_account_id === openingAccountId;
      return touchesAccount && touchesOpening;
    });
    if (openingBookings.length > 0) {
      const amount = openingBookings.reduce((s, b) => s + amountOnAccount(accountId, b), 0);
      const lastDate = openingBookings.map((b) => b.booking_date || "").sort().reverse()[0];
      return {
        amount,
        source: "booking_4000",
        bookingCount: openingBookings.length,
        bookingDate: lastDate || undefined,
      };
    }
  }

  const manual = accountBalances.find((b) => b.account_id === accountId);
  if (manual && manual.opening_balance !== null && manual.opening_balance !== undefined) {
    const amount = Number(manual.opening_balance) || 0;
    if (amount !== 0) return { amount, source: "manual" };
  }

  return { amount: 0, source: "none" };
}

export interface ClosingBalanceResult {
  amount: number;
  opening: number;
  movements: number;
  openingSource: OpeningBalanceSource;
}

export function getEffectiveClosingBalance(
  accountId: string,
  bookings: OpeningBookingLike[],
  accountBalances: AccountBalanceLike[],
  fiscalYear: number,
  openingAccountId: string | null | undefined,
): ClosingBalanceResult {
  const opening = getEffectiveOpeningBalance(accountId, bookings, accountBalances, fiscalYear, openingAccountId);

  const movementBookings = bookings.filter((b) => {
    if (!openingAccountId) return true;
    const isOpening =
      isFirstDayOfFiscalYear(b.booking_date, fiscalYear) &&
      (b.account_id === openingAccountId || b.counter_account_id === openingAccountId);
    return !isOpening;
  });

  const movements = sumForAccount(accountId, movementBookings);

  return {
    amount: opening.amount + movements,
    opening: opening.amount,
    movements,
    openingSource: opening.source,
  };
}
