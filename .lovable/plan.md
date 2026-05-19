## Ziel
Wirtschaftsplan ist nur noch über den Untertab "Wirtschaftsplan" in **Abrechnung erzeugen** erreichbar. Keine Modus-Auswahl mehr — beim Öffnen erscheint direkt die Kontentabelle (manueller Editor) mit Jahresauswahl und Vorschau für Gesamt- und Einzelpläne.

## Änderungen

### 1. `src/pages/Finance.tsx`
- TabsTrigger `planung` entfernen
- TabsContent `planung` (Zeilen ~255–325) komplett löschen
- Zugehörige Imports/Helpers (`EconomicPlanSection`, `AssetReportSection`, `Paragraph35aSection`, `SECTIONS`, `expandedSections`, `toggleSection`, ggf. ungenutzte Icons) aufräumen
- Hinweis: Vermögensbericht und §35a sind weiterhin über die Tabs in `BillingSettlement` erreichbar — kein Funktionsverlust

### 2. `src/components/finance/BillingSettlement.tsx`
- TabsContent `wirtschaftsplan` (Zeilen 1749–1751): statt `<EconomicPlanSection>` direkt `<ManualEconomicPlanEditor buildingId={buildingId} fiscalYear={<gewählter Plan-Jahr>} />` rendern
- Davor eine kleine Jahresauswahl (Number-Input oder Select mit existierenden Jahren ±2) — Default = `fiscalYear + 1` (das Folgejahr nach der aktuellen Periode)

### 3. `src/components/finance/ManualEconomicPlanEditor.tsx`
Anforderungen aus dem Briefing umsetzen — Datei ist bereits 825 Zeilen und enthält den Großteil der Logik. Konkret prüfen / sicherstellen:

- **Tabelle pro Konto** mit Spalten: Konto-Nr, Bezeichnung, Umlageschlüssel, Vorjahr (Ist), Plan-Saldo, Änderung in %, WP-relevant-Toggle
  - Vorjahr = Summe aus `bookings` für `fiscal_year = fiscalYear - 1` (bank-zentrisch via `sumForAccount`, analog zu `generate-economic-plan/index.ts`)
  - Änderung % = `(planned − prev) / prev * 100`, inline berechnet
  - Jede Zelle (Plan-Saldo, Umlageschlüssel-Select, WP-relevant-Switch) einzeln editier- und auto-save-bar
- **Filter** „alle Konten / nur befüllte" (Toggle existiert bereits via `showAllAccounts`) — beibehalten
- **Jahresauswahl** kommt aus dem Parent (BillingSettlement-Header), Komponente bleibt kontrolliert via Prop `fiscalYear`
- **Einzelplan-Vorschau** (Tab „Einzelpläne"): bereits vorhanden über `EconomicPlanLayout` — verifizieren, dass:
  - Verteilung pro Einheit über `useBuildingShareTypes` + `building_account_overrides` korrekt greift (MEA, Einheiten, qm, Stellplätze, Personen, Heizk-Abr)
  - **Hausgeld pro Einheit = Σ(Planposition × Anteil nach jeweiligem Umlageschlüssel)** — pro Konto eigenen Schlüssel anwenden, NICHT global mitteln
  - EHR-Zuführung (`isReserveContributionAccount`) sauber als separate Spalte/Zeile, Vorschuss = Rest
- **Aktivieren-Button** bleibt (`status='active'`)

### 4. `src/components/finance/EconomicPlanSection.tsx` — LÖSCHEN
Wird nicht mehr referenziert nach Schritt 1+2.

### 5. `src/components/finance/EconomicPlanEditor.tsx` — LÖSCHEN
„Aus Vorjahr generieren"-Editor entfällt komplett. Edge Function `generate-economic-plan` kann bestehen bleiben (kein Aufrufer mehr, blockiert aber nichts) — oder ebenfalls löschen falls gewünscht.

### 6. Optionale Aufräumarbeiten
- `supabase/functions/generate-economic-plan` löschen (wird nach Schritt 5 nicht mehr genutzt)

## Technische Details

**Umlageschlüssel-Quelle pro Konto (Priorität):**
1. `economic_plan_items.distribution_key` (falls im Plan überschrieben)
2. `building_account_overrides.distribution_key`
3. `chart_of_accounts.default_distribution_key`
4. Fallback `mea`

**Vorjahres-Saldo (bank-zentrische Aggregation):**
```ts
function sumForAccount(bookings, accountId) {
  return bookings.reduce((s, b) => {
    if (b.booking_category === "heating_repost") return s;
    if (b.account_id === accountId) return s + Number(b.amount);
    if (b.counter_account_id === accountId) return s - Number(b.amount);
    return s;
  }, 0);
}
```

**Hausgeld-Berechnung (Einzelplan):**
```
hausgeld(unit) = Σ_account ( planned_amount[account] × share(unit, distribution_key[account]) )
monatlich = hausgeld / 12
```
EHR-Zuführung wird in separater Zeile ausgewiesen, Vorschuss = Hausgeld − EHR-Zuführung.

## Nicht geändert
- Datenmodell (`economic_plans`, `economic_plan_items`) bleibt
- Vermögensbericht- und §35a-Sections bleiben (nur via BillingSettlement-Tabs erreichbar)
- `BillingTemplatesDialog`, DOCX/PDF-Exporte bleiben
