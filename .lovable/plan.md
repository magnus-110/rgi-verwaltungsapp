## Ziel

Im manuellen Wirtschaftsplan-Editor (Einzelplan-Ansicht) soll das Konto **1400 – Heizung/Warmwasser** (sowie alle weiteren Konten mit Verteilerschlüssel `heizk_abr` / `HeizkostenV`) den individuellen Anteil eines Eigentümers nicht aus MEA, sondern **proportional aus den Brunata-Werten des Vorjahres** hochrechnen — analog zu HV-Office.

## Beispiel (Adolf-Haff-Weg 3, 2026)

- Σ Brunata-Werte 2025 = 5.738,37 €
- Tobias Baraniak Brunata 2025 = 714,77 € → Anteil 12,4561 %
- Geplante Gesamtkosten 2026 = 7.500,00 €
- Hochgerechneter Anteil 2026 = 7.500 × (714,77 / 5.738,37) = **934,06 €** ✓

## Was geändert wird

### `src/components/finance/ManualEconomicPlanEditor.tsx`

1. **Neue Query** `wp-heating-distribution`: lädt alle `heating_distribution_values` der Vorjahres-`billing_period` der Liegenschaft (gemappt: `assignment_id → amount`). Wenn keine Vorjahresperiode existiert oder keine Brunata-Werte vorhanden sind → Fallback wie heute (Anteil 0, mit kleinem Hinweis-Tooltip).

2. **Hilfs-Maps**:
   - `heatingByAssignment`: Map `assignmentId → vorjahres-Brunata-Wert`
   - `heatingTotal`: Σ aller Werte (Nenner)

3. **`buildUnitRows` erweitern** (Zeilen 462–467): Sonderfall, wenn `key === "heizk_abr"` UND `heatingTotal > 0`:
   - `yourShareValue = heatingByAssignment[unitId] ?? 0`
   - `proportion = yourShareValue / heatingTotal`
   - Anzeige in den Spalten "Ges Anteil" / "Ihr Anteil" wechselt von „1.000,000 / 0,000" auf reale Brunata-Werte (z.B. 5.738,37 / 714,77).

4. **Wenn keine Vorjahres-Brunata-Werte existieren**: bisheriges Verhalten (Anteil 0) bleibt; ein dezenter Tooltip am Konto-Label weist darauf hin, dass Brunata-Werte fehlen.

### `src/components/finance/EconomicPlanLayout.tsx`

Keine strukturelle Änderung — die Spalten "Ges Anteil" / "Ihr Anteil" werden bereits aus `totalShare` / `yourShare` gefüllt; durch (3) bekommen sie automatisch sinnvolle Zahlen.

## Was bewusst NICHT geändert wird

- Keine DB-Migration nötig — `heating_distribution_values` und `billing_periods` existieren bereits.
- Manuelle Overrides pro Zelle bleiben weiterhin möglich (Wert in der Input-Box überschreibt die Hochrechnung).
- Brunata-Werte werden NICHT auf MEA-Anteile zurückgerechnet; reine Proportional-Verteilung wie HV-Office.
- Andere Verteilerschlüssel (MEA, qm, Personen, Einheiten, Stellplätze) bleiben unverändert.

## Edge Cases

| Fall | Verhalten |
|---|---|
| Keine Vorjahres-Periode | Anteil 0 + Tooltip „Brunata-Werte fehlen" |
| Vorjahres-Periode da, aber 0 Brunata-Einträge | Anteil 0 + Tooltip |
| Eigentümer hat keinen Brunata-Eintrag (z.B. neu) | sein Anteil = 0, andere bleiben korrekt (Σ stimmt) |
| Eigentümerwechsel im Lauf des Jahres | aktueller Eigentümer erbt den Brunata-Anteil seiner Einheit (assignment_id ist stabil) |
