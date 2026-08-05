# Buchungen werden nicht mehr angezeigt (PGRST201)

## Ursache (bestätigt)

Die Tabelle `bookings` hat inzwischen **zwei** Fremdschlüssel auf `invoices`:
`bookings_invoice_id_fkey` (invoice_id) und `bookings_suggested_invoice_id_fkey` (suggested_invoice_id).

Dadurch ist die Kurzschreibweise `invoices(...)` in Supabase-Abfragen nicht mehr eindeutig. Ein Test gegen die API liefert:

```text
PGRST201 – Could not embed because more than one relationship was found for 'bookings' and 'invoices'
```

Die Abfrage in `BookingsTab.tsx` wirft dadurch einen Fehler und liefert eine leere Liste → „Keine Konten/Buchungen vorhanden", obwohl für Achweg 3-5 / 2026 in der Datenbank 254 Buchungen liegen.

Die Ansicht „Abrechnung → Buchungen prüfen" funktioniert, weil sie kein `invoices`-Embed benutzt.

## Fix

In allen Abfragen auf `bookings` das Embed eindeutig machen:

`invoices(...)` → `invoices!bookings_invoice_id_fkey(...)`

Betroffene Stellen (nur die, deren Basistabelle `bookings` ist):

- `src/components/finance/BookingsTab.tsx` (2x)
- `src/components/finance/BookingReviewMode.tsx`
- `src/components/finance/BankStatementsTab.tsx`
- `src/components/finance/AccountInspectorDialog.tsx`
- `src/components/finance/CashAuditAdminReview.tsx`
- `src/components/finance/CashAuditAccountSheet.tsx`
- `src/components/finance/CashAuditJournal.tsx`
- `src/components/finance/VendorHistorySection.tsx`
- `src/components/finance/BookingTemplatesTab.tsx` (nur falls Basistabelle `bookings`)

Zusätzlich wird jede dieser Abfragen kurz auf weitere mehrdeutige Embeds geprüft (z. B. `booking_templates`, `chart_of_accounts` – dort existieren ebenfalls je zwei Fremdschlüssel) und, wo nötig, ebenfalls mit `!fkey` präzisiert.

Danach: gleiche API-Prüfung erneut ausführen, damit sichergestellt ist, dass kein PGRST201 mehr auftritt, und die Buchungsliste im Preview kontrollieren.

## Hinweis

Es gehen keine Daten verloren – die Buchungen sind vollständig vorhanden, es scheiterte nur das Laden.
