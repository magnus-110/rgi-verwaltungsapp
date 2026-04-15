

## Plan: Fix AI Matching Bug & Merge Analyse/Zuordnung into Single View

### Problem 1: AI matches never displayed

The `suggest-match` edge function returns matches with `{ id, score, reason }` — **no `type` field**. But `AssignmentTabContent` filters matches with `m.type === "invoice"` and `m.type === "template"`, so both `invoiceMatches` and `templateMatches` maps are always empty. This is why the "Bankgebühren" template isn't recognized despite being in tolerance range.

**Fix**: Instead of filtering by `type`, match the AI result IDs against the actual invoice/template lists to determine which type each match belongs to.

### Problem 2: UI Restructuring

Remove the Analyse/Zuordnung tabs. Replace with a single scrollable right panel:

```text
┌─────────────────────────────┐
│ 🔮 Analyse                  │  ← Section header
│  (PDF / Vorlage / KI-Info)  │
├─────────────────────────────┤
│ 🔗 Zuordnung                │  ← Section header
│  Empfohlene Matches (orange)│  ← Only if matches exist
│  "Keine Übereinstimmung"    │  ← Only if no matches
│  [Alle Rechnungen/Vorlagen] │  ← Expandable browse
└─────────────────────────────┘
```

- If there ARE matches (AI or smart), show them directly with orange highlight
- If there are NO matches, show the "Keine Übereinstimmungen" message and a collapsible section to browse all invoices/templates manually
- Remove `activeRightTab` state and the Tabs wrapper

### Changes

| File | Change |
|------|--------|
| `TransactionReviewMode.tsx` | 1. Fix match type detection by cross-referencing IDs with invoice/template lists instead of `m.type`. 2. Remove Tabs from right side, render Analyse section followed by Zuordnung section in a single scrollable column. 3. Remove `activeRightTab` state. 4. Always load invoices/templates queries (remove `activeRightTab === "zuordnung"` condition). |

### Technical Details

**Match type detection fix:**
```typescript
// Instead of m.type === "invoice"
const invoiceIds = new Set(allInvoices.map(i => i.id));
const templateIds = new Set(allTemplates.map(t => t.id));

const invoiceMatches = aiMatches.filter(m => invoiceIds.has(m.id));
const templateMatches = aiMatches.filter(m => templateIds.has(m.id));
```

**Layout**: Single `overflow-y-auto` div with two sections separated by headers. The Zuordnung section shows matched items (invoices + templates combined, sorted by score) at the top, then a collapsible "Alle durchsuchen" with the Rechnungen/Vorlagen sub-tabs for manual browsing.

