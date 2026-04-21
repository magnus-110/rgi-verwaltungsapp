

## Ziel

1. **Enter-Navigation** für Konto, Gegenkonto und Wirtschaftsjahr reparieren – Enter im jeweiligen Feld muss ins nächste Feld springen (bisher bleibt der Fokus stehen, weil `AccountSearchSelect` keinen Commit-Handler bekommt und das Wirtschaftsjahr-Feld ein number-Input mit Sonderverhalten ist).
2. **Teilbuchungen können einzeln rückgängig gemacht werden**, direkt aus der gebuchten Zeile – nicht erst nachdem alle Splits gebucht sind.

## Ursachen

### Enter-Navigation
- **Konto / Gegenkonto** (`AccountSearchSelect`): Beim Auswählen via Maus/Enter wird zwar `onChange` ausgelöst, aber kein `onCommit` weitergegeben. In `BookingRowCard` ist die Komponente ohne `onCommit`-Prop eingebunden → kein Sprung zum nächsten Feld. Auch wenn der Trigger fokussiert ist und Enter gedrückt wird (ohne Popover zu öffnen), fehlt der Sprung.
- **Wirtschaftsjahr**: Ist als `<Input type="number">` korrekt verdrahtet, aber `handleEnterNavigation` springt zwar ins MwSt-Feld – das funktioniert. Problem: Der Nutzer beschreibt, dass auch hier Enter nichts tut. Ursache: `Select` ohne offenem Menü konsumiert Enter nicht; Fokus liegt nach Tab oft auf dem Trigger des Vorgängers. Wir verstärken das Verhalten durch konsistenten `onCommit`-Sprung.
- **`pendingBookingIdsRef` Bug bei Splits**: `booking.id` ist beim Split mehrfach derselbe (insert returns single), wird in undo benötigt – muss korrekt pro Row gehalten werden.

### Teilbuchung rückgängig
- Aktuell wird `undoStack` erst gepusht, wenn **alle** Splits gebucht sind (Zweig `if (allBooked)`). Eine einzelne Teilbuchung (ein Split-Part von mehreren) lässt sich nicht zurückrollen.
- In der gebuchten Zeile ist nur `Trash2` für *unbooked* Rows sichtbar. Für `booked === true` gibt es keinen Undo-Button.

## Umsetzung

### 1. AccountSearchSelect → Enter springt zum nächsten Feld

**`src/components/finance/AccountSearchSelect.tsx`**
- Schon vorhandene `onCommit`-Prop wird in `handleSelect` (Maus/Enter im Popover) und im Trigger-`onKeyDown` aufgerufen → **keine Änderung nötig**.

**`src/components/finance/TransactionReviewMode.tsx` – `BookingRowCard`**
- `AccountSearchSelect` für **Konto** bekommt `onCommit={() => focusField("amount")}`.
- `AccountSearchSelect` für **Gegenkonto** bekommt `onCommit={() => focusField("description")}`.
- Neue lokale Helper-Funktion `focusField(name)` (oder `handleEnterNavigation` mit synthetischem Event): fokussiert das Element aus `fieldRefs.current[name]`, selektiert bei Inputs den Inhalt; bei Select-Triggern `.focus()`.

### 2. Wirtschaftsjahr → Enter springt zu MwSt zuverlässig

- Im `Input` für `fiscal_year` ist `handleEnterNavigation` schon registriert; wir stellen sicher, dass `fieldRefs.current["vat_rate"]` (Select-Trigger) tatsächlich `.focus()` annimmt. In `handleEnterNavigation` zusätzlich: wenn Element ein `button[role="combobox"]` ist, `el.focus()` direkt aufrufen (statt nur über `querySelector`). Damit funktioniert auch Enter aus dem Wirtschaftsjahr-Feld.

### 3. MwSt → Buchen weiterhin via Enter

- Bestehende Logik (`__book__` Sentinel) bleibt; nach Auswahl im MwSt-Select wird der Buchen-Button fokussiert und geklickt.

### 4. Teilbuchung einzeln rückgängig machen

**`TransactionReviewMode.tsx`**
- `pendingBookingIdsRef` schon vorhanden – pro `currentTxn.id` wird Liste gepflegt. Diese erweitern auf **Map row.id → bookingId**, damit wir wissen, welche DB-Buchung zu welcher Zeile gehört.
- Neuer State/Ref: `rowBookingMap: Record<txnId, Record<rowId, bookingId>>`. Beim erfolgreichen Insert eintragen.
- Neue Funktion `undoSingleRow(rowId)`:
  1. Lookup `bookingId` aus `rowBookingMap[currentTxn.id][rowId]`.
  2. `supabase.from("bookings").delete().eq("id", bookingId)`.
  3. Wenn die Transaktion bereits als komplett gebucht markiert war (`booked_at` gesetzt, weil es die letzte Teilbuchung war), `bank_transactions.update({ booked_at: null, booking_id: null })`.
  4. Lokal: `setFormRows(rows => rows.map(r => r.id === rowId ? { ...r, booked: false } : r))`.
  5. Map-Eintrag löschen, ggf. aus `undoStack` den entsprechenden Eintrag entfernen.
  6. Toast „Teilbuchung rückgängig gemacht“; Query-Invalidate (`bookings-all`, `bank-transactions-*`).
- Bestehender `undoLast` (Cmd+Z) bleibt unverändert für komplette Transaktionen.

**UI in `BookingRowCard`**
- Neben/statt des `Trash2`-Buttons in der Kopfzeile: wenn `row.booked === true`, einen `RotateCcw`-Button rendern, Tooltip „Teilbuchung rückgängig machen“. Klick ruft neue Prop `onUndoRow?.()` auf.
- Wenn `row.booked === false`, weiterhin `Trash2` für „Zeile entfernen“ (bestehend).
- Visuell: gebuchte Zeile bleibt grün hinterlegt (bestehend), Undo-Button rechts oben.

**Props-Verdrahtung**
- `BookingRowCard` bekommt zusätzliche Prop `onUndoRow?: () => void`.
- In der `formRows.map(...)`-Schleife: `onUndoRow={() => undoSingleRow(row.id)}`.

### 5. Robustheit

- Vor Delete der Buchung prüfen, ob die zugeordnete Bank-Transaktion noch existiert; falls sie schon weiter verarbeitet wurde, Toast-Fehler.
- Doppelklicks verhindern via `undoingRowId` State.
- Cmd+Z bleibt unverändert (komplettes Tx-Undo).

## Betroffene Dateien

- `src/components/finance/TransactionReviewMode.tsx`
  - `handleEnterNavigation`: Combobox-Fokus verbessern.
  - `BookingRowCard`: `onCommit` an beide `AccountSearchSelect` anhängen, neuer Undo-Button für gebuchte Zeilen.
  - Neuer State `rowBookingMap`, neue Funktion `undoSingleRow`.
  - In `handleBookRow`: `rowBookingMap` füllen.
- `src/components/finance/AccountSearchSelect.tsx`: keine Änderung nötig (`onCommit` bereits vorhanden).

## QA

- Prüfmodus öffnen, Zeile expandieren.
- Konto auswählen (Maus oder Enter im Popover) → Fokus springt automatisch in Betrag, Inhalt markiert.
- Im Betrag Enter → springt zu Gegenkonto.
- Gegenkonto auswählen → Fokus springt in Buchungstext.
- Enter durchlaufen bis Wirtschaftsjahr → Enter springt in MwSt-Select.
- MwSt wählen → Fokus & Auto-Klick auf Buchen-Button.
- Split-Buchung mit 2 Teilen erstellen, ersten Teil buchen → grüne Zeile zeigt Undo-Button (RotateCcw). Klick → Buchung wird gelöscht, Zeile wieder editierbar, Toast „Teilbuchung rückgängig gemacht“.
- Beide Teile buchen → Cmd+Z macht komplette Transaktion rückgängig (bestehendes Verhalten).

