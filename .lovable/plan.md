# Einzelabrechnung: IHR in „Kostenanteil" einrechnen

## Problem

In der Einzelabrechnungs-Tabelle (Tirolerstr. 142, 2025) zeigt die Spalte „Kostenanteil" weiterhin **16.759,70 €** statt der korrekten **20.509,70 €** (inkl. IHR 3.750 €). Damit stimmen auch die Ergebnis-Spalte und der Gesamtsaldo nicht mit der Gesamtabrechnung überein.

Die Gesamtabrechnung wurde bereits gefixt (Reserve-Sektion umgeht den `isBalanceSheetAccount`-Filter). Die Einzelabrechnung hat einen analogen, aber eigenen Filter, der nicht angepasst wurde.

## Ursache

In `src/components/finance/BillingSettlement.tsx`, Funktion `computeOwnerResult` (~Zeile 749):

```ts
const distributableAccounts = accounts.filter(
  (a) => a.is_distributable && !isAccrualBalanceAccount(a) && (a as any).is_billing_relevant !== false
);
```

Das IHR-Konto **1930** hat in der Regel `is_distributable = false` (es ist Bilanzkonto, kein Aufwand). Damit fällt es hier raus und der Pro-Owner-Kostenanteil enthält die IHR nicht — obwohl die WP-Logik im darunter liegenden Block (`isReserveAcc → economicPlan.total_reserve`) genau darauf vorbereitet ist.

## Fix (1 Stelle)

`distributableAccounts` so erweitern, dass **Reserve-Sektion-Konten** zusätzlich aufgenommen werden, auch wenn `is_distributable=false`. Konsistent mit dem Gesamt-Fix in `getSectionDistributable`.

```ts
const distributableAccounts = accounts.filter(
  (a) =>
    (a.is_distributable || a.settlement_section === "reserve")
    && !isAccrualBalanceAccount(a)
    && (a as any).is_billing_relevant !== false
);
```

Die bestehende Logik in der Schleife (Zeilen 753–791) verwendet für `isReserveAcc` bereits `economicPlan.total_reserve` als Verteil-Basis und den korrekten `distKey` (Default MEA, falls per `default_distribution_key` nichts anderes gesetzt ist) — es muss dort nichts geändert werden.

## Erwartetes Ergebnis (Tirolerstr. 142, 2025)

- Spalte „Kostenanteil" je Eigentümer enthält jetzt anteilige IHR (3.750 € verteilt nach distKey von 1930).
- Summe „Kosten" im Banner: **20.509,70 €** (statt 16.759,70 €).
- „Vorschüsse: 20.337,00 €" → Banner-Saldo: **Nachzahlung 172,70 €**.
- Pro-Owner-Ergebnis (Spalte „Ergebnis") verschiebt sich konsistent: aus mehreren „Guthaben" werden teils Nachzahlungen, passend zur Gesamtabrechnung.
- PDF (`buildOwnerPayload` in `buildBillingPayload.ts`) profitiert automatisch, da es dieselben `accountBreakdown`-Daten konsumiert.

## Nicht im Scope

- Keine Änderung an `is_distributable`-Flags in der Datenbank.
- Keine Änderung an `getSectionDistributable` oder Gesamt-Logik (bereits gefixt).
- Keine Anpassung am Sollstellungs-Vorzeichen 4020 (bereits gefixt).
