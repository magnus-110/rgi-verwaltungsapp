/**
 * Vorzeichen-Konvention für Abgrenzungskonten in der Abrechnung (HV-Office Standard).
 *
 * Merksatz:
 *   "Aus dem lfd. Jahr raus  → Vorzeichen wie Originalbuchung
 *    Ins lfd. Jahr rein       → Vorzeichen umkehren"
 *
 * Bezogen auf die Abrechnungssumme des LFD. Jahres:
 *   4100–4119  Ausgaben lfd. J. für Vorjahr     (ARA-Auflösung) → -1
 *   4120–4139  Einnahmen lfd. J. für Vorjahr                    → +1
 *   4160–4179  Ausgaben Folgejahr für lfd. J.   (PRA-Bildung)   → +1
 *   4180–4199  Einnahmen Folgejahr für lfd. J.                  → -1
 *   4020 / sonstige Abgrenzung (z. B. WEG-Sollstellung)         → -1
 */
export function getAccrualDisplaySign(accountNumber: string | null | undefined): 1 | -1 {
  if (!accountNumber) return -1;
  const n = parseInt(String(accountNumber), 10);
  if (Number.isNaN(n)) return -1;
  if (n >= 4100 && n <= 4119) return -1;
  if (n >= 4120 && n <= 4139) return 1;
  if (n >= 4160 && n <= 4179) return 1;
  if (n >= 4180 && n <= 4199) return -1;
  return -1;
}

export function isAccrualAccount(accountNumber: string | null | undefined): boolean {
  if (!accountNumber) return false;
  const n = parseInt(String(accountNumber), 10);
  if (Number.isNaN(n)) return false;
  return n === 4020 || (n >= 4100 && n <= 4199);
}
