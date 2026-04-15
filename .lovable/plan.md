

## Plan: Fix Template Matching, Remove KI-Analyse Label, Switch to Mistral Large

### Problems Identified

1. **AI suggests new template instead of matching existing one**: The `amount_tolerance` field is NOT passed to the `suggest-match` edge function. The prefetch in `useTransactionAiPrefetch.ts` (line 65-77) omits `amount_tolerance` from the template data, and the candidate summary string in `suggest-match/index.ts` (line 23) also doesn't include it. Without tolerance info, the AI can't determine that the existing "Bankgebühren" template (e.g. 11.90€ ± 5€) covers the transaction amount.

2. **"KI-Analyse" purple header** still visible (line 862-864 in TransactionReviewMode.tsx).

3. **Model is `mistral-small-latest`** — needs to be reverted to `mistral-large-latest`.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTransactionAiPrefetch.ts` | Add `amount_tolerance: t.amount_tolerance` to the template data mapping (line ~70) |
| `supabase/functions/suggest-match/index.ts` | 1. Add `amount_tolerance` to the TEMPLATE candidate string so the AI sees tolerance ranges. 2. Change model from `mistral-small-latest` to `mistral-large-latest` |
| `src/components/finance/TransactionReviewMode.tsx` | Remove the purple "KI-Analyse" header block (lines 862-865). Keep the content (matches, hints, template suggestion) but without the section header |

### Technical Details

**Prefetch fix** (`useTransactionAiPrefetch.ts` line ~65-77):
```typescript
const templateData = (templates || []).map((t: any) => ({
  id: t.id,
  name: t.name,
  vendor_name: t.vendor_name,
  expected_amount: t.expected_amount,
  amount_tolerance: t.amount_tolerance,  // ← ADD THIS
  vendor_iban: t.vendor_iban,
  interval: t.interval,
  // ...rest unchanged
}));
```

Also need to add `amount_tolerance` to the select query on line 55-57.

**Edge function candidate string** (`suggest-match/index.ts` line 23):
```
TEMPLATE id=... name="..." vendor="..." amount=11.9 tolerance=5 iban="..." ...
```

**Model change** (`suggest-match/index.ts`):
```typescript
model: "mistral-large-latest",
```

**Remove KI-Analyse header** (`TransactionReviewMode.tsx` lines 861-865):
Remove the purple Sparkles icon and "KI-Analyse" h3 heading. The AI analysis content (matches, hints, template suggestions) remains visible without the header.

### Why this fixes the core bug

The AI currently sees: `TEMPLATE id=abc name="Bankgebühren" amount=11.9` but has no idea the tolerance is ±5€. When the transaction is 9.50€, the AI thinks it doesn't match (11.90 ≠ 9.50) and instead suggests creating a new template. With `tolerance=5` in the candidate string, the AI can see that 9.50 falls within 11.90 ± 5.

### Deployment

The `suggest-match` edge function will need redeployment. After that, existing `ai_suggestion` data on transactions will be stale — but new prefetch runs will use the corrected data.

