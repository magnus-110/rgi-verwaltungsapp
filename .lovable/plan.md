

## Wirtschaftsjahr automatisch aus Buchungsdatum ableiten

### Problem
`CreateBookingDialog` setzt `fiscal_year` immer auf das aktuelle Kalenderjahr (2026). Bei Buchungen aus Kontoauszuegen mit Datum in 2025 wird das Wirtschaftsjahr nicht angepasst — die Buchung landet im falschen Jahr.

### Loesung

**`src/components/finance/CreateBookingDialog.tsx`**

1. Im `useEffect` (Prefill-Sync): Wenn `prefill.booking_date` vorhanden, `fiscal_year` automatisch aus dem Jahr des Buchungsdatums ableiten statt den Default zu behalten
2. Zusaetzlich: Wenn der Nutzer das `booking_date` manuell aendert, das `fiscal_year` ebenfalls automatisch aktualisieren (onChange-Handler des Datumsfelds)
3. Das Feld `fiscal_year` bleibt weiterhin manuell editierbar fuer Sonderfaelle (verschobenes Wirtschaftsjahr)

Konkret:
- Zeile ~88: `fiscal_year` aus `prefill.booking_date` extrahieren: `String(new Date(prefill.booking_date).getFullYear())`
- onChange des `booking_date`-Inputs: `setForm(prev => ({ ...prev, booking_date: val, fiscal_year: String(new Date(val).getFullYear()) }))`

### Bestehende fehlerhafte Daten
- Die bereits falsch gebuchten Eintraege (fiscal_year 2026 mit booking_date in 2025) muessen manuell oder per Update korrigiert werden

