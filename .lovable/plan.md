

## Plan: Fix Bank Fee Template Matching & Add Re-run Button

### Root Cause

Bank fee transactions ("Abrechnung 30.12.2025") have **no creditor_name and no creditor_iban** — both are `null`. The "Bankgebühren / Kontoführung" template has `vendor_iban: "unbekannt"` and `vendor_name: "Bank / Kreditinstitut"`. This means:

1. **AI matching fails** — the AI sees the template in its candidate list but returns `matches: []` because there's no IBAN or name overlap. It instead suggests creating a *new* template.
2. **Smart matching fails** — the code checks IBAN and vendor name, both of which are empty, so no match is found.
3. **Amount matching alone isn't triggered** — the smart matcher requires at least one other signal (IBAN or name) before considering amount.

### Changes

| File | Change |
|------|--------|
| `suggest-match/index.ts` | Add explicit instruction to the AI prompt: "If a transaction has no creditor_name and no creditor_iban, match it by purpose keywords and amount against template names. For example, 'Abrechnung' → 'Bankgebühren'" |
| `TransactionReviewMode.tsx` | 1. **Enhanced smart matching**: Add purpose-keyword matching — if the template name contains words from the purpose (or vice versa), and the amount is within tolerance, flag as a smart match. 2. **Add "KI-Analyse erneut starten" button** (RefreshCw icon) that clears `ai_suggestion` on the current transaction, re-invokes `suggest-match`, and updates local state. 3. **Add bulk "Alle KI-Analysen zurücksetzen" button** in the top bar to clear all stale suggestions. |
| `suggest-match/index.ts` | Redeploy after prompt update |

### Technical Details

**Enhanced AI prompt** (add to system prompt in `suggest-match/index.ts`):
```
Wichtig bei fehlenden Metadaten:
- Manche Transaktionen (z.B. Bankgebühren, Kontoführungsgebühren) haben KEINEN Kreditor-Namen und KEINE IBAN.
- In diesen Fällen: Matche anhand des Verwendungszwecks UND Betrags gegen existierende Vorlagen.
- Beispiel: Verwendungszweck "Abrechnung" + Betrag ~12€ → Vorlage "Bankgebühren / Kontoführung" mit Toleranz ±5€
- Bevorzuge IMMER eine existierende Vorlage gegenüber dem Vorschlag einer neuen Vorlage.
```

**Enhanced smart matching** (purpose keywords → template name):
```typescript
// If no IBAN/name match but amount is in tolerance, check purpose keywords
if (reasons.length === 0 && tpl.expected_amount != null) {
  const tol = tpl.amount_tolerance || 0;
  const amountInRange = Math.abs(txnAmount - Math.abs(tpl.expected_amount)) <= tol;
  const purposeWords = txnPurpose.split(/\s+/).filter(w => w.length > 3);
  const templateNameLower = (tpl.name || "").toLowerCase();
  const nameOverlap = purposeWords.some(w => templateNameLower.includes(w));
  if (amountInRange && (nameOverlap || (!txnIban && !txnName))) {
    reasons.push("Betrag im Toleranzbereich");
  }
}
```

**Re-run button**: A RefreshCw icon button next to the Analyse section header. Clicking it:
1. Sets `ai_suggestion = null` on the current transaction in DB
2. Calls `suggest-match` edge function with fresh data
3. Saves result back to DB and updates local state via `queryClient.invalidateQueries`

**Bulk reset**: A button in the top bar that clears `ai_suggestion` for all unbooked transactions in this building, triggering the prefetch hook to re-analyze everything.

