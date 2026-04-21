

## Ziel

1. **Enter** im Prüfmodus bestätigt nur die **aktuell aufgeklappte Buchungszeile** – nicht mehr alle ungebuchten Zeilen einer Transaktion auf einmal.
2. **Bereits gebuchte Teilbuchungen** lassen sich anklicken, **erneut öffnen und bearbeiten** (Konto, Betrag, Buchungstext, MwSt usw.). Beim erneuten „Buchen" wird die bestehende Buchung in der DB **aktualisiert** statt eine neue zu erzeugen.

## Ursachen

### Enter bestätigt alles
In `TransactionReviewMode.tsx` (Zeile ~1012) ist die globale Enter-Tastenkombination an `confirmAndNext` gebunden, das in einer Schleife `handleBookRow` für **jede** ungebuchte Zeile aufruft. Folge: Bei einer Split-Transaktion mit 3 Zeilen werden alle drei mit einem Enter gebucht.

### Gebuchte Zeilen nicht editierbar
- `BookingRowCard` zwingt das `Collapsible` mit `open={isExpanded && !row.booked}` zu, der Header-Button ist `disabled={row.booked}`. Klicks werden ignoriert.
- `handleBookRow` hat ein hartes `if (row.booked) return;` (Zeile 719) und führt grundsätzlich `INSERT` durch – kein Update-Pfad.
- `rowBookingMapRef` kennt zwar die `bookingId` jeder gebuchten Zeile (für Undo), wird aber für ein Update nicht genutzt.

## Umsetzung

### 1. Enter nur für die aktuell offene Zeile (`TransactionReviewMode.tsx`)

- Globale Enter-Behandlung im `keydown`-Effekt umstellen:
  - Wenn `expandedRowId` gesetzt ist und die Zeile **nicht gebucht** ist → `handleBookRow(expandedRowId)` (einzeln).
  - Wenn alle Zeilen gebucht sind oder keine Zeile offen ist → `handleNext()` (zur nächsten Transaktion springen).
  - `confirmAndNext` (Schleife) wird dadurch durch ein einzelnes-Booking-Verhalten ersetzt; die alte Funktion bleibt nur falls weitere Aufrufer existieren, sonst entfernen.
- Hinweis-Tooltip oben links (`Enter Buchen & weiter`) bleibt korrekt – Verhalten wird einfach präzisiert auf „aktuelle Zeile buchen, dann nächste offene Zeile fokussieren bzw. nächste Transaktion".

### 2. Gebuchte Zeile wieder bearbeitbar (`BookingRowCard`)

- `Collapsible open` auf `isExpanded` ändern (ohne `&& !row.booked`); Header-Button nicht mehr `disabled` setzen.
- Visuell: Bei `row.booked` weiterhin grün hinterlegt + grünes CheckCircle-Icon, zusätzlich kleiner Hinweis „Bearbeiten" beim Hover.
- Klick auf den Header öffnet die Zeile wieder, alle Eingabefelder werden editierbar (sind bereits dynamisch nicht disabled, nur das Collapsible verbirgt sie).
- Der bestehende **RotateCcw**-Undo-Button bleibt; daneben ein **„Aktualisieren"**-Button (statt „Buchen"), wenn die Zeile schon gebucht ist – derselbe Style wie der Buchen-Button, aber Text „Aktualisieren" und Icon `RefreshCw`.

### 3. Update-Pfad in `handleBookRow` (`TransactionReviewMode.tsx`)

- `if (row.booked) return;` entfernen.
- Vor dem Insert prüfen: `const existingBookingId = rowBookingMapRef.current[currentTxn.id]?.[rowId];`
  - Wenn vorhanden → `supabase.from("bookings").update(payload).eq("id", existingBookingId)`.
  - Wenn nicht vorhanden → bestehender Insert-Pfad.
- Nach erfolgreichem Update:
  - `setFormRows` lässt `booked: true` (bleibt grün).
  - Map-Eintrag bleibt auf derselben `bookingId`.
  - Toast „Teilbuchung aktualisiert ✓".
  - Kein `bank_transactions.update` (Status bleibt wie er war), keine Veränderung von `undoStack` / `bookedCount`.
  - Query-Invalidate wie bisher (`bookings-all`, `bank-transactions-*`).
- Beim Update-Pfad **nicht** automatisch zur nächsten Transaktion springen – Nutzer hat bewusst korrigiert, soll das Ergebnis sehen.

### 4. Sicherheitsnetz

- Vor dem Update prüfen, ob die Buchung in der DB noch existiert (kurzer `select id`); falls weg (z. B. parallel gelöscht) → Toast-Fehler und Map-Eintrag entfernen, Zeile auf `booked: false` zurücksetzen, damit Insert-Pfad greift.
- Doppelklick-Schutz über bestehendes `bookingSingle`-State.

## Betroffene Dateien

- `src/components/finance/TransactionReviewMode.tsx`
  - Globale Enter-Handler-Logik vereinfachen (eine Zeile statt Schleife).
  - `handleBookRow`: Update-Zweig ergänzen, `if booked return` entfernen.
  - `BookingRowCard`: Collapsible/Button auch für gebuchte Zeilen aktiv; Buchen-Button-Label dynamisch („Buchen" / „Aktualisieren").

## QA

- Split mit 3 Zeilen anlegen, erste Zeile aufklappen → Enter → nur Zeile 1 wird gebucht (grün), Zeile 2 wird automatisch aufgeklappt.
- Enter erneut → Zeile 2 gebucht usw. – nie alle gleichzeitig.
- Gebuchte Zeile (grün) anklicken → klappt auf, Felder editierbar, Buchen-Button zeigt „Aktualisieren".
- Konto/Betrag ändern → „Aktualisieren" → Toast „Teilbuchung aktualisiert", Zeile bleibt grün, Werte sind in DB überschrieben (überprüfbar im Bookings-Tab).
- Undo (RotateCcw) funktioniert weiterhin und löscht die Buchung komplett.
- Cmd+Z bleibt unverändert.

