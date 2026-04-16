

## Plan: Brennstoffkauf-Erfassung in der Buchungsmaske

### Konzept
Ein kleiner Flammen-Button (🔥 `Flame` Icon) in der Buchungsmaske öffnet ein Collapsible-Panel für Brennstoffdaten. Wenn die verknüpfte Rechnung per OCR als Brennstoffkauf erkannt wurde (`ocr_extracted_data.is_fuel_purchase === true`), werden die Felder automatisch vorausgefüllt und das Panel ist standardmäßig geöffnet.

### Änderungen

**1. Invoice-Query erweitern** (`TransactionReviewMode.tsx`, ~Zeile 113)
- `ocr_extracted_data` zum Select hinzufügen, damit die OCR-Brennstoffdaten verfügbar sind

**2. BookingRowData Interface erweitern** (~Zeile 35)
- Neue Felder: `is_fuel_purchase: boolean`, `fuel_type: string`, `fuel_quantity: string`, `fuel_total_price: string`, `fuel_date: string`

**3. Auto-Fill aus Invoice-OCR** (~Zeile 356)
- Wenn `invoiceDetail.ocr_extracted_data?.is_fuel_purchase === true`:
  - `is_fuel_purchase = true`
  - `fuel_type` = extracted fuel_type (oil/pellets)
  - `fuel_quantity` = extracted fuel_quantity
  - `fuel_total_price` = gross_amount
  - `fuel_date` = invoice_date oder booking_date

**4. UI: Flammen-Button + Collapsible Panel** (~nach Zeile 1370, vor Review-Flag)
- Kleiner `Flame`-Icon-Button als Toggle (orange wenn aktiv)
- Collapsible-Bereich mit:
  - **Art**: Select (Heizöl / Pellets) – nur diese zwei Optionen wie gewünscht
  - **Menge**: Input mit Einheit (l für Öl, kg für Pellets)
  - **Gesamtpreis**: Input (Brennstoff + Aufwand)
  - **Datum**: Date-Input (Lieferdatum)

**5. Speicherung beim Buchen** (~Zeile 490, nach dem Booking-Insert)
- Nach erfolgreichem Booking-Insert: wenn `is_fuel_purchase === true`, Insert in `fuel_inventory` Tabelle:
  - `building_id`, `fuel_type`, `quantity`, `total_price`, `unit` (l/kg), `entry_type: "purchase"`, `entry_date`, `invoice_id`
  - `billing_period_id`: aus aktuellem Wirtschaftsjahr ermitteln (bestehende billingPeriods-Query)

**Dateien:**
- `src/components/finance/TransactionReviewMode.tsx` – alle Änderungen in einer Datei

Keine Datenbank-Migration nötig – die `fuel_inventory` Tabelle existiert bereits mit allen benötigten Feldern.

