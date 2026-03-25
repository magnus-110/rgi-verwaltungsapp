
# Plan: WEG-Abrechnungsmodul

## Status: Phase 1 implementiert ✅

### Erledigte Schritte (Phase 1)
1. ✅ **DB-Migrationen**: billing_periods, fuel_inventory, account_balances, billing_validations + neue Spalten in chart_of_accounts und bookings
2. ✅ **Kontenrahmen erweitert**: 3 neue Flags (is_billing_relevant, is_heating_relevant, carry_forward_balance) im UI
3. ✅ **BillingTab mit Stepper**: Flexibler Workflow mit 6 Schritten, BillingPeriodSelector
4. ✅ **Saldenübernahme**: BalanceCarryForward mit Vorjahres-Übernahme
5. ✅ **Brennstoff-Inventar**: FuelInventorySection mit CRUD und Plausibilitätsprüfung
6. ✅ **Heizkosten-Kontenübersicht**: HeatingAccountsSection mit Vorjahresvergleich
7. ✅ **Kontrollcenter**: BillingValidationPanel mit Live-Prüfungen

### Ausstehende Schritte (Phase 2)
- Heizkosten-Export CSV für Ablesefirma
- Heizkosten-Umbuchungen (interne Umbuchungen generieren)
- Abgrenzungsbuchungen
- KI-Analyse Edge Function (Mistral Large)
- Gesamtabrechnungsvorschau + PDF-Export

## Betroffene Dateien
- `src/pages/Finance.tsx` — 6. Tab "Abrechnung"
- `src/components/finance/BillingTab.tsx` — Haupt-Tab
- `src/components/finance/BillingPeriodSelector.tsx`
- `src/components/finance/BalanceCarryForward.tsx`
- `src/components/finance/FuelInventorySection.tsx`
- `src/components/finance/HeatingAccountsSection.tsx`
- `src/components/finance/BillingValidationPanel.tsx`
- `src/components/finance/ChartOfAccountsTab.tsx` — erweitert
