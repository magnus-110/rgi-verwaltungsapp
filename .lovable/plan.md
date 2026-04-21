

## Ziel
Claudes Beobachtung beruht auf einem Missverständnis: Alle 96 Buchungen 2025 haben ein Kostenkonto – es steht im Feld `counter_account_id` (Gegenkonto), weil das System "bank-zentrisch" bucht (eine Buchung pro Bankbewegung: Soll 1800 / Haben Aufwandskonto). Die Daten sind WEG-konform vorhanden. Was fehlt, ist die **konsistente Berücksichtigung beider Buchungsseiten** in allen Auswertungen, damit sowohl unsere Abrechnungs-Engine als auch externe Tools (Claude/MCP) die Kosten korrekt aggregieren.

## Diagnose (anhand Birkenweg 6, 2025)
Bestätigte Verteilung der 96 Buchungen:
- 30× Hausgeld (Konten 0001–0003) – Einnahmen
- 5× Müll 1010, 10× Allgemeinstrom 1050, 1× Versicherung 1300/1301
- 1× Gerätemiete 1431, 1× Heizungswartung 1440, 10× Gas 1470, 7× Wasser 1473
- 9× Verwaltervergütung 1500, 12× Bankgebühren 1520
- 1× Rücklagenübertrag 1810, Vorjahr-Abgrenzungen 4110/4130

→ Vollständige WEG-Abrechnung **ist** möglich. Logikfehler liegt im Frontend.

## Umsetzung

### 1. Settlement-Engine: beide Buchungsseiten auswerten
`BillingSettlement.tsx` und Abhängigkeiten so anpassen, dass für jedes Kostenkonto die Summe aus Buchungen mit
`account_id = X` **ODER** `counter_account_id = X` (mit Vorzeichen-Konvention: Gegenkonto-Beträge invertiert) gebildet wird. Gleiche Korrektur für:
- `BookingReviewSection.tsx` (Vollständigkeitscheck pro Konto)
- `BillingValidationPanel.tsx` (Kostensummen-Check)
- `BillingAiAnalysis.tsx` (Kontextdaten für Mistral)
- `EconomicPlanEditor.tsx` / `Section35aEditor.tsx` (Ist-Werte)
- `AssetReportSection.tsx` (Vermögensbericht)

### 2. Vorzeichen-Helper zentralisieren
Neue Util `src/components/finance/lib/bookingAggregation.ts`:
```ts
export function sumForAccount(accountId, bookings) {
  return bookings.reduce((s, b) => {
    if (b.account_id === accountId) return s + Number(b.amount);
    if (b.counter_account_id === accountId) return s - Number(b.amount);
    return s;
  }, 0);
}
```
Alle obigen Komponenten nutzen diesen Helper → eine Wahrheitsquelle.

### 3. SQL-View für externe Tools (MCP / Claude)
Neue Datenbank-View `v_account_movements`, die jede Buchung in zwei Zeilen splittet (Soll/Haben) – damit kann jedes externe Tool ohne Spezialwissen über die bank-zentrische Logik korrekt aggregieren:
```sql
CREATE VIEW v_account_movements AS
SELECT id booking_id, building_id, fiscal_year, booking_date, account_id, amount, ...
FROM bookings
UNION ALL
SELECT id, building_id, fiscal_year, booking_date, counter_account_id, -amount, ...
FROM bookings WHERE counter_account_id IS NOT NULL;
```
RLS analog zu `bookings`.

### 4. Memory-Update
Neuer Eintrag `mem://features/finance/bank-centric-booking-logic`:
> Buchungen werden bank-zentrisch erfasst (Hauptkonto Bank 1800, Aufwand im Gegenkonto). Auswertungen MÜSSEN immer beide Felder (`account_id` + `counter_account_id`) berücksichtigen. Nutze `sumForAccount()` oder die View `v_account_movements`.

### 5. QA
- Birkenweg 6 / 2025 Abrechnung erstellen → Kostenpositionen Müll, Strom, Gas, Wasser, Verwaltung, Bankgebühren, Versicherung erscheinen mit korrekten Summen.
- Heizkosten-Sektion zeigt weiterhin Werte (bereits gefixt, profitiert vom neuen Helper).
- Abgrenzungen 4110/4130 erscheinen korrekt.
- Validation Panel: keine "fehlenden Kosten"-Falschmeldungen mehr.
- Claude/MCP-Abfrage über `v_account_movements` liefert direkt zuordenbare Kostendaten.

## Betroffene Dateien
- `src/components/finance/lib/bookingAggregation.ts` (neu)
- `src/components/finance/BillingSettlement.tsx`
- `src/components/finance/BookingReviewSection.tsx`
- `src/components/finance/BillingValidationPanel.tsx`
- `src/components/finance/BillingAiAnalysis.tsx`
- `src/components/finance/EconomicPlanEditor.tsx`
- `src/components/finance/Section35aEditor.tsx`
- `src/components/finance/AssetReportSection.tsx`
- DB-Migration: View `v_account_movements` + RLS

