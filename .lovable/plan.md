# Konto-Inspektor-Dialog in der Kassenprüfung

## Problem

In der Verwaltungsansicht der Kassenprüfung (`CashAuditAdminReview`) öffnet der Button **„Konto öffnen"** aktuell einen neuen Tab mit `/finanzen?tab=accounting&sub=accounts&building=…&q=…`. Der landet auf derselben Seite und wirkt wie eine Wiederholung. Stattdessen soll inline ein Dialog aufgehen, in dem das Konto inkl. aller Buchungen geprüft, bearbeitet und vor allem **auf ein anderes Konto umgebucht** werden kann.

## Ziel

Ein neuer Dialog `AccountInspectorDialog`, der aus der Kassenprüfung heraus geöffnet wird und:

1. **Konto-Header** zeigt Konto­nummer, Name, Saldo und einen „Konto bearbeiten"-Button (öffnet bestehenden Konten-Edit-Pfad bzw. ein kleines Inline-Editierfeld für Name/Typ/Flags).
2. **Alle Buchungen des Kontos** im Wirtschaftsjahr der Prüfung listet, im Layout des bekannten **Prüfmodus** (Split-View aus `BookingReviewDialog`: links Liste, rechts Detail mit Pfeiltasten/Enter-Navigation, Belege, Notiz).
3. Pro Buchung erlaubt:
   - Buchung bearbeiten (bestehender `EditBookingDialog`)
   - **Gegenkonto / Konto umbuchen** über einen `AccountSelector` (gefiltert auf dasselbe `building_id` und `management_mode`)
   - **Massen-Aktion**: mehrere Buchungen auswählen → „Auf anderes Konto verschieben" (Bulk-Update von `account_id` oder `counter_account_id`, je nachdem auf welcher Seite das Konto steht).
4. Nach jeder Änderung Cache invalidieren (`cash-audit`, `bookings`, `accounts`) und Admin-Review-Marker setzen (vorhandenes `handleSavedBooking`-Muster).

## Umsetzung

### Neue Datei: `src/components/finance/AccountInspectorDialog.tsx`

- Props: `open`, `onOpenChange`, `accountId`, `buildingId`, `fiscalYear`, `auditId?`, `onBookingSaved?`.
- Lädt:
  - `accounts` Zeile (für Header + Edit)
  - `bookings` wo `account_id = X` **ODER** `counter_account_id = X` für `fiscal_year = fiscalYear`, mit Joins auf Gegenkonto.
- Layout:
  - `Dialog` (max-w-6xl, h-[85vh])
  - Header: Kontodaten + „Bearbeiten"-Toggle (inline Felder: Name, Typ, `is_billing_relevant`, `is_wirtschaftsplan_relevant`).
  - Body: zwei Spalten wie `BookingReviewDialog` — Buchungsliste links (mit Checkbox für Bulk), Detail rechts.
  - Detail-Bereich enthält neuen Block **„Konto ändern"** mit `AccountSelector`-Dropdown (vorhandener Selector aus `CreateBookingDialog` oder einfache `Combobox` über `chart_of_accounts`); Auswahl + Speichern → Update auf `bookings.account_id` bzw. `counter_account_id`.
  - Footer: Bulk-Move-Button, wenn ≥1 Checkbox aktiv.

### Änderungen in `CashAuditAdminReview.tsx`

- Neuer State `inspectorAccountId: string | null`.
- `openAccountInPlan` ersetzen durch `setInspectorAccountId(account.id)` (alte `window.open`-Variante entfernen).
- `<AccountInspectorDialog>` am Ende einbinden, `onBookingSaved` ruft `handleSavedBooking(bookingId)` auf, damit der „Von der Verwaltung bearbeitet"-Badge erscheint.

### Änderungen in `CashAuditAccountSheet.tsx` (optional Konsistenz)

- Falls dort ebenfalls ein „Konto öffnen"-Pfad existiert, gleiche Dialog-Komponente wiederverwenden.

## Geschäftslogik / Sicherheit

- Beim Umbuchen Trigger `trg_check_booking_account_building` beachten: neues Konto muss zum gleichen `building_id` gehören. Selector entsprechend filtern, sonst 400-Fehler abfangen und Toast anzeigen.
- Soll/Haben-Logik unverändert: nur `account_id` oder `counter_account_id` tauschen, Betrag/Datum/Beleg bleiben.
- Bookings die als Eröffnungsbuchung (`account_number = 4000`) markiert sind warnen vor Umbuchung.

## Out of Scope

- Keine Änderungen an Make.com-Webhook-Pfaden.
- Keine neuen DB-Migrationen — nutzt bestehende Spalten.
- Kein Redesign der Kontenplan-Seite.
