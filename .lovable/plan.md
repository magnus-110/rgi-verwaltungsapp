

## Plan: Vorlagen mit Rechnungen verknüpfen + Betrags-Toleranz

### Überblick
Zwei Erweiterungen für Buchungsvorlagen:
1. **Rechnungsverknüpfung**: Eine Vorlage kann mit einer Rechnung verknüpft werden (z.B. Abschlagsbescheid Gas), die als Beleg/Nachweis dient
2. **Betrags-Toleranz**: Statt eines fixen Betrags kann ein Toleranzbereich definiert werden (z.B. 12€ ±4€), sodass Transaktionen von 8-16€ automatisch zugeordnet werden

### 1. Datenbank-Migration

Zwei neue Spalten in `booking_templates`:
```sql
ALTER TABLE public.booking_templates 
  ADD COLUMN linked_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN amount_tolerance numeric DEFAULT NULL;
```

- `linked_invoice_id`: Referenz auf die verknüpfte Rechnung (z.B. Abschlagsbescheid)
- `amount_tolerance`: Toleranz in € (z.B. 4 bedeutet ±4€ vom expected_amount)

### 2. UI: BookingTemplatesTab erweitern

Im Template-Dialog zwei neue Felder:
- **Betrags-Toleranz (±)**: Nummerisches Feld neben dem Erwarteten Betrag. Wird angezeigt als "12,00 € ±4,00" in der Tabelle
- **Verknüpfte Rechnung**: Combobox/Select, das Rechnungen des gleichen Gebäudes lädt (gefiltert auf `vendor_name` der Vorlage). Zeigt Rechnungsnr. + Datum + Betrag. Mit Button zum PDF-Öffnen

In der Tabellenansicht: Betragsspalte zeigt "12,00 € ±4,00" wenn Toleranz gesetzt, und ein kleines Rechnungs-Icon wenn eine Rechnung verknüpft ist.

### 3. Matching-Logik anpassen (BookingReviewMode)

Aktuell prüft Zeile 162:
```typescript
if (tmpl.expected_amount != null) result.amount = Math.abs(currentBooking.amount) === Math.abs(tmpl.expected_amount);
```

Änderung zu:
```typescript
if (tmpl.expected_amount != null) {
  const tolerance = tmpl.amount_tolerance || 0;
  const diff = Math.abs(Math.abs(currentBooking.amount) - Math.abs(tmpl.expected_amount));
  result.amount = diff <= tolerance;
}
```

### 4. TypeScript-Typen

`linked_invoice_id` und `amount_tolerance` in `types.ts` ergänzen.

### Dateien
- Neue Migration: `linked_invoice_id` + `amount_tolerance`
- `src/components/finance/BookingTemplatesTab.tsx` – Formular + Tabelle erweitern
- `src/components/finance/BookingReviewMode.tsx` – Toleranz-Matching
- `src/integrations/supabase/types.ts` – Neue Felder

