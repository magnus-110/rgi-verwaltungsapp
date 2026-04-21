

## Ziel
Drei Verbesserungen im Buchungs-Workflow für eine flüssigere "Buchungs-Pipeline".

---

### 1. Manuelle Rechnungs-Zuordnung → großer Review-Modus rechts

**Problem:** Wenn man im `AssignmentDialog` eine Rechnung manuell mit einer Kontoauszugs-Position verknüpft, landet die Transaktion in der "Zugeordnet"-Liste — aber man muss separat auf die Zeile klicken, um sie wie eine automatisch gematchte Transaktion im Vollbild-Review zu sehen.

**Lösung in `BankStatementsTab.tsx`:**
- Nach erfolgreichem `handleManualAssign` (Zeile ~322 + ~670) wird die Liste invalidiert. Direkt danach:
  1. Index der manuell zugeordneten Transaktion in `allUnbookedForReview` ermitteln (über `manualAssignTxn.id`).
  2. `setReviewInitialIndex(idx)` + `setReviewModeOpen(true)` aufrufen.
- Die Transaktion zeigt sich dadurch sofort im großen Vollbild-Review mit Rechnungs-PDF rechts — identisch zu automatisch gematchten Transaktionen.
- Da `match_status: "manually_matched"` bereits in `matchedTransactions` aufgenommen wird, ist die Logik im `TransactionReviewMode` schon kompatibel (es lädt `invoiceDetail` über `matched_invoice_id`, siehe Zeile 148–160).

---

### 2. Schnellbuchen: Nach Bestätigung Konto-Picker erneut öffnen

**Problem:** In `CreateBookingDialog.tsx` bleibt die Maske nach Speichern offen (`resetForm()` Zeile 166), aber der `useEffect`, der den Konto-Picker automatisch öffnet (Zeile 98–106), reagiert nur auf `open`-Änderungen — nach einem Save passiert nichts.

**Lösung in `CreateBookingDialog.tsx`:**
- Neuen State `saveCounter` einführen, der bei jedem erfolgreichen Save inkrementiert wird.
- Den Auto-Open-`useEffect` (Zeile 98–106) auf `[open, prefill, saveCounter]` umstellen.
- In `handleSave` direkt nach `resetForm()`: `setSaveCounter(c => c + 1)` aufrufen.
- Effekt: Nach jedem Speichern wird der Cursor wieder direkt im Konto-Suchfeld platziert → reines Tippen für die nächste Buchung möglich.

---

### 3. Rückgängig-Button in der Buchungsliste / Kontenplan

**Problem:** Wenn man eine Buchung aus dem Kontoauszug versehentlich falsch verbucht hat, gibt es im `BookingsTab` keinen Weg zurück — die Transaktion ist als gebucht markiert und verschwindet aus dem Kontoauszug.

**Lösung in `BookingsTab.tsx`:**
- Neue Spalte/Aktion in `renderRow` (ganz rechts neben den Status-Icons): kleiner `RotateCcw`-Button mit Tooltip "Buchung rückgängig — zurück zum Kontoauszug".
- Sichtbar nur, wenn Buchung aus Bank-Import stammt (`b.source === "bank_import"`) und eine zugehörige `bank_transaction` existiert.
- Klick öffnet kompakte Bestätigung (AlertDialog): „Buchung löschen und Transaktion wieder zur Verarbeitung freigeben?"
- Ablauf bei Bestätigung:
  1. `bank_transactions` mit `booking_id = b.id` finden.
  2. `bank_transactions.update({ booked_at: null, booking_id: null })`.
  3. `bookings.delete().eq("id", b.id)`.
  4. Toast „Buchung rückgängig — Transaktion zurück im Kontoauszug" + Query-Invalidierung (`bookings-*`, `bank-transactions-*`).
- Auch im Kontenplan-View (`AccountPlanView`) wird derselbe Button durchgereicht (sofern dort Zeilen gerendert werden — alternativ nur in der Listen-Ansicht).

---

## Betroffene Dateien
- `src/components/finance/BankStatementsTab.tsx` — Auto-Sprung in Review-Modus nach manueller Zuordnung
- `src/components/finance/CreateBookingDialog.tsx` — Konto-Picker nach Save erneut öffnen
- `src/components/finance/BookingsTab.tsx` — Rückgängig-Button + AlertDialog
- ggf. `src/components/finance/AccountPlanView.tsx` — Rückgängig-Aktion in Kontenplan-Zeilen

## QA
- Rechnung im AssignmentDialog manuell verknüpfen → Vollbild-Review öffnet sich automatisch mit PDF rechts.
- Neue Buchung anlegen, mit Enter speichern → Konto-Suchfeld ist sofort wieder fokussiert und geöffnet.
- Buchung aus Bank-Import in Buchungsliste rückgängig machen → Buchung weg, Transaktion erscheint wieder in „Zugeordnet" im Kontoauszug.
- Manuelle Buchungen ohne `bank_transaction` zeigen keinen Rückgängig-Button.

