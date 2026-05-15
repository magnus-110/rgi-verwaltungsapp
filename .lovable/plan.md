## Problem

Im Vermögensbericht sind drei Probleme sichtbar:

1. **Falsche Salden** — Konto 1800 zeigt 33.229,33 €, im Kontenrahmen aber korrekt 8.961,47 €.
2. **Falsche Vorzeichen** — Rücklagenkonto 1810 erscheint negativ statt positiv.
3. **Null-Salden werden angezeigt** — Konten 4100, 4120, 4180 mit 0,00 € (bzw. -0,00 €) erscheinen unnötig.

Ursache für 1+2: `AssetReportSection` nutzt `getEffectiveClosingBalance` → `sumForAccount`. Diese Funktion ist **bank-zentrisch ohne `booking_type`-Berücksichtigung** und addiert für ein Bankkonto alle Beträge ohne Vorzeichen-Drehung — also Einnahmen + Ausgaben statt Einnahmen − Ausgaben.

Der Kontenrahmen (`AccountPlanView` / `useAccountAggregation`) macht es richtig: `sign = booking_type === "income" ? +1 : −1`, jeweils auf primär- und gespiegelt auf Gegenkonto-Seite. Genau das gleiche Verfahren liefert auch `signedTotalForAccount` aus `bookingAggregation.ts`.

## Lösung

In `src/components/finance/AssetReportSection.tsx`:

1. **Saldoberechnung umstellen** — `closingFor(acc)` so umbauen, dass es die gleiche Logik wie der Kontenrahmen nutzt:
   - Anfangsbestand via `getEffectiveOpeningBalance` (unverändert) bzw. `account_balances.opening_balance`
   - Bewegungen via `signedTotalForAccount(acc.id, bookingsOhneEröffnung)` statt `sumForAccount`
   - Manueller `closing_balance`-Override bleibt als Fallback erhalten
   - Damit ergibt 1800 = 0 + 8.961,47 = **8.961,47 €** und 1810 wird **positiv**.

2. **Null-Salden ausblenden** — In jeder Sektion (Liquide, Abr.-Spitze, Vorauszahlungen, Abgrenzung, Sonstige) Zeilen mit `Math.abs(amount) < 0.005` herausfiltern, **bevor** sie in die `lines`-Arrays geschoben werden. Sektionen, die danach leer sind, fallen durch das bestehende `.filter(s => s.lines.length > 0)` automatisch weg. Manuelle Items (`asset_report_items`) bleiben sichtbar, auch wenn 0 — der Nutzer hat sie bewusst angelegt.

## Technische Details

- Neue Helper-Funktion lokal in `AssetReportSection.tsx` (oder als `getEffectiveSignedClosingBalance` in `bookingAggregation.ts` hinzufügen, falls woanders wiederverwendbar):
  ```ts
  const movements = signedTotalForAccount(acc.id, bookingsOhneEröffnung);
  const closing = opening + movements;
  ```
- Eröffnungsbuchungen (gegen Konto 4000 im Januar) werden wie bisher aus den Bewegungen herausgefiltert, damit sie nicht doppelt zählen.
- `getAccrualDisplaySign`-Logik für 4100/4120/4160/4180 bleibt unverändert; sie wirkt erst nach der korrekten Saldo-Ermittlung.

## Dateien

- `src/components/finance/AssetReportSection.tsx` — `closingFor` umbauen, Null-Filter ergänzen
- ggf. `src/components/finance/lib/bookingAggregation.ts` — neuer Helper `getEffectiveSignedClosingBalance` (optional, nur falls wir die Berechnung exportieren wollen)
