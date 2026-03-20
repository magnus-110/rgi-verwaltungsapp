

# Plan: Buchungen erweitern - Kontoinfos, Bearbeiten, Keyboard-Navigation

## Erklaerung account_id

- `account_id` = UUID-Verweis auf `chart_of_accounts` = das **Soll-Konto** (wohin gebucht wird)
- `counter_account_id` = UUID-Verweis auf `chart_of_accounts` = das **Haben-Konto** (Gegenkonto, z.B. Bank)
- Make.com muss die UUID aus `chart_of_accounts` nachschlagen (ueber `account_number`) und als `account_id` eintragen

## Aenderungen

### 1. BookingsTab: Beide Konten + Namen anzeigen

Query erweitern um auch `counter_account_id` aufzuloesen:
```
*, buildings(...), 
chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
invoices(id, file_path, file_name, vendor_name),
booking_templates!bookings_matched_template_id_fkey(id, name)
```

Hinweis: `bookings` hat aktuell kein `matched_template_id` FK. Stattdessen pruefen wir `invoice_id` fuer Rechnungszuordnung.

Tabelle bekommt zwei Spalten: **Soll-Konto** und **Gegen-Konto** mit Nummer + Name.

### 2. Buchung bearbeiten (EditBookingDialog)

- Neuer Dialog `EditBookingDialog.tsx`, basierend auf `CreateBookingDialog`
- Oeffnet sich beim Klick auf eine Buchungszeile
- Alle Felder vorausgefuellt und editierbar
- Speichern per `supabase.from("bookings").update(...)`
- Bestaetigen-Button direkt im Dialog

### 3. Keyboard-Navigation

- Buchungstabelle: Zeilen sind per Tab/Arrow-Keys navigierbar (`tabIndex={0}`)
- Enter oeffnet den Edit-Dialog
- Im Dialog: Enter auf "Buchen/Speichern", Escape schliesst
- Shortcut `Ctrl+Enter` zum Bestaetigen einer pending-Buchung

### 4. Rechnung/Vorlage anschauen

- Wenn `invoice_id` gesetzt: Button mit FileText-Icon, klick oeffnet PDF ueber `PdfViewerModal`
- PDF-URL wird ueber `get-document-url` Edge Function oder signed URL aus `invoices` Bucket geholt
- Wenn Buchung aus Vorlage: Badge mit Vorlagenname anzeigen (ueber separaten Query oder Join)

### 5. DB: FK fuer matched_template_id hinzufuegen

Migration: `ALTER TABLE bookings ADD COLUMN matched_template_id uuid REFERENCES booking_templates(id);` (falls noch nicht vorhanden, pruefen ob Spalte existiert)

Stattdessen nutzen wir das vorhandene `invoice_id` Feld fuer Rechnungszuordnung. Fuer Vorlagen fuegen wir `matched_template_id` hinzu.

## Dateien

| Datei | Aenderung |
|---|---|
| Migration | `matched_template_id` Spalte in bookings |
| `src/components/finance/BookingsTab.tsx` | Query erweitern, Soll/Gegen-Konto anzeigen, Keyboard-Nav, Zeilen klickbar, PDF-Viewer |
| `src/components/finance/EditBookingDialog.tsx` | Neuer Dialog zum Bearbeiten |
| `src/integrations/supabase/types.ts` | Wird automatisch aktualisiert |

