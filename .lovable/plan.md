
Ziel: Verstehen, warum bei bereits zugeordneten Rechnungen oft trotzdem kein Gegenkonto, keine §35a-Info und keine vollständige Buchung vorgeschlagen wird.

Befund im aktuellen Code:
- In `src/components/finance/TransactionReviewMode.tsx` wird bei einer gematchten Rechnung die Buchungsmaske primär nur aus `invoiceDetail` befüllt.
- Für Rechnungen wird dort aktuell nur `invoiceDetail.suggested_account_id` als Gegenkonto übernommen.
- Die KI-Vorschläge aus `currentTxn.ai_suggestion.booking_hint.suggested_bookings[0]` werden für Einzelbuchungen nur angewendet, wenn `!templateDetail && !invoiceDetail` gilt.
- Heißt konkret: Sobald eine Rechnung vorhanden ist, wird die KI für Konto/Gegenkonto/§35a praktisch ignoriert.
- Zusätzlich filtert `src/hooks/useTransactionAiPrefetch.ts` aktuell nur auf:
  - `unmatched`
  - `matched_invoice`
- Manuell zugeordnete Rechnungen landen aber in `src/components/finance/BankStatementsTab.tsx` auf `match_status = "manually_matched"`.
- Diese Transaktionen fallen dadurch aus der automatischen KI-Analyse komplett heraus, obwohl `matched_invoice_id` gesetzt ist.

Warum das bei dir passiert:
1. Hauptursache:
   Die UI nutzt bei Rechnungen nicht die KI-Buchungsvorschläge als Fallback/Ergänzung. Wenn `invoices.suggested_account_id` leer ist, bleibt das Gegenkonto leer.

2. Zweite Hauptursache:
   Manuell gematchte Rechnungen werden oft gar nicht mehr von der KI analysiert, weil der Prefetch nur auf `match_status` schaut und nicht auf `matched_invoice_id`.

3. Nebeneffekt:
   Felder wie `counter_account_number`, `amount_35a`, `related_invoice_id` aus der Edge Function werden im Prüfmodus nicht sauber übernommen bzw. teils gar nicht gelesen.

Umsetzungsplan:
1. `useTransactionAiPrefetch.ts` robuster filtern
- Nicht mehr nur nach `match_status` filtern.
- Stattdessen semantisch:
  - analysieren, wenn `!booked_at && !ai_suggestion`
  - und entweder:
    - keine Zuordnung vorhanden ist
    - oder eine Rechnung zugeordnet ist (`matched_invoice_id` gesetzt)
- Template-Fälle weiter ausnehmen, weil dort deterministische Logik reicht.

2. `TransactionReviewMode.tsx` Quellen zusammenführen statt gegenseitig auszuschließen
- Reihenfolge:
  - Rechnung liefert Belegdaten: Beleg-Nr., Datum, MwSt, Rechnung-ID, Beschreibung
  - KI liefert Buchungsvorschlag: Gegenkonto, Buchungstyp, §35a, `amount_35a`, ggf. Fiskaljahr
- Bei vorhandener Rechnung soll also KI nicht ersetzt, sondern als Ergänzung verwendet werden.
- Fallback-Regel:
  - zuerst `invoiceDetail.suggested_account_id`
  - wenn leer: `aiSuggestion.booking_hint.suggested_bookings[0].account_id`
  - wenn leer: `...account_number` oder `counter_account_number` gegen Kontenrahmen auflösen

3. KI-Felder vollständig in die Maske übernehmen
- `is_35a_relevant`
- `amount_35a`
- `booking_type`
- `counter_account_number`
- `related_invoice_id` / `related_template_id` sauber auf die tatsächlichen Formularfelder mappen

4. Manuelle Rechnungszuordnung KI-fähig machen
- Nach manueller Rechnungszuordnung entweder:
  - Prefetch-Filter greift automatisch über `matched_invoice_id`
  - oder zusätzlich `ai_suggestion` zurücksetzen / Einzelanalyse neu anstoßen
- Wichtig: Nicht auf den Statusnamen `matched_invoice` vertrauen, sondern auf das Vorhandensein der Rechnungs-ID.

Dateien:
- `src/hooks/useTransactionAiPrefetch.ts`
- `src/components/finance/TransactionReviewMode.tsx`
- optional `src/components/finance/BankStatementsTab.tsx` für sauberes Re-Triggering nach manueller Rechnungszuordnung

Erwartetes Ergebnis nach dem Fix:
- Auch bei bereits gematchten Rechnungen wird ein Gegenkonto vorgeschlagen.
- §35a wird bei passenden Rechnungen direkt vorbelegt.
- Manuell zugeordnete Rechnungen bekommen ebenfalls KI-Buchungsvorschläge.
- Die Buchungsmaske ist nicht mehr abhängig davon, ob OCR schon `suggested_account_id` gesetzt hat.

QA nach Umsetzung:
- Rechnung automatisch gematcht, aber `suggested_account_id` leer → Gegenkonto muss trotzdem aus KI erscheinen.
- Rechnung manuell zugeordnet (`manually_matched`) → KI-Vorschlag muss danach trotzdem erzeugt werden.
- §35a-Rechnung (z. B. Hausmeister/Winterdienst) → Schalter und Betrag vorbelegt.
- Nicht-§35a-Rechnung (z. B. Müll/Abfall) → korrekt ohne §35a.
