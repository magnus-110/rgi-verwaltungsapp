

## Restructure Abrechnung & Wirtschaftsplan Tabs

### Current State
- **Abrechnung** has 6 steps: Saldenübernahme, Heizkosten, Export, Umbuchungen, Abgrenzungen, Gesamtabrechnung
- **Wirtschaftsplan** tab only contains the EconomicPlanEditor
- `chart_of_accounts` has flags: `is_billing_relevant`, `is_heating_relevant`, `is_35a_relevant`, `carry_forward_balance`
- No `is_wirtschaftsplan_relevant` flag exists yet

### Plan

---

#### A. Abrechnung Tab — Restructure to 4 Steps

**Remove "Saldenübernahme" as a step.** Instead, auto-trigger balance carry-forward when the billing period is selected (background upsert for accounts with `carry_forward_balance = true`). Show a small status badge ("Salden übernommen" / "Keine Vorjahresdaten") at the top near the period selector.

**New step structure:**

| Step | Label | Content |
|------|-------|---------|
| 1 | Buchungsprüfung | All confirmed bookings for the period, grouped by account category. Per-account completeness check (e.g. "12/12 Hausgeld E0001", "4/4 Wasser"). Expandable account rows showing individual bookings. |
| 2 | Heizkosten | HeatingAccountsSection + FuelInventorySection + HeatingRebookingSection (merge current steps 2-4 into one). Default target account 1400. |
| 3 | Abgrenzungen | AccrualSection — enhanced with auto-detection logic: compare booking `service_period_from`/`service_period_to` against fiscal year boundaries. Flag bookings that span year boundaries. |
| 4 | Gesamtabrechnung | BillingSettlement (unchanged) — creates total + individual settlements. |

**Remove** the separate "Export Ablesefirma" step (keep the export button inside the Heizkosten step).

**New component:** `BookingReviewSection.tsx` for Step 1.
- Query all confirmed bookings for building + fiscal year
- Group by account category
- For recurring costs (from `contact_recurring_costs`), calculate expected vs. actual count (e.g. monthly = 12, quarterly = 4)
- Show progress badges per unit/cost type
- Expandable rows to inspect individual bookings

**Modify:** `BillingTab.tsx` — update STEPS array and rendered content.

---

#### B. Wirtschaftsplan Tab — Rename to "Planung & Berichte", Add 3 Sections

Rename the third top-level tab from "Wirtschaftsplan" to **"Planung & Berichte"**. Use a sub-tab or accordion layout with 3 sections:

**Section 1: Wirtschaftsplan (Gesamt & Einzel)**
- Add `is_wirtschaftsplan_relevant` boolean to `chart_of_accounts` (migration)
- Step 1: Show WP-relevant accounts with editable planned amounts + reserve allocation. AI suggestion button (existing).
- Step 2: Preview & export (existing EconomicPlanPreview).
- Mostly reuse existing `EconomicPlanEditor` with filter changed from `is_billing_relevant` to `is_wirtschaftsplan_relevant`.

**Section 2: Vermögensbericht**
- New component `AssetReportSection.tsx`
- Pulls data from:
  - Bank account balances (`account_balances` where account category = Bankkonten)
  - Accrual/prepayment accounts (1470-1473)
  - Fuel inventory value (`fuel_inventory` for the period)
  - Manual additional assets (simple editable list stored in a new `asset_report_items` table or JSON in `billing_periods`)
- Renders a summary card with totals and an export button

**Section 3: §35a Bescheinigung**
- New component `Paragraph35aSection.tsx`
- Query accounts with `is_35a_relevant = true`
- Sum bookings per owner (via distribution keys)
- Show table: Owner | Anteil | Summe §35a
- Export as PDF per owner

---

#### C. Database Changes (Migration)

```sql
ALTER TABLE chart_of_accounts 
  ADD COLUMN is_wirtschaftsplan_relevant boolean NOT NULL DEFAULT false;

-- Set default: all billing-relevant accounts are also WP-relevant
UPDATE chart_of_accounts 
  SET is_wirtschaftsplan_relevant = true 
  WHERE is_billing_relevant = true;
```

---

### Files to Create
- `src/components/finance/BookingReviewSection.tsx` — Step 1 booking review with completeness checks
- `src/components/finance/AssetReportSection.tsx` — Vermögensbericht
- `src/components/finance/Paragraph35aSection.tsx` — §35a export

### Files to Modify
- **Migration** — add `is_wirtschaftsplan_relevant` column
- `src/components/finance/BillingTab.tsx` — new 4-step structure, auto balance carry-forward
- `src/pages/Finance.tsx` — rename tab, add sub-sections for WP/Vermögen/§35a
- `src/components/finance/EconomicPlanEditor.tsx` — use `is_wirtschaftsplan_relevant` filter
- `src/components/finance/ChartOfAccountsTab.tsx` — add WP-relevant checkbox
- `src/components/finance/BuildingDistributionKeysTab.tsx` — add WP-relevant checkbox
- `src/integrations/supabase/types.ts` — add new column type

