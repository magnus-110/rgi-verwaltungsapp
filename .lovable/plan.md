

## Vier Verbesserungen für den Bankabgleich-Dialog

### 1. "Ignorieren"-Button wieder einführen
- In `BankStatementsTab.tsx` bei unmatched-Transaktionen einen "Ignorieren"-Button neben "Zuordnen" und "Buchen" hinzufügen
- Setzt `match_status` auf `"ignored"` via `updateMatchStatus(txn.id, "ignored")`
- Ignorierte Transaktionen werden in einer eigenen Sektion (ähnlich wie gebuchte) mit Toggle angezeigt
- `MATCH_STATUS_CONFIG` hat bereits `ignored` definiert mit `EyeOff`-Icon

### 2. Erledigte KI-Vorschläge aus der Liste entfernen
- In `AssignmentDialog.tsx` einen neuen State `dismissedHintIndices` (Set<number>) einführen
- Wenn `onOpenBookingDialog` für einen Vorschlag aufgerufen wird, den Index zum Set hinzufügen
- Die `suggested_bookings`-Liste im Render filtert nach `!dismissedHintIndices.has(idx)`
- Bei `onBookingCreated` im `BankStatementsTab` den `bookingPrefill` zurücksetzen, aber den Dialog offen lassen — die Logik dafür existiert bereits ("Don't close the assignment dialog")
- Zusätzlich: Callback von `CreateBookingDialog` → `AssignmentDialog` weiterleiten, damit der Index entfernt wird

Konkreter Ablauf:
- `AssignmentDialog` bekommt neue Prop `onBookingCreatedFromHint?: (index: number) => void`
- `handleOpenBooking` übergibt den Index mit an `onOpenBookingDialog`
- `BankStatementsTab` speichert den aktuellen Hint-Index und ruft nach `onBookingCreated` den Callback auf
- `AssignmentDialog` fügt den Index zu `dismissedHintIndices` hinzu

### 3. Vorlage pro Buchung zuordnen
- In `CreateBookingDialog.tsx` ein optionales "Vorlage verknüpfen"-Dropdown hinzufügen
- Neues Feld `matched_template_id` im Formular-State
- Beim Insert in `bookings` wird `matched_template_id` mitgespeichert
- Dropdown lädt `booking_templates` für die gewählte Liegenschaft (ähnlich wie im AssignmentDialog)
- Searchable Combobox mit Vorlagenname + Lieferant

### Dateien

1. **`src/components/finance/AssignmentDialog.tsx`**
   - State `dismissedHintIndices: Set<number>` 
   - Filter suggested_bookings im Render
   - Neue Prop `onBookingCreatedFromHint`
   - Index an `onOpenBookingDialog` übergeben

2. **`src/components/finance/BankStatementsTab.tsx`**
   - "Ignorieren"-Button bei unmatched-Transaktionen
   - Ignorierte Transaktionen als eigene Sektion mit Toggle
   - `currentHintIndex`-State für Hint-Tracking
   - Callback-Weiterleitung für erledigte Hints

3. **`src/components/finance/CreateBookingDialog.tsx`**
   - Neues Feld `matched_template_id` im Formular
   - Query für `booking_templates` der Liegenschaft
   - Searchable Popover/Combobox für Vorlagenauswahl
   - Insert mit `matched_template_id`

