

# Plan: PDF-Abrechnung an Frontend angleichen (8 Bugs aus Claude-Analyse)

## Bewertung der Claude-Analyse

**Fundiert und korrekt.** Die Analyse identifiziert echte Diskrepanzen zwischen `generate-billing-pdf/index.ts` (Edge-Function) und `BillingSettlement.tsx` (Frontend). Die UI nutzt bereits die korrekten Helper (`getEffectiveOpeningBalance`, `getEffectiveClosingBalance`, `settlement_section`-Filter), die PDF-Funktion hängt mehrere Refactor-Runden zurück.

Bestätigt per Code-Inspektion:
- PDF-Function filtert Anfangsbestände noch über `category === "bank"/"ruecklage"` (Zeilen 170-181) — gleicher Bug wie damals in `SettlementBasicsStep`. In der DB heißt die Kategorie freier Text wie „4. WEG-Systemkonten & Rücklagen", greift also nie → Anfangs-/Schlussbestände immer 0.
- Personenkonten 0001-0003 haben `is_distributable=true` und werden als Verteilungskosten umgelegt, weil der Filter in `distributableAccounts` (Zeile 154) sie nicht ausschließt. Pattern existiert zwar weiter unten (Z. 188), wird aber nur fürs Hausgeld benutzt.
- Reserve-Section nutzt `totalReserveFromPlan` als Override (Z. 131), aber kein expliziter „WP hat Vorrang vor Buchungen"-Fallback, wenn Plan = 0 ist (Buchungs-Fallback fehlt).
- Vorschussverpflichtung + Abrechnungsspitze tauchen im PDF-Code aktuell nicht auf — UI berechnet beides (Z. 686+), PDF nicht.

## Was umgebaut wird

### A) `supabase/functions/generate-billing-pdf/index.ts` (Hauptarbeit)

| # | Bug | Fix |
|---|---|---|
| 1 | Anfangs-/Schlussbestände via `category === "bank"/"ruecklage"` (immer 0) | Umstellen auf `getEffectiveOpeningBalance` / `getEffectiveClosingBalance` aus `_shared/booking-aggregation.ts` (4000-Eröffnungsbuchung priorisiert). Filter über `settlement_section === "bank"/"reserve"` mit Account-Number-Range `/^18\d{2}$/` als Backup. |
| 2 | Personenkonten 0001-0003 werden als Verteilungskosten umgelegt | `distributableAccounts`-Filter um `!personalAccountPattern.test(a.account_number)` und `a.settlement_section !== "income"` ergänzen. |
| 3 | (= Teil von Bug 1) | mitkorrigiert |
| 4 | Heating-Repost-Buchungen zählen Heizkosten doppelt | Wo `sumForAccount` für 1400 etc. genutzt wird, vorgefilterte Liste `bookingsExclHeatingRepost = allBookings.filter(b => b.booking_category !== "heating_repost")` verwenden. |
| 5 | IHR-Zuführung: WP-Beschluss vs. Buchungen | Logik beibehalten (`totalReserveFromPlan` hat Vorrang), aber sauberen Fallback auf Buchungs-Summe der Reserve-Sektion ergänzen, wenn Plan = 0 → kein „leere Reserve trotz Buchungen". |
| 6 | Reserve-finanzierte Aufwände (1920) doppelt | Bereits über `is_reserve_funded` in Z. 144-148 + Z. 266/295 gehandhabt — verifizieren, dass der Abzug auf Eigentümerebene tatsächlich greift, und die Neutralisation auch in der Gesamtabrechnung sichtbar machen (Sektion „Rücklagenentnahme" mit `totalReserveWithdrawal`). |
| 7 | Vorschussverpflichtung & Abrechnungsspitze fehlen im PDF | `totalVorschuss` (zeitanteilig + interval-aware analog `calcAnnual`) pro Eigentümer berechnen, in Owner-Result aufnehmen; in der HTML-Vorlage als Zeile „./. geleistete Vorauszahlungen" + „Abrechnungsspitze" ausgeben (Guthaben/Nachzahlung). |
| 8 | Kostenzeitachse grobe Faktoren 12/4/1 | `getTimeProportion` ist bereits day-precision (Z. 102-112) — `calcAnnual` auf gleiche Day-Precision umstellen statt fester Faktoren. |

### B) Datenkorrekturen (per Migration-Tool)
Claude meldet zwei Dateninkonsistenzen — die fixen wir ebenfalls:
- **Eröffnungsbuchung 1800 umkehren**: Buchung am 01.01.2025 (Birkenweg 6) hat `account_id=4000, counter_account_id=1800` → bank-zentrische Konvention liefert -3.510 €. Korrekt: `account_id=1800, counter_account_id=4000`. Per UPDATE auf die eine Booking-Zeile.
- **`is_distributable` für 1850/1860 (KapErtSt + Soli) auf `false`**: das sind keine Eigentümer-Kosten, sondern Kapitalertragsteuern auf Rücklagen-Zinsen.

### C) Memory-Update
Ergänzung zu `mem://features/finance/pdf-aggregation-shared`:
- Anfangs-/Schlussbestände in Edge-Function MÜSSEN über `getEffective*Balance`-Helper laufen, nie über `category`.
- Verteilungs-Filter MUSS Personenkonten (`/^0\d{3}$/`) und `settlement_section==="income"` ausschließen.
- `heating_repost`-Buchungen MÜSSEN bei Heizkosten-Aggregation rausgefiltert werden.

### D) Hinweise an den User (kein Code, nur Anzeige nach Implementation)
Die folgenden Stammdaten-Lücken bleiben Aufgabe des Users (System kann sie nicht raten):
- Personen-Anteile für 1010 Müll / 1011 Papiertonne pflegen
- `heating_distribution_values` für FY 2025 erfassen
- Wirtschaftsplan 2025 mit `total_reserve` anlegen

## Reihenfolge nach Approval
1. Migration: Eröffnungsbuchung 1800 umkehren + `is_distributable` 1850/1860 = false
2. Edge-Function `generate-billing-pdf` umbauen (Bugs 1-8)
3. PDF generieren für Birkenweg 6 / 2025 → Werte gegen Claudes Soll-Tabelle prüfen
4. Memory aktualisieren

## Nicht übernommen
Claudes vorgefertigte `generate-billing-pdf-index.ts` aus dem `/sessions/...`-Pfad ist nicht direkt zugänglich und wäre auch riskant ohne Code-Review. Wir schreiben die Fixes inkrementell in unseren Code, behalten die bestehende HTML-Struktur und den Shared-Helper, und verifizieren jede Änderung gegen Claudes Soll-Werte.

