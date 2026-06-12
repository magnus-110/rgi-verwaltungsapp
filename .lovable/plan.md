# Make.com Booking-Pfad entfernen

Andere Make-Integrationen (E-Mail, Nutzer, Schlüssel, Gebäudedaten) bleiben unangetastet.

## 1. Edge Function löschen
- `supabase/functions/send-booking-data/index.ts` löschen
- Eintrag `[functions.send-booking-data]` in `supabase/config.toml` (Zeile 72f.) entfernen
- Secret `MAKE_BOOKING_WEBHOOK_URL` aus den Projekt-Secrets löschen
- Deployte Edge Function `send-booking-data` via Tool entfernen

## 2. `src/components/finance/BankStatementsTab.tsx`
- `handleBookAll` (ab Zeile 525) und `handleBookSingle` (ab Zeile 578) ersatzlos entfernen — sind aktuell ohnehin an keinen Button mehr gebunden (Verifikation: `rg` findet nur die Definitionen). Damit verschwinden die letzten Aufrufe von `send-booking-data`. Buchungslogik bleibt komplett im `TransactionReviewMode` (direkt in `bookings`-Tabelle).

## 3. `src/pages/WebhookSettings.tsx`
- States `isBookingTesting`, `lastBookingResult` entfernen
- Funktion `handleTestBookingWebhook` entfernen
- Card-Abschnitt "Test-Buchung an Make.com senden" (Button + Result-Alert, Zeilen ~240–275) entfernen
- Ggf. nicht mehr genutzte Imports (`CheckCircle2`/`XCircle`/`Badge`) prüfen und nur entfernen, wenn nicht anderswo verwendet

## 4. `src/components/buildings/BookingInstructionsSection.tsx`
- Hinweistext im `CardHeader` ändern auf z. B.:
  > „Liegenschaftsspezifische Hinweise für die KI-Buchung. Diese fließen direkt in die KI-gestützte Kontenzuordnung ein und haben höchste Priorität."
- Keine Logikänderung.

## Nicht angefasst
- `MAKE_WEBHOOK_URL`, `MAKE_KEY_WEBHOOK_URL`, `MAKE_KEY_LOAN_WEBHOOK_URL` und die zugehörigen Edge Functions/Aufrufe (`process-bulk-upload`, Schlüssel-/Gebäudedaten-Flows, E-Mail-/Passwort-Flows).
