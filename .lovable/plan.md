
## Ziel
Den Rückgängig-Button im Kontenplan genau dort sichtbar machen, wo die Buchungszeile im Screenshot angezeigt wird – auch bei Personenkonten/Hausgeld-Zeilen.

## Ursache
Im `AccountPlanView.tsx` wird jede Buchung doppelt dargestellt:
- einmal auf der eigentlichen Kontoseite (`_side: "primary"`)
- einmal gespiegelt auf dem Gegenkonto (`_side: "counter"`)

Der Rückgängig-Button rendert aktuell nur bei:
- `source === "bank_import"`
- `bank_transaction_id` vorhanden
- `_side === "primary"`

Im Screenshot sind die sichtbaren Hausgeld-/Personenkonto-Zeilen sehr wahrscheinlich die Gegenkonto-Ansicht (`_side === "counter"`). Deshalb erscheint dort kein Button, obwohl die Buchung selbst rückgängig gemacht werden kann.

## Umsetzung

### 1. Button-Bedingung im Kontenplan korrigieren
In `src/components/finance/AccountPlanView.tsx`:
- die Bedingung `b._side === "primary"` entfernen
- den Button stattdessen für jede Buchungszeile anzeigen, wenn die Buchung tatsächlich rückgängig gemacht werden kann:
  - `b.source === "bank_import"`
  - verknüpfte Banktransaktion vorhanden (`b.bank_transaction_id` oder alternativ vorhandene Zuordnung über `booking_id`)

Ergebnis:
- derselbe Rückgängig-Button erscheint auch in den roten Hausgeld-Zeilen im Personenkonto-Bereich.

### 2. Doppelte Buttons bei derselben Buchung vermeiden
Da dieselbe Buchung in mehreren Konten auftauchen kann, wird der Button zwar in jeder sichtbaren Zeile erlaubt, aber die Aktion bleibt immer identisch:
- Dialog öffnet mit derselben Buchung
- Rückgängig macht weiterhin genau diese eine Buchung
- verknüpfte `bank_transactions` werden wieder freigegeben
- Buchung wird gelöscht

Falls nötig, wird zusätzlich sichergestellt, dass nur echte bankverknüpfte Buchungen einen Button bekommen.

### 3. Platzierung exakt an der markierten Stelle beibehalten
Der Button bleibt direkt im Betrag-Feld rechts neben dem Betrag:
- keine neue Extra-Spalte
- keine Verschiebung der restlichen Tabelle
- gleiche Tooltip-/Icon-Logik wie bisher

### 4. Bestehende Undo-Logik unverändert weiterverwenden
Die vorhandene Logik in `handleUndoBooking` bleibt fachlich gleich:
1. `bank_transactions` zurücksetzen (`booked_at = null`, `booking_id = null`)
2. `bookings`-Datensatz löschen
3. relevante Queries invalidieren
4. Toast anzeigen

Es wird nur die Sichtbarkeit im Kontenplan korrigiert, nicht der eigentliche Undo-Ablauf.

## Betroffene Datei
- `src/components/finance/AccountPlanView.tsx`

## QA
- Kontenplan öffnen
- Personenkonto/Hausgeld-Konto wie im Screenshot aufklappen
- prüfen, dass der Rückgängig-Button rechts neben dem Betrag sichtbar ist
- Klick auf Button öffnet Bestätigungsdialog
- nach Bestätigung verschwindet die Buchung aus dem Kontenplan
- die zugehörige Transaktion erscheint wieder im Kontoauszug
- manuelle Buchungen ohne Bankverknüpfung zeigen weiterhin keinen Rückgängig-Button
