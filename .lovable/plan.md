## Ziel

Im `TransactionReviewMode` (Kontoauszug-Buchungsmaske) sollen KI-Vorschläge sich wie echte Vorschläge verhalten: nicht aufgezwungen, sichtbar im rechten Panel, mit Button zum Übernehmen / Verwerfen — und das Vorzeichen der Banktransaktion darf nie gedreht werden.

## 1. Vorzeichen niemals ändern

Aktuell wird `booking_type` teilweise aus dem KI-Vorschlag übernommen (`sb.booking_type`). Das kann eine Ausgabe in eine Einnahme verwandeln und umgekehrt.

- `booking_type` wird ab sofort **ausschließlich** aus dem Vorzeichen der Banktransaktion abgeleitet:
  - `amount < 0` → `expense`
  - `amount > 0` → `income`
- KI-Felder `sb.booking_type` werden ignoriert (auch bei Split-Zeilen).
- Beim manuellen Wechsel des Gegenkontos bleibt das `booking_type` ebenfalls fixiert.
- Der angezeigte/eingetragene Betrag bleibt wie bisher `Math.abs(amount)` (Vorzeichen steckt im `booking_type`).

## 2. KI-Vorschlag nicht mehr automatisch in die Maske schreiben

Heute wird `applyAiSuggestion`-Logik in `useEffect` (Zeilen ~497–787) bei jedem Transaktionswechsel ausgeführt und füllt Gegenkonto, MwSt, §35a, Buchungstext, Splits etc. aus dem KI-Vorschlag.

Neuer Default-Zustand einer Buchungszeile (ohne verknüpfte Rechnung / Vorlage):

- `amount`: vorausgefüllt (Absolutwert der Transaktion)
- `account_id` (Bank): vorausgefüllt aus Mapping
- `booking_date`, `fiscal_year`, `booking_reference`: vorausgefüllt
- `booking_type`: aus Vorzeichen (s. 1.)
- `counter_account_id`, `vat_rate`, `description`, `receipt_number`, `is_35a_relevant`, `amount_35a`, Splits: **leer**

Vorlagen-Match (`templateDetail`) und verknüpfte Rechnung (`invoiceDetail`) befüllen weiterhin automatisch — das ist kein Vorschlag, sondern eine harte Zuordnung.

Reiner KI-Vorschlag (`aiSuggestion` ohne Rechnung/Vorlage) wird **nicht mehr** automatisch in die Zeile geschrieben. Stattdessen siehe Punkt 3.

## 3. Vorschlag-Karte rechts mit Übernehmen/Entfernen-Button

Im rechten Panel (Beleg-/Vorschlag-Bereich, Zeilen ~2092–2169) wird die bestehende KI-Karte um Aktions-Buttons erweitert.

Pro `suggested_booking` (bzw. zusammengefasst bei Single-Vorschlag):

- Button **„Vorschlag übernehmen“** (primary)
  - Schreibt `counter_account_id`, `vat_rate`, `is_35a_relevant`, `amount_35a`, `receipt_number`, ggf. Splitzeilen und den auto-generierten Buchungstext in die aktuell offene Zeile.
  - `booking_type` bleibt aus dem Vorzeichen (siehe 1.).
  - Markiert die Zeile als „aus KI übernommen“ (State `appliedAiSuggestionTxnId`).
- Button **„Vorschlag entfernen“** (ghost, nur sichtbar wenn übernommen)
  - Setzt die aus dem Vorschlag stammenden Felder wieder zurück auf den Default-Leerzustand (`counter_account_id`, `vat_rate`, `is_35a_relevant`, `amount_35a`, ggf. zusätzliche Split-Zeilen werden entfernt, Beschreibung zurück auf leer / RGI-Template ohne Gegenkonto).
  - `appliedAiSuggestionTxnId` wird gelöscht.

Bei Split-Vorschlägen: zusätzlich Button **„Als Splitbuchung übernehmen“**, der die aktuelle Einzelzeile durch n Vorschlagszeilen ersetzt.

Die Erklärung, Confidence-Badge und RAG-Referenzen bleiben unverändert sichtbar — als reine Information.

## 4. Hinweis-Text

Über der Vorschlag-Karte ein dezenter Hinweis:

> „KI-Vorschlag — nicht automatisch übernommen. Du kannst alle Felder manuell ausfüllen oder den Vorschlag mit einem Klick übernehmen.“

## Technische Details

- Datei: `src/components/finance/TransactionReviewMode.tsx`
  - `useEffect` (~Z.497–787): KI-basierte Auto-Fill-Pfade (`isSplit`, `aiSuggestion && !invoice && !template`, `aiSuggestion`-Fallback im Invoice-Pfad) entfernen bzw. in benannte Helper extrahieren: `buildRowsFromAiSuggestion(currentTxn, accounts, …)`, `clearAiFieldsFromRow(row)`.
  - Neuer State: `const [appliedAiTxnId, setAppliedAiTxnId] = useState<string | null>(null)`.
  - Rechtes Panel (~Z.2110–2148): pro Suggestion-Karte Buttons rendern, je nach `appliedAiTxnId === currentTxn.id`.
  - `booking_type`-Zuweisungen aus `sb.booking_type` entfernen; überall durch `isIncome ? "income" : "expense"` ersetzen.
- Keine Änderungen an Edge Functions / DB-Schema nötig — `ai_suggestion` wird weiterhin geschrieben, nur nicht mehr automatisch angewendet.

## Nicht im Scope

- Änderungen an `suggest-match` Edge Function oder am Prefetch.
- Änderungen an Rechnungs- / Vorlagen-Autofill (das bleibt automatisch).
- Änderungen am `TransferReviewMode` (Überweisungen).
