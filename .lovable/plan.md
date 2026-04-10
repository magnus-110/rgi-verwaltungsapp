

## Plan: Shortcut-Anzeige fixen + Kreditor-Historien-Sektion im Prüfmodus

### Problem 1: Shortcuts werden abgeschnitten
Die Shortcut-Leiste (Zeile 198-201) nutzt Unicode-Pfeile `←→` die schlecht rendern. Lösung: Styled `<kbd>` Tags verwenden und die Darstellung verbessern.

### Problem 2: Kreditor-Historie fehlt
Unterhalb der Buchungsdetails (linke Seite) soll eine aufklappbare Sektion "Kreditor-Historie" erscheinen, die alle Buchungen desselben Kreditors/Lieferanten anzeigt (basierend auf `description`-Matching oder `invoices.vendor_name`). Filterbar nach Wirtschaftsjahr.

### Änderungen

**Datei: `src/components/finance/BookingReviewMode.tsx`**

1. **Shortcut-Bar (Zeile 196-202)**: Ersetze die Textzeile durch gestylte `<kbd>`-Elemente:
   - `Shift` → ✓ Bestätigen
   - `← →` → Navigation  
   - `E` → Bearbeiten

2. **Kreditor-Historie (neue Sektion in der linken Spalte, nach dem "Bearbeiten"-Button)**:
   - Collapsible-Sektion mit Titel "Buchungen dieses Kreditors"
   - Ermittlung des Kreditor-Namens aus `invoices.vendor_name` oder aus dem `description`-Feld
   - Neuer `useQuery` der alle Buchungen mit gleichem Vendor/Description für dasselbe Gebäude lädt
   - Dropdown-Filter für Wirtschaftsjahr (alle Jahre + aktuelles vorgewählt)
   - Kompakte Tabelle: Datum | Betrag | Konto | Status
   - Summenzeile am Ende

### Technische Details
- Kreditor-Matching: Zuerst `invoices.vendor_name` prüfen, Fallback auf erstes Wort/Phrase aus `description`
- Query: `bookings` mit JOIN auf `invoices` WHERE `invoices.vendor_name = X` OR `description ILIKE '%vendor%'`, gefiltert auf `building_id`
- Collapsible via Radix `Collapsible` (bereits im Projekt vorhanden)
- Wirtschaftsjahr-Filter als kleines `<Select>` neben dem Sektions-Titel

