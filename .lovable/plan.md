

## Zeiträume für Buchungsvorlagen (valid_from / valid_to)

### Problem
Wenn sich z.B. das Hausgeld eines Eigentümers ändert (Wirtschaftsplan-Anpassung), braucht man pro Zeitraum eine eigene Vorlage mit anderem Betrag, aber demselben Konto. Aktuell gibt es keine Datumsfelder in `booking_templates`.

### Loesung

**1. Migration: `valid_from` und `valid_to` Spalten hinzufuegen**
- `valid_from DATE` (nullable) und `valid_to DATE` (nullable) zu `booking_templates`
- Beide optional: ohne Angabe gilt die Vorlage unbegrenzt

**2. UI: Zwei Datumsfelder im Vorlagen-Dialog**
- In `BookingTemplatesTab.tsx` zwei neue Input-Felder (`type="date"`) fuer "Gueltig ab" und "Gueltig bis" im Formular
- `TemplateForm` erhaelt `valid_from: string` und `valid_to: string`
- Payload-Erstellung und Edit-Prefill werden entsprechend erweitert

**3. Tabellen-Anzeige erweitern**
- Neue Spalte "Zeitraum" in der Vorlagen-Tabelle
- Formatiert als "01.01.2025 – 30.06.2025" oder "ab 01.07.2025" oder "–" bei keiner Einschraenkung

**4. Matching-Logik beruecksichtigen**
- In `suggest-match` Edge Function: Beim Template-Matching das `booking_date` der Transaktion gegen `valid_from`/`valid_to` pruefen, damit nur zeitlich passende Vorlagen vorgeschlagen werden

### Dateien
1. **Migration** — `valid_from` + `valid_to` auf `booking_templates`
2. **`src/components/finance/BookingTemplatesTab.tsx`** — Formular + Tabelle erweitern
3. **`src/integrations/supabase/types.ts`** — Typen regenerieren
4. **`supabase/functions/suggest-match/index.ts`** — Zeitraum-Filter beim Matching

