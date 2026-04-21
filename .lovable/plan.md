

## Ziel
1. **Enter-Navigation im Prüfmodus** komplett durchspielen, Amount-Feld mit Auto-Select beim Klick, nach **MwSt** direkt zum **Buchen**-Button (§35a, Brennstoff, Kreditor-Historie überspringen).
2. **Kreditor-Historie reparieren**, sodass bei Personenkonten (z. B. „Hausgeld Gottfried") die bestehenden Buchungen tatsächlich angezeigt werden.

## Ursachen

### Enter-Navigation
In `TransactionReviewMode.tsx`:
- `FIELD_ORDER` enthält `receipt_number`, das gar nicht im Formular gerendert wird, und übergeht `fiscal_year`. Nach MwSt (`vat_rate`) wird zwar gebucht, aber die Reihenfolge passt nicht zur tatsächlichen UI (Belegnummer → Beleg-Datum → Wirtschaftsjahr → MwSt).
- Klick ins Betrags-Feld setzt nur den Cursor hinter das Vorzeichen, markiert aber nicht den vorhandenen Wert → Tippen ergänzt statt zu überschreiben.
- `handleEnterNavigation` setzt Fokus nicht zuverlässig in das Select-Trigger und die letzte Aktion ruft `handleBookRow` direkt – statt die Buchung über den sichtbaren Button-Zustand mit Validierung auszulösen.

### Kreditor-Historie
In `VendorHistorySection.tsx`:
- `booking.id` ist im Prüfmodus ein synthetischer String wie `"row-1"` (kein UUID).
- Die Query `…neq("id", booking.id)` läuft gegen eine UUID-Spalte → PostgREST-Fehler → `Promise.all` schlägt fehl → keine Daten, Anzeige „Keine weiteren Buchungen gefunden".
- Zusätzlich wird `vendorName` aus dem Buchungstext abgeleitet („Hausgeld 0002 Whg. 2 / OG …"), wodurch die Tokens (`Hausgeld`, `0002`, `Whg`) keine Treffer in den realen Buchungen liefern. Die exakte Suche per `counter_account_id` greift nur, wenn der UUID-Filter nicht crasht.

## Umsetzung

### 1. Enter-Navigation & Tastatur-Flow (`TransactionReviewMode.tsx`)

- `FIELD_ORDER` neu definieren, exakt in der UI-Reihenfolge inkl. „Buchen"-Sentinel:
  ```
  ["account_id", "amount", "counter_account_id", "description",
   "booking_reference", "booking_date", "fiscal_year", "vat_rate", "__book__"]
  ```
- `handleEnterNavigation`:
  - Beim Sprung in das nächste Feld konsequent `focus()` für Inputs und für Select-Trigger (`button[role=combobox]`) aufrufen.
  - Wenn `nextField === "__book__"`: den Buchen-Button direkt fokussieren und klicken (nicht §35a/Brennstoff/Kreditor-Historie anspringen).
- Buchen-Button mit `ref` versehen (`fieldRefs.current["__book__"]`), damit Fokus + Klick deterministisch funktionieren.
- `MwSt`-Select: nach Auswahl per Maus oder per Pfeil + Enter ebenfalls direkt zum Buchen-Button springen (über bestehendes `handleEnterNavigation`).

### 2. Betrags-Feld Auto-Select (`TransactionReviewMode.tsx`)

- `onFocus` und `onClick` am Amount-Input ändern:
  - Beim Fokus: den Zahlenteil markieren (Position 1 bis Ende), sodass die nächste Eingabe den alten Wert ersetzt.
- Klick-Logik vereinfachen: nicht den Cursor manuell auf 1 setzen, sondern `setSelectionRange(1, value.length)` aufrufen.
- Vorzeichen bleibt geschützt (bestehende Backspace/Delete/Home-Logik bleibt).

### 3. Kreditor-Historie reparieren (`VendorHistorySection.tsx`)

- `neq("id", booking.id)` nur ausführen, wenn `booking.id` ein gültiger UUID ist (Regex-Check). Andernfalls weglassen.
- Optional Prop `currentBookingId?: string` einführen, die im Prüfmodus weggelassen werden kann (kein synthetischer String mehr).
- Die exakte Suche per `counter_account_id` zusätzlich aktivieren, wenn ein Personenkonto (Kontonummer beginnt mit `0` und Kategorie „Personenkonto" o. ä.) als Gegenkonto vorliegt – nicht nur wenn `description` leer ist.
- Der Aufruf in `BookingRowCard` übergibt:
  - `id: undefined` (statt `row.id`)
  - weiterhin `counter_account_id`, `counter_account`, `building_id`, `description`, `invoices`
- Damit liefert die Historie für „Hausgeld Gottfried" alle drei vorhandenen Buchungen (Jan/Feb/Mär 2025).

### 4. Sichtbarer Hinweis in der UI

- Header der Kreditor-Historie zeigt weiterhin den Vendor- bzw. Kontonamen, jetzt aber mit korrekter Trefferzahl.
- Keine zusätzlichen Felder, keine Layout-Änderungen.

## Betroffene Dateien
- `src/components/finance/TransactionReviewMode.tsx`
- `src/components/finance/VendorHistorySection.tsx`

## QA
- Prüfmodus öffnen, Hausgeld-Transaktion auswählen.
- In Konto-Feld klicken → Enter springt nacheinander: Konto → Betrag → Gegenkonto → Buchungstext → Belegnummer → Beleg-Datum → Wirtschaftsjahr → MwSt → Buchen-Button.
- Im Betrag-Feld: Klick markiert vorhandenen Wert, Tippen überschreibt sofort.
- §35a, Brennstoff und Kreditor-Historie werden im Tab-/Enter-Flow übersprungen.
- Kreditor-Historie aufklappen bei „Hausgeld Gottfried" → zeigt 3 Buchungen (01/25, 02/25, 03/25), Summe korrekt.
- Bei realen (gespeicherten) Buchungen mit echter UUID funktioniert die Historie weiterhin.

