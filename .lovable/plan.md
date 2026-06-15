# IHR-Buchung statt WP-Wert priorisieren (Tirolerstr. 142, 2025)

## Root Cause (verifiziert per DB-Query)

- Konto **1930** existiert global (`building_id IS NULL`), `settlement_section='reserve'`, `is_distributable=true`, `default_distribution_key='mea'` — ist also korrekt im Kontenrahmen.
- Es gibt eine **Buchung 31.12.2025 über 3.750 €** auf 1930 (Gegenkonto 4030, Rücklagenbildung 2025).
- **ABER:** In `economic_plans` für Liegenschaft Tirolerstr. 142, Jahr 2025 ist **`total_reserve = 0`** (nicht null).

Der Code in `BillingSettlement.tsx` (Zeile 758 und 1454) priorisiert `economicPlan.total_reserve` über die Buchungssumme — sobald der Wert „gesetzt" (≠ null) ist, wird er übernommen, auch wenn er 0 ist. Dadurch:
- `total = 0` → `if (total === 0) return;` überspringt das IHR-Konto.
- Owner-Kostenanteil enthält keine IHR.
- Banner „Kosten: 16.759,70 €" statt 20.509,70 €.

Im Gesamtteil (`getSectionDistributable("reserve")`) wird hingegen direkt `a.totalAbs` (= Buchungssumme 3.750 €) verwendet — daher das Inkonsistenz-Problem zwischen Gesamt- und Einzelabrechnung.

## Fix (2 Stellen)

**Regel:** Buchungssumme (= tatsächlich gebuchte IHR) hat Vorrang. Plan-Wert (`economicPlan.total_reserve`) ist nur Fallback, wenn keine Buchung existiert.

### Stelle 1 — `computeOwnerResult`, Zeile 755–761

```ts
distributableAccounts.forEach((acc) => {
  const isReserveAcc = acc.settlement_section === "reserve";
  const bookedAbs = getAccountAbsTotal(acc.id);
  const planReserve = Number(economicPlan?.total_reserve) || 0;
  const total = isReserveAcc
    ? (bookedAbs > 0 ? bookedAbs : planReserve)
    : bookedAbs;
  if (total === 0) return;
  // …
});
```

### Stelle 2 — Validierungs-Loop, Zeile 1452–1458

```ts
for (const acc of distributableAccounts) {
  const isReserveAcc = acc.settlement_section === "reserve";
  const bookedSigned = getAccountBookingTotal(acc.id);
  const planReserve = Number(economicPlan?.total_reserve) || 0;
  const total = isReserveAcc
    ? (Math.abs(bookedSigned) > 0 ? bookedSigned : planReserve)
    : bookedSigned;
  const absTotal = Math.abs(total);
  if (absTotal < 0.005) continue;
  // …
}
```

(Die in der vorigen Runde gemachte Filter-Erweiterung `|| a.settlement_section === "reserve"` bleibt drin — sie schadet nicht.)

## Erwartetes Ergebnis (Tirolerstr. 142, 2025)

- Spalte „Kostenanteil" enthält pro Eigentümer anteilige IHR (MEA-Verteilung von 3.750 €).
- Banner „Kosten" und Tabellen-Gesamtsumme: **20.509,70 €** (statt 16.759,70 €).
- „Ergebnis": **Nachzahlung 172,70 €** (statt Guthaben 3.577,30 €).
- Identisch zur Gesamtabrechnung und zum PDF.

## Nicht im Scope

- Keine DB-Korrektur des WP-Eintrags (total_reserve=0 bleibt liegen).
- Keine Änderung am Verteilschlüssel (bleibt `default_distribution_key` aus dem 1930-Stammsatz, hier `mea`).
