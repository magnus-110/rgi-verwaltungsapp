

## Ziel
Den "(1 Fehler)"-Hinweis in der KI-Analyse-Badge anklickbar machen, damit der Nutzer sieht, **welche** Transaktionen fehlgeschlagen sind, **warum** und sie ggf. erneut analysieren kann.

## Ursache
In `BankStatementsTab.tsx` ist der Fehler-Hinweis aktuell nur ein `<span>` ohne Klick-Handler. In `useTransactionAiPrefetch.ts` wird beim Fehler nur `ai_analysis_status = "failed"` gespeichert, aber **keine Fehlermeldung**. Deshalb gibt es nichts Anklickbares und nichts Anzeigbares.

## Umsetzung

### 1. Fehlermeldung in DB persistieren
In `src/hooks/useTransactionAiPrefetch.ts`:
- beim Fehler nicht nur `ai_analysis_status: "failed"` schreiben, sondern auch `ai_analysis_error: <message>` (Spalte ggf. als optionales Feld, falls nicht vorhanden Migration anlegen).
- Fehlertext: `err?.message || "Unbekannter Fehler"`, max. 500 Zeichen.

### 2. DB-Migration (falls nötig)
Spalte hinzufügen:
- `bank_transactions.ai_analysis_error TEXT NULL`

### 3. Badge anklickbar machen
In `src/components/finance/BankStatementsTab.tsx`:
- den `<span>({errors} Fehler)</span>` durch einen `<Popover>`-Trigger ersetzen.
- Popover-Inhalt: Liste aller Transaktionen aus `allBuildingTxns` mit `ai_analysis_status === "failed"`:
  - Datum, Betrag, Verwendungszweck (gekürzt)
  - Fehlertext aus `ai_analysis_error`
  - Anzahl Versuche `ai_analysis_attempts`
  - Button "Erneut analysieren" → setzt `ai_analysis_status = null`, `ai_analysis_attempts = 0`, invalidiert Query → Hook startet automatisch neu.
  - Button "Manuell zuordnen" → öffnet vorhandenen `AssignmentDialog` für diese Transaktion.

### 4. Visuelles Feedback
- Badge bekommt `cursor-pointer` und Hover-State.
- Fehler-Span bekommt Underline + Tooltip "Details anzeigen".

### 5. Auch nach Abschluss anzeigen
Aktuell wird die Badge ausgeblendet, sobald `running = false`. Damit Nutzer Fehler **nach** Abschluss sehen:
- Wenn `!running && errors > 0` → eigene rote Badge "X KI-Fehler" (anklickbar, gleicher Popover-Inhalt) anzeigen, parallel zur grünen "X KI-Vorschläge"-Badge.

## Betroffene Dateien
- `src/hooks/useTransactionAiPrefetch.ts` (Fehler speichern)
- `src/components/finance/BankStatementsTab.tsx` (Popover + Retry-Logik)
- neue Migration: `bank_transactions.ai_analysis_error`

## QA
- Transaktion ohne mögliches AI-Match importieren → Fehler erscheint
- Auf "(X Fehler)" klicken → Popover zeigt Liste mit Datum, Betrag, Fehlertext
- "Erneut analysieren" klicken → Status wird zurückgesetzt, KI startet neu
- Auch nach Abschluss bleibt anklickbarer Fehler-Badge sichtbar
- Tooltip auf Badge "Details anzeigen" funktioniert

