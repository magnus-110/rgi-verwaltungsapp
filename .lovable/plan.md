## Ziel

1. Klick auf bereits gebuchte Transaktion in **Buchhaltung → Buchen → Kontoauszug** öffnet direkt die Buchungs-Bearbeitungsmaske (kein Umweg über das seitliche Detail-Sheet).
2. Sowohl in der Edit-Buchung-Maske (aus `BookingsTab`) als auch in der Buchungs-Maske aus dem Kontoauszug wird der **vollständige Verwendungszweck** des Bankauszugs prominent angezeigt — ausklappbar, wenn er lang ist.
3. In beiden Masken gibt es einen Button/Toggle „Zur Prüfung markieren" (Flagge), der `needs_review` auf der Buchung setzt/entfernt (mit optionaler Notiz).

## Änderungen

### A) `BankStatementsTab.tsx`
- `renderTransactionRow`: Im Fall `txn.booked_at` (gebucht) nicht mehr `setSelectedTransaction(txn.id)` (öffnet `TransactionDetailSheet`), sondern direkt die zugehörige Buchung in `EditBookingDialog` öffnen.
- Dafür neuen State `editBookingId` + `<EditBookingDialog>` einbinden. Booking-ID kommt aus `txn.bookings.id` (bereits im Select-Join verfügbar; ggf. `bookings(id, needs_review, review_note)` ergänzen).
- `TransactionDetailSheet`-Mount bleibt nur noch als Fallback für Ausnahmefälle (oder wird ganz entfernt, falls keine anderen Aufrufer).

### B) `EditBookingDialog.tsx` — Verwendungszweck + Flag-Toggle
- Query erweitern, damit die zugehörige `bank_transactions`-Zeile (über `booking.bank_transaction_id`) mit Feldern `purpose`, `debtor_name`, `creditor_name`, `booking_date`, `amount` mitgeladen wird.
- Neue Komponente direkt unter dem Header (vor dem AI-Warning-Block): **Verwendungszweck-Panel**
  - Zeigt vollständigen `purpose` (`whitespace-pre-wrap`), per Default auf 2 Zeilen geclamped, mit „Mehr anzeigen / Weniger" Toggle.
  - Klein darunter: Datum + Name + Betrag des Bankauszug-Eintrags.
- **Flag-Button** in der Header-Action-Leiste neben „Schließen":
  - Wenn `needs_review = false`: Button „Zur Prüfung markieren" (Flag-Icon, outline). Klick öffnet kleinen Popover mit optionalem Notizfeld + „Markieren".
  - Wenn `needs_review = true`: Bestehender „Prüfung erledigt"-Block bleibt, plus der Header-Button zeigt aktiven Status.
- Beides funktioniert auch wenn die Maske aus `BankStatementsTab` heraus geöffnet wird (gleiche Komponente).

### C) `CreateBookingDialog.tsx` — Verwendungszweck + Flag-Toggle
- Wenn `transactionId`-Prop übergeben ist (Buchen aus Kontoauszug), die Bank-Transaktion laden und das gleiche **Verwendungszweck-Panel** (extrahiert in `<BankPurposePanel>`) oben anzeigen.
- Flag-Toggle: beim Speichern der neuen Buchung `needs_review`/`review_note` mitschreiben (Felder existieren bereits auf `bookings`).

### D) Gemeinsame Komponente
- Neue Datei `src/components/finance/BankPurposePanel.tsx`: nimmt `{ purpose, debtor_name, creditor_name, booking_date, amount }` und rendert den ausklappbaren Block. Wird von B + C wiederverwendet.

## Technische Notizen
- `bookings.needs_review` und `bookings.review_note` existieren bereits (siehe `BookingsTab` Zeile 247/397, `EditBookingDialog` Zeile 622).
- `bank_transactions.purpose` ist Volltext (oft mehrzeilig); aktuell wird in Tabellen oft `truncate` benutzt — der Panel zeigt ihn vollständig.
- Keine DB-Migration nötig.
- Keine Änderungen an Make.com-Webhooks oder Edge Functions.

## Out of Scope
- Keine Logik-Änderung an Matching/Posting.
- `TransactionDetailSheet` bleibt im Code, wird im Kontoauszug-Tab aber für gebuchte Zeilen nicht mehr angesteuert.