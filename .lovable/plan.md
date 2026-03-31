
## Restructure Abrechnung & Wirtschaftsplan Tabs

### Current State
- **Abrechnung** has 6 steps: Saldenübernahme, Heizkosten, Export, Umbuchungen, Abgrenzungen, Gesamtabrechnung
- **Wirtschaftsplan** tab only contains the EconomicPlanEditor
- `chart_of_accounts` has flags: `is_billing_relevant`, `is_heating_relevant`, `is_35a_relevant`, `carry_forward_balance`, `is_wirtschaftsplan_relevant`
- NEW: `is_distributable`, `settlement_section`, `settlement_35a_type` columns added
- NEW: `heating_distribution_values` table for external heating provider values

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
| 4 | Gesamtabrechnung | BillingSettlement — creates total + individual settlements with professional 3-column layout. |

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
- Step 1: Show WP-relevant accounts with editable planned amounts + reserve allocation. AI suggestion button (existing).
- Step 2: Preview & export (existing EconomicPlanPreview).
- Mostly reuse existing `EconomicPlanEditor` with filter changed from `is_billing_relevant` to `is_wirtschaftsplan_relevant`.

**Section 2: Vermögensbericht**
- Pulls data from bank balances, accrual accounts, fuel inventory
- Summary card with totals and export

**Section 3: §35a Bescheinigung**
- Query accounts with `settlement_35a_type` = 'dienste' or 'handwerker'
- Sum bookings per owner (via distribution keys)
- Export as PDF per owner

---

#### C. Database Changes — COMPLETED ✅

```sql
ALTER TABLE chart_of_accounts 
  ADD COLUMN is_distributable boolean NOT NULL DEFAULT false,
  ADD COLUMN settlement_section text,
  ADD COLUMN settlement_35a_type text;

CREATE TABLE heating_distribution_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  billing_period_id uuid NOT NULL REFERENCES billing_periods(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES contact_building_assignments(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(billing_period_id, assignment_id)
);
```

---

### Completed ✅
- [x] Migration — `is_distributable`, `settlement_section`, `settlement_35a_type` on chart_of_accounts; `heating_distribution_values` table
- [x] `ChartOfAccountsTab.tsx` — settlement_section dropdown, is_distributable toggle, §35a type dropdown
- [x] `HeatingRebookingSection.tsx` — Owner-level heating distribution values with CSV import
- [x] `BillingSettlement.tsx` — Professional 3-tab layout: Gesamtabrechnung (3-column), Einzelabrechnungen (7-column with drill-down), Vermögensbericht

### Remaining
- [x] `BillingTab.tsx` — Update to new 4-step structure (already done)
- [x] `generate-billing-pdf/index.ts` — Professional PDF layout matching reference
- [x] `EconomicPlanEditor.tsx` — Use `is_wirtschaftsplan_relevant` filter (already done)
- [x] `Finance.tsx` — Rename tab, add sub-sections (already done)

### ✅ Plan vollständig abgeschlossen
