
# Plan: WEG-Abrechnungsmodul

## Status: Phase 2 implementiert ✅

### Erledigte Schritte (Phase 1)
1. ✅ **DB-Migrationen**: billing_periods, fuel_inventory, account_balances, billing_validations + neue Spalten in chart_of_accounts und bookings
2. ✅ **Kontenrahmen erweitert**: 3 neue Flags (is_billing_relevant, is_heating_relevant, carry_forward_balance) im UI
3. ✅ **BillingTab mit Stepper**: Flexibler Workflow mit 8 Schritten, BillingPeriodSelector
4. ✅ **Saldenübernahme**: BalanceCarryForward mit Vorjahres-Übernahme
5. ✅ **Brennstoff-Inventar**: FuelInventorySection mit CRUD und Plausibilitätsprüfung
6. ✅ **Heizkosten-Kontenübersicht**: HeatingAccountsSection mit Vorjahresvergleich
7. ✅ **Kontrollcenter**: BillingValidationPanel mit Live-Prüfungen

### Erledigte Schritte (Phase 2)
8. ✅ **Rechtskonformität**: Vermögensbericht (§28 WEG), §35a EStG-Bescheinigung, zeitanteilige Berechnung
9. ✅ **Rücklage als eigene Position**: Betriebskosten + Rücklage getrennt dargestellt
10. ✅ **PDF-Generierung**: generate-billing-pdf Edge Function (Gesamt + Einzelabrechnungen)
11. ✅ **Report Templates**: ReportTemplateSettings mit Upload, Vorlagen-Verwaltung
12. ✅ **Wirtschaftsplan-KI**: generate-economic-plan Edge Function mit Mistral Large
13. ✅ **EconomicPlanEditor**: KI-gestützter Wirtschaftsplan mit Hausgeld-Vergleich

### DB-Tabellen (Phase 2)
- `economic_plans` — Wirtschaftspläne pro Gebäude/Jahr
- `economic_plan_items` — Einzelpositionen mit KI-Vorschlägen
- `report_templates` — PDF-Vorlagen mit Hintergrund-Upload

## Betroffene Dateien
- `src/components/finance/BillingTab.tsx` — 8 Schritte inkl. Wirtschaftsplan & Vorlagen
- `src/components/finance/BillingSettlement.tsx` — Vermögensbericht, §35a, zeitanteilig, PDF-Buttons
- `src/components/finance/EconomicPlanEditor.tsx` — NEU
- `src/components/finance/ReportTemplateSettings.tsx` — NEU
- `supabase/functions/generate-billing-pdf/index.ts` — NEU
- `supabase/functions/generate-economic-plan/index.ts` — NEU
