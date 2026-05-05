# Kassenprüfung – Verbesserungen

Vier Änderungen, alle in `src/components/finance/`:

## 1. Neue Komponente: `BookingReviewDialog.tsx`

Vollbild-Splitview-Dialog (linke Spalte: Buchungsdetails-Karte + Nachweis + Geprüft/Auffällig + Notiz, rechte Spalte: PDF-iframe **oder** „Wiederkehrende Buchung"-Hinweis), als wiederverwendbare Komponente extrahiert. Akzeptiert eine Bookings-Liste + selectedId für Vor/Zurück-Navigation. Optional flag/note Callbacks (entfallen bei reinen View-Modus).

Buchungsdetails-Karte zeigt klar strukturiert:
- Datum, Betrag (farbig +/-), Buchungstext, Konto, **Gegenkonto**, Beleg-Nr., Typ (Einnahme/Ausgabe), §35a-Anteil falls vorhanden — in einer rahmen-/divide-getrennten Liste statt loser Zeilen.

## 2. `CashAuditAccountSheet.tsx` — Personenkonten-Soll, Auffällig, §35a, Click

- Zusätzliche Query für **`booking_templates`** (account_id, expected_amount, interval, valid_from, valid_to) für das Gebäude. Pro Personenkonto (Pattern `^0\d{3}$`, ohne 0000) wird das **Soll Hausgeld** errechnet:
  - Pro Vorlage Monate im Wirtschaftsjahr × Faktor (monatlich=1, vierteljährlich=1/3, jährlich=1/12), pro-rata über `valid_from`/`valid_to`-Schnitt mit Geschäftsjahr.
  - Mehrere Vorlagen werden summiert.
- Neue Header-Badges am Konto-Akkordeon: **Soll: X €** vs **Haben: Y €** — Differenz farbig (grün ≤ 1 €, rot sonst). Nur für Personenkonten (Konten 0001-0999).
- Query-Erweiterung `bookings` um `amount_35a` und `is_35a_relevant`.
- Neue Tabellen-Spalte **§35a** (rechts vor Saldo), pro Buchung mit `amount_35a`, **Footer summiert §35a**.
- Aktion **„Auffällig"** als zweiter Button neben „Geprüft" (gegenseitig exklusiv über `progress.accountFlags[id] = "ok" | "issue" | null`). Geprüft → grüner Rahmen, Auffällig → bernsteinfarbener Rahmen.
- Klick auf eine Buchungszeile öffnet den neuen `BookingReviewDialog` mit der Bookingsliste **dieses Kontos**, schreibt Flags/Notizen in `progress.bookingFlags`/`progress.bookingNotes` (gleiche Keys wie Journal).
- Erweiterung der Token-RPC `get_audit_accounts_by_token` und `get_audit_bookings_by_token` um `amount_35a`, `is_35a_relevant` sowie `counter_account` join, plus neue RPC `get_audit_templates_by_token`.

## 3. `CashAuditJournal.tsx` — Shared Dialog & klarere Buchungsdarstellung

- Inline-Vollbild-Modal entfernt; stattdessen `<BookingReviewDialog>` mit gefilterter Bookingsliste verwenden.
- Listenzeilen aufgeräumt: Datum links als Chip, Buchungstext groß, Konto/Gegenkonto klein darunter, **§35a-Badge** wenn relevant, Betrag rechts mit klarem +/- und Farbe.
- Query um `amount_35a, is_35a_relevant, counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name)` ergänzen.

## 4. SQL-Migration

Erweitert `get_audit_accounts_by_token` um Personenkonto-Soll-Berechnung sowie `get_audit_bookings_by_token` um `amount_35a`, `is_35a_relevant`, `counter_account`. Neue Funktion `get_audit_templates_by_token` (für Personenkonto-Soll im Token-Modus).

## Files

- **NEU** `src/components/finance/BookingReviewDialog.tsx`
- **EDIT** `src/components/finance/CashAuditAccountSheet.tsx`
- **EDIT** `src/components/finance/CashAuditJournal.tsx`
- **NEU** `supabase/migrations/<ts>_audit_token_enrichments.sql`

Keine UI-/UX-Änderungen außerhalb der Kassenprüfung.
