## Ziel

Im Prüfmodus (Buchhaltung → Kontoauszüge → "Prüfen & buchen") sollen die Transaktionen strikt chronologisch ab dem 01.01. des Wirtschaftsjahres angezeigt werden. Nicht zugeordnete Transaktionen (`unmatched`, `invoice_pending`) werden **nicht** mehr in die Prüf-Reihenfolge aufgenommen, damit die Reihenfolge nicht „wild durcheinander" wirkt.

## Aktueller Zustand

`src/components/finance/BankStatementsTab.tsx` Zeilen 277–293:

```ts
const allUnbookedForReview = useMemo(() => {
  const sortByDateThenId = ...;
  const matched   = allBuildingTxns.filter(matched-status).sort(sortByDateThenId);
  const unmatched = allBuildingTxns.filter(unmatched-status).sort(sortByDateThenId);
  return [...matched, ...unmatched];
}, [allBuildingTxns]);
```

Effekt: zugeordnete Buchungen chronologisch, danach unzugeordnete chronologisch — dadurch springt der Prüfmodus nach der letzten zugeordneten Buchung zurück zu Januar und mischt unzugeordnete optisch in die Folge.

## Änderung

Nur eine Datei: `src/components/finance/BankStatementsTab.tsx`

1. `allUnbookedForReview` so anpassen, dass es **ausschließlich** die zugeordneten Transaktionen enthält (`matched_invoice`, `matched_template`, `manually_matched`), sortiert nach `booking_date` aufsteigend (sekundär nach `id` für Stabilität bei gleichem Datum).
2. Kein Anhängen der unmatched/invoice_pending mehr.
3. Der bestehende Tab/Block für unzugeordnete Transaktionen in der Listenansicht bleibt unverändert — Nutzer können diese dort weiterhin manuell zuordnen.

## Technische Details

- Datei: `src/components/finance/BankStatementsTab.tsx`
- Funktion: `allUnbookedForReview` (Zeilen 277–293)
- Prop-Konsumenten: `TransactionReviewMode transactions={allUnbookedForReview}` (Zeile 1251) — keine Signatur-Änderung
- `globalBookableCount` (Zeile 295–299) bleibt wie er ist (zählt bereits nur matched)
- Keine DB-, Edge-Function- oder Typ-Änderungen
