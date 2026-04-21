

## Ziel
Die Sektion „Heizkosten-relevante Konten" zeigt für Birkenweg 6 0,00 €, obwohl auf den Heizkonten (1440 Heizungswartung, 1470 Vorauszahlungen Gas usw.) Buchungen existieren – sie liegen nur auf der **Gegenkonto**-Seite (Bank 1800 ist das Hauptkonto, das Heizkonto das Gegenkonto). Die Auswertung muss beide Seiten berücksichtigen.

## Ursache
In `HeatingAccountsSection.tsx` filtert `getAccountTotal` ausschließlich auf `account_id`. Bei der „Bank-zentrierten" Buchungsweise (eine Buchung pro Bankbewegung mit Aufwandskonto im Feld `counter_account_id`) wird das Heizkonto nie getroffen → Summe = 0.

Das Screenshot bestätigt: Sämtliche Heizungs-/Versorger-Buchungen (1440, 1470, 1473) stehen in der Spalte „G-Kto.-Nr.", nicht in „Kto.-Nr.".

## Umsetzung

### 1. Buchungs-Query um Gegenkonto erweitern
In beiden Queries (`heating-bookings` aktuelles + Vorjahr) zusätzlich `counter_account_id` selektieren.

### 2. Aggregations-Logik anpassen
`getAccountTotal(accountId, bookings)` zählt eine Buchung, wenn:
- `account_id === accountId` **ODER**
- `counter_account_id === accountId`

Beträge werden weiterhin per `Math.abs(amount)` summiert; `booking_category !== "heating_repost"` bleibt als Filter, damit die internen Heizkosten-Umbuchungen nicht doppelt zählen.

Doppelzählung ist ausgeschlossen, weil die heizkosten-relevanten Konten (1400er) und das Bankkonto (1800) disjunkt sind – eine Buchung kann also nie auf beiden Seiten gleichzeitig ein Heizkonto haben.

### 3. Optional: Mini-Diagnosehinweis
Falls weiterhin 0 € herauskommt, kleiner Hinweistext unter der Tabelle: „Keine Heiz-Buchungen 2025 gefunden – prüfe Buchungstexte mit Schlagworten Heizöl, Gas, Wartung, Techem im Buchungstab."

## Betroffene Datei
- `src/components/finance/HeatingAccountsSection.tsx`

## QA
- Birkenweg 6, Jahr 2025: Sektion zeigt jetzt Werte auf 1440 (Heizungswartung 375,15 €), 1470 (Vorauszahlungen Gas 622,00 €), 1473 (Vorauszahlungen Wasser 87,00 €) usw.
- Andere Liegenschaften, bei denen das Heizkonto als Hauptkonto gebucht wird, zeigen weiterhin korrekte Werte (keine Regression).
- Vorjahresvergleich + YoY-% funktionieren analog.

