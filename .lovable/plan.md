## Ursache gefunden

Beim Durchsehen der Buchungen für `Adolf-Haff-Weg 3 / 2025` zeigt sich der Fehler:

```
2025-01-02  Bank 1800 ←→ 0004 Mickerts   388 €  income   (Zahlung)
2025-01-03  Bank 1800 ←→ 0004 Mickerts   388 €  income   (Doppelzahlung)
2025-01-29  Bank 1800 ←→ 0004 Mickerts   388 €  EXPENSE  (Rückzahlung wg. Doppel)
```

Mickerts hat netto **388 €** gezahlt (1× regulär), nicht 1.164 €.

Mein letzter Fix für die Personenkonten verwendet `getEffectiveClosingBalance(...).movements`, das intern `sumForAccount` nutzt — diese Funktion **ignoriert `booking_type`** und behandelt jede Buchung auf der Gegenkonto-Seite gleich (immer als "−amount"). Dadurch wird die expense-Rückzahlung nicht gegengerechnet, sondern doppelt subtrahiert. Über alle Eigentümer summiert sich genau das auf die fehlenden ~2.210 €, die Sie sehen.

Die UI-Sektionssummen verwenden bereits `signedTotalForAccount` (booking-type-aware) — der Vorschuss-Block nutzt versehentlich die andere Funktion. Daher die Diskrepanz nur in diesem einen Block.

## Fix

**Datei:** `src/components/finance/BillingSettlement.tsx`

`personenkontenMovements`/`personenkontenPaid` (Zeile 584–587) auf `signedTotalForAccount` umstellen:

```ts
const personenkontenSigned = personenkontenAccounts.reduce(
  (s: number, a: any) => s + signedTotalForAccount(a.id, bookings as any),
  0,
);
// signedTotal liefert für Personenkonten negative Werte bei Zahlungseingang
// und positive bei Rückzahlungen → invertieren = "tatsächlich netto gezahlt".
const personenkontenPaid = -personenkontenSigned;
```

`signedTotalForAccount` ist bereits importiert (Zeile 16) und wird im Rest der Datei für alle anderen Sektionssummen verwendet — damit ist der Block konsistent zur restlichen Abrechnung.

## Erwartung nach dem Fix

- `personenkontenPaid`: 35.366 → ~33.156 €
- `totalUeberzahlung`: 2.428 → ~210 €
- `totalSollKostendeckung` bleibt 27.938,06 (Soll-Hausgeld unverändert; die ~8 € Diff zu Ihrer Handrechnung entstehen durch Tag-genaue Quotierung — falls das stört, separat nachschärfen)
