

# Plan: MwSt-Felder fuer Vorlagen + Auto-Zuordnung von Rechnungen/Vorlagen

## Problem
1. `booking_templates` hat keine MwSt-Felder → Buchungen aus Vorlagen haben immer MwSt = 0
2. Make.com erstellt Buchungen mit `receipt_number` und `description`, aber ohne `invoice_id` oder `matched_template_id` → keine Zuordnung zu Rechnungen/Vorlagen

## Loesung

### 1. Migration: MwSt-Felder zu booking_templates + Auto-Match-Trigger

**Neue Spalten in `booking_templates`:**
- `vat_rate` (numeric, default null) - z.B. 19, 7
- `default_vat_rate` wuerde auch passen, aber `vat_rate` ist konsistenter

**Neuer DB-Trigger `auto_match_booking`** auf `bookings` INSERT:
- Wenn `invoice_id` null UND `receipt_number` vorhanden: Suche in `invoices` nach `invoice_number = receipt_number` (im selben building) → setze `invoice_id`, kopiere MwSt-Daten
- Wenn `matched_template_id` null UND kein Invoice gefunden: Suche in `booking_templates` nach `vendor_name` ILIKE match oder `expected_amount` = `amount` (im selben building) → setze `matched_template_id`, kopiere MwSt
- Wenn Invoice gefunden: uebernehme `vat_amount`, `vat_rate` aus Rechnung (falls Buchung 0 hat)
- Wenn Template gefunden: uebernehme `vat_rate` aus Vorlage, berechne `vat_amount`

### 2. BookingTemplatesTab: MwSt-Feld im Dialog

- Neues Feld `vat_rate` im Formular (Dropdown: 0%, 7%, 19%, oder freie Eingabe)
- In der Tabelle anzeigen

### 3. BookingsTab: Template-Info anzeigen

- Query um `booking_templates!bookings_matched_template_id_fkey(name)` erweitern
- Badge mit Vorlagenname anzeigen wenn `matched_template_id` gesetzt

## Dateien

| Datei | Aenderung |
|---|---|
| Migration | `vat_rate` zu `booking_templates`, Trigger-Funktion `auto_match_booking` |
| `src/components/finance/BookingTemplatesTab.tsx` | MwSt-Feld im Formular + Tabelle |
| `src/components/finance/BookingsTab.tsx` | Template-Join + Badge |
| `src/integrations/supabase/types.ts` | Auto-Update |

