## Ziel
In der Kassenprüfung soll bei Buchungen, deren zugeordnete Vorlage eine verknüpfte Rechnung hat (z.B. Birkenweg 6, Vorlage 94,65 € auf Konto 1010), im Buchungs-Prüfdialog ein Button „Rechnung anzeigen" erscheinen, der die Rechnung inline (unterhalb der Vorlagen-Karte) einblendet.

## Umfang
Nur der rechte Bereich des `BookingReviewDialog` (Vorlagen-Karte), plus der Datenlade-Pfad — sowohl im normalen Auth-Modus als auch im Token-Modus (Proxy-Link / Owner-Portal).

## Änderungen

1. **`src/components/finance/CashAuditJournal.tsx`** — Query erweitern
   - In `booking_templates`-Select zusätzlich die verknüpfte Rechnung joinen:
     `linked_invoice:invoices!booking_templates_linked_invoice_id_fkey(id, vendor_name, file_path, gross_amount, invoice_number, invoice_date, building_id)`

2. **Supabase-Migration** — Token-RPC `get_audit_bookings_by_token` erweitern
   - Im `booking_templates`-JSON zusätzlich `linked_invoice` (id, vendor_name, file_path, gross_amount, invoice_number) einbetten, via `LEFT JOIN invoices li ON li.id = bt.linked_invoice_id`.
   - Sicherheit: nur einbetten wenn `li.building_id = v_audit.building_id`.

3. **`src/components/finance/BookingReviewDialog.tsx`** — Button + Inline-Anzeige
   - Type `AuditBookingRow.booking_templates` um `linked_invoice` erweitern.
   - Neuer lokaler State `showTemplateInvoice` (bool, per Buchung zurückgesetzt).
   - In der Vorlagen-Karte (Zweig `booking.booking_templates`): wenn `linked_invoice?.file_path` vorhanden, unter den Detailzeilen ein Button „Rechnung anzeigen" / „Rechnung ausblenden".
   - Nach Klick: signierten URL laden (im Auth-Modus direkt `supabase.storage.from('invoices').createSignedUrl(...)`, im Token-Modus über die bestehende Edge Function `audit-signed-url` mit `kind: 'invoice', id: linked_invoice.id`) und in einem `<iframe>` unterhalb der Karte einblenden. Loading- und Fehlerzustände analog zum bestehenden Beleg-PDF-Loader.
   - Der Token-Modus muss dem Dialog bekannt sein: `tokenMode` und `token` als Props durchreichen (aktuell werden sie aus `CashAuditJournal` nicht weitergegeben). Diese Props ergänzen und in `CashAuditJournal` beim Aufruf setzen.

## Technische Hinweise

- Die Edge Function `audit-signed-url` prüft bereits `invoice.building_id = audit.building_id` und `invoice_year = audit.fiscal_year`. Für vorlagen-verknüpfte Rechnungen kann das Rechnungsdatum außerhalb des Prüfjahres liegen (z.B. Jahresvertrag). Falls solche Fälle vorkommen sollen: die Jahres-Prüfung dort für den Kind `invoice` lockern, wenn die Rechnung über eine Vorlage referenziert ist. Für den ersten Wurf lassen wir die Prüfung strikt; bei Bedarf lockern wir sie in einem Folgeschritt.
- Kein Auto-Load: die Rechnung wird erst nach Klick geladen, um Signed-URL-Requests zu sparen.

## Nicht enthalten
- Änderungen am Kontenblatt-Tab, keine anderen Journal-Filter, keine UI-Refactorings außerhalb der Vorlagen-Karte.