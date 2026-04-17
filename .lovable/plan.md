

## Plan: Stabiler Prüfmodus mit Edit-Persistenz, Enter-Bestätigung und Undo

### Befund

**1. Warum heute morgen wieder eine KI-Analyse lief**
- `useTransactionAiPrefetch.ts` triggert für jede Transaktion, die `!ai_suggestion && !booked_at && (unmatched || matched_invoice_id)` ist.
- Wenn gestrige Calls in Timeout/Fehler liefen, wurde **nichts** in `bank_transactions.ai_suggestion` geschrieben → heute beim Öffnen erscheinen sie wieder als "noch nie analysiert" und der Lauf startet neu.
- Es gibt keinen persistenten "schon versucht"-Marker auf DB-Ebene.

**2. Edits gehen beim Wechsel verloren**
- In `TransactionReviewMode.tsx` werden `formRows` in einem `useEffect` (Zeile ~519, dep `currentTxn?.id`) komplett neu gebaut, sobald `currentIndex` wechselt.
- Edits leben nur in lokalem React-State und werden weder gespeichert noch zwischengepuffert.

**3. Enter bestätigt nicht zuverlässig**
- `handleEnterNavigation` springt nur durch Felder (FIELD_ORDER) und bucht erst beim letzten Feld die Zeile.
- Der globale Keydown-Listener (Zeile 705) ignoriert Enter komplett und reagiert nur auf ArrowLeft/Right.
- Es gibt keine globale „Enter = bestätigen & weiter"-Logik außerhalb von Inputs.

**4. Undo fehlt komplett**
- Nach erfolgreicher Buchung wird `bank_transactions.booked_at` gesetzt + `bookings`-Eintrag angelegt. Kein Undo-Mechanismus, keine Historie.

### Lösung

**A. KI-Analyse nur einmal pro Transaktion versuchen**
- Migration: neue Spalten auf `bank_transactions`:
  - `ai_analysis_attempted_at TIMESTAMPTZ`
  - `ai_analysis_status TEXT` (`pending` | `success` | `failed` | `skipped`)
  - `ai_analysis_attempts INT DEFAULT 0`
- In `useTransactionAiPrefetch.ts`:
  - Filter zusätzlich: `ai_analysis_status !== 'failed'` und `attempts < 2`.
  - **Vor** Aufruf: Status auf `pending` + `attempted_at = now()` setzen.
  - Bei Erfolg: `success`. Bei Fehler/Timeout: `failed`, `attempts++`. So entsteht heute kein neuer Lauf für gestern fehlgeschlagene.
- Manueller Re-Trigger (Button „KI neu analysieren") setzt Status zurück.

**B. Edits beim Navigieren beibehalten**
- In `TransactionReviewMode.tsx`:
  - Neuer State `editsCache: Record<txnId, BookingRowData[]>`.
  - Beim Wechsel der Transaktion: aktuelle `formRows` in `editsCache[prevTxnId]` ablegen.
  - Beim Aufbau der neuen Transaktion: zuerst prüfen, ob `editsCache[currentTxn.id]` existiert → davon laden statt aus Defaults/AI.
  - `useEffect`-Aufbau-Logik nur ausführen, wenn KEIN Cache-Eintrag existiert.
- Ergebnis: Vor- und Zurückspringen behält alle manuellen Anpassungen.

**C. Enter = bestätigen und springen**
- Globalen Keydown-Listener erweitern:
  - In Inputs: bisheriges Feldsprungverhalten beibehalten, am Ende der Felder → buchen.
  - Außerhalb Inputs: `Enter` → `confirmAndNext()` → bucht die aktuell expandierte Zeile (oder alle bei Multi-Row), markiert Transaktion als gebucht, springt zur nächsten.
- Klare Tastatur-Hilfeleiste im Header (Enter = bestätigen, → / ← = ohne Buchung navigieren, Esc = schließen).
- Nach Bestätigung Transaktion sofort aus `transactions`-Liste filtern (lokal), damit sie aus dem Kontoauszug verschwindet — Bookings-Seite zeigt sie automatisch über `queryClient.invalidateQueries`.

**D. Undo der letzten 10 Bestätigungen**
- Neuer State `undoStack: Array<{ txnId, bookingIds: string[], priorTxnState }>` (max 10, FIFO).
- Bei jeder erfolgreichen Bestätigung pushen.
- Neuer „Rückgängig"-Button im Header (mit Counter): poppt obersten Eintrag, löscht die zugehörigen `bookings`-Datensätze, setzt `bank_transactions.booked_at = null` und `booking_id = null`, springt im Prüfmodus zurück zu der Transaktion und stellt deren Form-Zustand aus `priorTxnState` wieder her.
- Kurzbefehl: `Ctrl/Cmd+Z`.
- Toast „Buchung rückgängig gemacht" mit „Wiederholen" (optional, Phase 2).

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `supabase/migrations/<new>.sql` | Spalten `ai_analysis_*` auf `bank_transactions` |
| `src/hooks/useTransactionAiPrefetch.ts` | Filter via Status, Status vor/nach Aufruf setzen |
| `src/components/finance/TransactionReviewMode.tsx` | `editsCache`, globaler Enter-Handler, `confirmAndNext`, `undoStack`, Undo-Button, Cmd+Z |
| `src/components/finance/BankStatementsTab.tsx` | Reset-Funktion „KI neu analysieren" setzt Status zurück |

### Erwartetes Verhalten nach Umsetzung

- Beim Öffnen am nächsten Tag: keine erneute KI-Analyse für bereits versuchte Transaktionen.
- Im Prüfmodus: Änderungen bleiben beim Hin- und Herspringen erhalten.
- `Enter` bestätigt die Buchung und springt zur nächsten Transaktion, die dann sofort aus dem Kontoauszug verschwindet und in „Buchungen" auftaucht.
- Letzte bis zu 10 Bestätigungen können per Button oder `Cmd+Z` rückgängig gemacht werden.

