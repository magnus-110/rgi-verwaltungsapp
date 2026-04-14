

## Plan: Drei Verbesserungen am Buchungsworkflow

### 1. Mistral AI statt Lovable AI Gateway

Die Edge Function `suggest-match` nutzt aktuell die Lovable AI Gateway. Diese wird auf die Mistral API umgestellt (`mistral-large-latest`), da der User DSGVO-Konformität und besseres Kontextverständnis bevorzugt. Ebenso wird der `useTransactionAiPrefetch` Hook angepasst.

**Datei:** `supabase/functions/suggest-match/index.ts`
- URL ändern: `https://api.mistral.ai/v1/chat/completions`
- Auth: `Bearer ${MISTRAL_API_KEY}` statt `LOVABLE_API_KEY`
- Model: `mistral-large-latest`
- Rest der Logik (Prompt, Tool-Schema) bleibt identisch

### 2. Betragswarnung bei Vorlage-Zuordnungen

Im `TransactionReviewMode` existiert bereits `amountMatch` (Zeile 352-362), das prüft ob der Betrag zur Vorlage/Rechnung passt. Problem: Bei Vorlage-Zuordnungen mit Betragsabweichung gibt es keine sichtbare Warnung.

**Datei:** `src/components/finance/TransactionReviewMode.tsx`
- Neue `amountMismatchWarning`-Logik: Wenn eine Vorlage zugeordnet ist und `!amountMatch`, eine gelbe Warnung anzeigen mit dem erwarteten vs. tatsächlichen Betrag
- Warnung im Buchungsbereich (links) zwischen Transaktionsdetails und Buchungsmaske einblenden
- Text: "⚠ Betrag weicht ab: Erwartet X €, tatsächlich Y € — möglicherweise Sammelzahlung"

### 3. Unzugeordnete Transaktionen im Prüfmodus statt AssignmentDialog

Aktuell öffnet ein Klick auf eine unzugeordnete Transaktion den `AssignmentDialog` (Zeile 410-411). Stattdessen soll derselbe `TransactionReviewMode` geöffnet werden — rechts dann mit KI-Analyse und potenziellen Zuordnungen, unten mit dem Buchungsvorschlag.

**Datei:** `src/components/finance/BankStatementsTab.tsx`
- Zeile 410-411: Klick auf unzugeordnete Transaktionen öffnet jetzt `openReviewAtTransaction(txn)` statt den AssignmentDialog
- Der AssignmentDialog bleibt über die "Ändern"-Buttons erreichbar

**Datei:** `src/components/finance/TransactionReviewMode.tsx`
- Rechte Seite: Für Transaktionen ohne Zuordnung (`sourceType === "manual"`) statt der leeren Ansicht die KI-Analyse anzeigen (wie bei `sourceType === "ai"`, aber auch Zuordnungsoptionen einblenden)
- Potenzielle Zuordnungen aus `ai_suggestion.matches` als klickbare Karten darstellen mit Button "Zuordnen"
- Bei Klick auf "Zuordnen": Transaktion direkt zuordnen (`match_status` + `matched_invoice_id`/`matched_template_id` updaten), Formular neu befüllen

---

### Zusammenfassung der Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/suggest-match/index.ts` | Lovable AI → Mistral API |
| `src/components/finance/TransactionReviewMode.tsx` | Betragswarnung + KI-Zuordnungs-UI für unzugeordnete |
| `src/components/finance/BankStatementsTab.tsx` | Klick auf unzugeordnete → Prüfmodus statt AssignmentDialog |

