

# Vollständiger Umsetzungsplan v2: PDF-Abrechnung HV-Office-konform

## Bewertung des Claude-Einwands
**Ja, Claude hat recht.** Konto 1920 hat aktuell `settlement_section = 'operating_non_distributable'`. Eine separate `getSectionTotal("reserve_withdrawal")`-Abfrage würde 0 zurückgeben — die Neutralisierung griffe ins Leere und Bug 4 bliebe bestehen.

Die sauberste Lösung ist ein **explizites Flag** `is_reserve_funded` auf `chart_of_accounts`. Damit erkennt der Code rücklagenfinanzierte Aufwandskonten zuverlässig, ohne Kontonummern hart zu verdrahten — skaliert auf beliebige zukünftige Konten (z. B. 1921 „Sanierung aus Erhaltungsrücklage").

---

## Kontext & Problem
UI-Vorschau in `BillingSettlement.tsx` rechnet korrekt (Wollmann +422,57 € / Gottfried +541,39 € / Willems +649,95 €). Die PDF-Edge-Function `generate-billing-pdf` weicht in fünf Punkten ab. Ziel: PDF-Output 1:1 identisch zur UI.

---

## Bug-Analyse

| # | Bug | Code-Stelle | Auswirkung |
|---|---|---|---|
| 1 | SELECT lädt `counter_account_id` nicht; Aggregation filtert nur `account_id` | Z. 63, 97–99 | Alle Aufwandskonten = 0 € |
| 2 | Hausgeld aus `contact_building_costs` × 12 statt aus Buchungen | Z. 227–239 | Falsche Spitze bei Anpassungen |
| 3 | `heating_prepayment` (1470–1473) in `totalExpenses` | Z. 152 | Gesamtkosten zu hoch |
| 4 | Konto 1920 doppelt belastet (Aufwand nicht neutralisiert) | Z. 152 | Eigentümer zahlt Reparatur doppelt |
| 5 | Filter `fiscal_year` statt Datumsbereich | Z. 63 | Falsche Buchungsmenge |

---

## Umsetzung

### Schritt 0 — Datenbank-Migration (NEU, vor allem anderen)
```sql
ALTER TABLE chart_of_accounts 
  ADD COLUMN is_reserve_funded boolean NOT NULL DEFAULT false;

UPDATE chart_of_accounts 
  SET is_reserve_funded = true 
  WHERE account_number = '1920';

COMMENT ON COLUMN chart_of_accounts.is_reserve_funded IS 
  'Aufwand wird aus der Erhaltungsrücklage finanziert. In der Einzelabrechnung als Aufwand UND als Negativposten im IHR-Block (Neutralisation).';
```

UI-Folgearbeit (gleiche Runde): Flag im `ChartOfAccountsTab` als Toggle im Account-Settings-Popover sichtbar machen, damit künftige Konten (1921 Sanierungsrücklage etc.) ohne Code-Eingriff markiert werden können.

### Schritt 1 — Shared Aggregation-Library
**Neu**: `supabase/functions/_shared/booking-aggregation.ts` — 1:1-Port von `src/components/finance/lib/bookingAggregation.ts` nach Deno:
- `sumForAccount`, `amountOnAccount`, `bookingsTouchingAccount`, `countForAccount`
- `getEffectiveOpeningBalance` / `getEffectiveClosingBalance`

### Schritt 2 — `generate-billing-pdf/index.ts` korrigieren

**Bug 1 — Bank-zentrische Aggregation**
```ts
.select("id, account_id, counter_account_id, amount, booking_date, description, booking_category, is_35a_relevant, status")
const total = Math.abs(sumForAccount(acc.id, bookings));
```

**Bug 5 — Datumsbereich**
```ts
.gte("booking_date", period.period_from)
.lte("booking_date", period.period_to)
.neq("status", "cancelled")
```

**Bug 3 — Vorauszahlungskonten ausschließen**
```ts
const totalExpenses = sections
  .filter(s => s.id !== "income" && s.id !== "heating_prepayment")
  .reduce((s, sec) => s + sec.total, 0);
```

**Bug 4 — IHR-Doppelausweis via Flag (statt Kontonummer)**
```ts
// Rücklagenfinanzierte Aufwandskonten (z. B. 1920) anhand Flag erkennen
const reserveFundedAccounts = accounts.filter(a => a.is_reserve_funded);
const totalReserveWithdrawal = reserveFundedAccounts
  .reduce((s, a) => s + Math.abs(sumForAccount(a.id, bookings)), 0);

// IHR-Plan aus economic_plans (Beschluss), nicht aus Buchungen 1720
const totalReserve = economicPlan?.total_reserve ?? 0;

// Pro Eigentümer: Aufwand 1920 erscheint regulär in operating_non_distributable
// UND als Negativ-Posten im IHR-Block → neutralisiert sich
const reserveNet = totalReserve - totalReserveWithdrawal;
```

Frontend-Synchronisation: `BillingSettlement.tsx` ebenfalls auf Flag-basierte Erkennung umstellen, damit UI und PDF dieselbe Quelle nutzen.

**Bug 2 — Hausgeld aus Personenkonten-Buchungen**
```ts
const personalAccountPattern = /^0\d{3}$/;
const personalAccounts = accounts.filter(
  a => personalAccountPattern.test(a.account_number) && a.account_number !== '0000'
);

const padUnit = (n: string | number) => String(n).padStart(4, '0');
const ownerAccount = personalAccounts.find(
  a => a.account_number === padUnit(assignment.unit_number)
);

const annualHausgeld = ownerAccount
  ? Math.abs(sumForAccount(ownerAccount.id, bookings))
  : calcAnnual(["hausgeld", "nebenkosten"]); // Fallback nur ohne Personenkonto
```
Funktioniert für 1–999 Einheiten.

### Schritt 3 — Verifikation
Birkenweg 6 / 2025 muss exakt liefern:
- Wollmann: **+422,57 €**
- Gottfried: **+541,39 €**
- Willems: **+649,95 €**

Vorab Read-Query auf Personenkonto-Buchungen 0001–0003. Falls leer: Fallback `calcAnnual` greift.

### Schritt 4 — Memory
Neuer Eintrag `mem://features/finance/pdf-aggregation-shared`:
> PDF-Edge-Function nutzt dieselbe `sumForAccount`-Logik wie Frontend (shared lib `_shared/booking-aggregation.ts`). Hausgeld immer aus Personenkonten (Pattern `^0\d{3}$`, ≠ `0000`), nie aus `contact_building_costs` × 12. Filter immer `booking_date` zwischen `period_from`/`period_to`. Rücklagenfinanzierte Aufwandskonten via Flag `chart_of_accounts.is_reserve_funded` erkennen — wird im IHR-Block als Negativposten neutralisiert.

---

## Betroffene Dateien

**Migration**
- Neue Spalte `chart_of_accounts.is_reserve_funded` + Seed für 1920

**Neu**
- `supabase/functions/_shared/booking-aggregation.ts`

**Bearbeitet**
- `supabase/functions/generate-billing-pdf/index.ts` (alle 5 Bugs)
- `src/components/finance/BillingSettlement.tsx` (Flag-basierte 1920-Erkennung)
- `src/components/finance/ChartOfAccountsTab.tsx` + `AccountSettingsPopover.tsx` (Flag-Toggle in UI)

**Memory**
- `mem://features/finance/pdf-aggregation-shared` + Index-Update

---

## Prioritäten

| Bug | Auswirkung | Priorität |
|---|---|---|
| 0 — DB-Flag fehlt | Bug 4 nicht behebbar ohne Hardcoding | 🔴 Voraussetzung |
| 1 — counter_account_id | Alle Kosten = 0 € | 🔴 kritisch |
| 2 — Hausgeld statisch | Falsche Spitze | 🔴 kritisch |
| 3 — heating_prepayment | Zu hohe Ausgaben | 🟠 hoch |
| 4 — 1920 doppelt | Eigentümer doppelt belastet | 🟠 hoch |
| 5 — fiscal_year | Falsche Buchungsmenge | 🟡 mittel |

Nach Approval: Migration → Shared Lib → Edge Function + Frontend-Sync → UI-Toggle → Verifikation Birkenweg 6.

