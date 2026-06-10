## Ziel
Zweite Buchungs-Flag „Unsicher" zusätzlich zur bestehenden „Zur Prüfung"-Flag einbauen, an die bereits in Supabase vorhandene Spalte `ai_confidence_unsicher` auf `bookings` koppeln, in allen Buchungsmasken sichtbar machen, visuell klar von der bestehenden Flag unterscheiden und in den Buchungslisten filterbar machen.

## Mapping der Konfidenz-Level
- `ai_confidence_mittel` → bestehende Flag `needs_review` (orange, Icon `Flag`, Label „Zur Prüfung")
- `ai_confidence_unsicher` → neue Flag (rot, Icon `AlertTriangle`, Label „Unsicher")

Beide Flags sind unabhängig setzbar (KI oder Mensch). `review_note` wird weiterhin als gemeinsames Notizfeld genutzt — keine Schema-Änderung nötig, da `ai_confidence_unsicher` schon existiert.

## Änderungen

### 1. `BankPurposePanel.tsx` (zentrales Flag-UI)
- Neue Props: `uncertain: boolean`, `onToggleUncertain(next, note?)`.
- Zweiter Toggle-Button direkt neben „Zur Prüfung":
  - Inaktiv: Outline-Button mit `AlertTriangle`, Text „Unsicher".
  - Aktiv: rot getönt (`border-red-300 bg-red-50 text-red-700` / dark äquivalent) mit „Unsicher erledigt"-Bestätigungsaktion analog zur Prüfung-Flag.
- Card-Hintergrund-Logik: orange wenn nur `needs_review`, rot wenn `uncertain`, rot-orange-Gradient/rot dominant wenn beide.
- Bestehender Popover-Notiz-Flow für „Unsicher" wiederverwendet (gleiches `review_note`).

### 2. `EditBookingDialog.tsx`
- `BankPurposePanel` mit neuen Props verdrahten, `ai_confidence_unsicher` lesen/schreiben (`update.ai_confidence_unsicher = next`).

### 3. `CreateBookingDialog.tsx`
- `pendingFlag` State um `uncertain` erweitern, beim Insert `ai_confidence_unsicher` mitschreiben. UI: zweiter Toggle neben der bestehenden Flag-Schaltfläche, gleiche Farb-Konvention.

### 4. `TransactionReviewMode.tsx`
- Row-Typ um `ai_confidence_unsicher: boolean` erweitern, Default `false`, in allen Resets (Zeilen 442, 757) ergänzen.
- Zweiter Toggle-Button neben dem bestehenden Flag-Toggle (Z. 2437) mit rotem Akzent.
- Bei `bookings.update` / `insert` (Z. 1110, 1191) Feld mitspeichern.

### 5. `BookingsTab.tsx` (Buchungsliste)
- Filter-Dropdown bekommt zusätzliche Option „Nur Unsicher" (analog zum bestehenden „Nur Prüfung"-Filter, Z. 247).
- Row-Highlight: bestehendes Orange für `needs_review`, zusätzlich rotes Highlight (`bg-red-50 dark:bg-red-950/20`) wenn `ai_confidence_unsicher`; beide kombiniert → rot dominiert mit orangefarbenem Seitenstrich (`border-l-4 border-orange-400`).
- Inline-Badge in Z. 397 um zweite Badge „Unsicher" (rot, `AlertTriangle`) ergänzen, mit Klick zum Auflösen (`update({ ai_confidence_unsicher: false })`).
- Top-Counter in Z. 562 zeigt zwei Pillen: „X Prüfung" (orange) und „Y Unsicher" (rot).

### 6. `BankStatementsTab.tsx`
- Select erweitern: `bookings!...(id, needs_review, review_note, ai_confidence_unsicher)`.
- Badge-Rendering (Z. 720) um zweite rote „Unsicher"-Badge ergänzen.
- Sort-Helper (Z. 1178) priorisiert zusätzlich `ai_confidence_unsicher` (unsicher vor Prüfung vor Rest).

### 7. `CashAuditJournal.tsx` & `AccountPlanView.tsx`
- Wo `needs_review`-Badge gerendert wird, parallel `ai_confidence_unsicher`-Badge anzeigen (lesend, gleiche Farbsemantik). Keine Logik-Änderung.

## Visuelle Unterscheidung (verbindlich)
| Flag | Farbe | Icon | Label |
|------|-------|------|-------|
| Prüfung (mittel) | Orange (`orange-300/50/700`) | `Flag` | „Zur Prüfung" |
| Unsicher | Rot (`red-300/50/700`) | `AlertTriangle` | „Unsicher" |

Tooltip-Texte machen Bedeutung explizit: „Mittlere KI-Konfidenz – bitte gegenprüfen" vs. „Niedrige KI-Konfidenz – Buchung ist unsicher".

## Keine Änderungen
- Keine Migration nötig (Spalten existieren bereits).
- `ai_confidence_score` und `ai_confidence_mittel` werden nicht angefasst (werden weiterhin vom MCP-Server / Claude Cowork gefüllt).
- Keine Backend-Logik, rein UI/Persistenz auf bestehendem Schema.
