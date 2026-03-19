

# Plan: Buchungsmaske verbessern (ohne Webhook)

## Kontext
Der Webhook fuer Make.com wird NICHT bei manuellen Buchungen ausgeloest. Er kommt erst in Stufe 2 (OCR-Integration), wenn Rechnungen automatisch ausgelesen, bezahlt und zum Buchen freigegeben werden.

## Aenderungen

### 1. §35a Auto-Select bei Kontoauswahl
**Datei**: `src/components/finance/CreateBookingDialog.tsx`

Wenn im Soll-Konto ein Konto ausgewaehlt wird, das `is_35a_relevant === true` hat, wird die §35a-Checkbox automatisch aktiviert.

- Im `onChange`-Handler des ersten AccountPickers: Account-Objekt aus `accounts`-Array nachschlagen, dann `set("is_35a_relevant", account.is_35a_relevant)` aufrufen.

### 2. Dialog breiter und uebersichtlicher
**Datei**: `src/components/finance/CreateBookingDialog.tsx`

- `max-w-2xl` auf `max-w-4xl` aendern
- Beleg-Zeile: 3-Spalten-Grid beibehalten, aber Buchungstext als volle Breite darunter
- Steuer-Bereich: Mehr horizontaler Platz, groessere Radio-Buttons
- Section-Titles etwas groesser (`text-base` statt `text-sm`)
- Allgemein mehr Padding und Spacing

### Kein Webhook
Es wird keine Edge Function erstellt. Der `MAKE_BOOKING_WEBHOOK_URL` Secret wird erst bei der OCR-Stufe benoetigt.

## Dateien

| Datei | Aenderung |
|---|---|
| `CreateBookingDialog.tsx` | Breiter, 35a-auto-select, besseres Spacing |

