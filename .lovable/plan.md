

## Unterjährige Hausgeld-Änderungen unterstützen

### Problem
Die `contact_building_costs` Tabelle hat bereits `valid_from` und `valid_to` Felder, aber:
1. Die **UI** zeigt keine Datums-Felder zum Bearbeiten an
2. Die **Abrechnung** (BillingSettlement) ignoriert die Gültigkeitszeiträume — sie summiert einfach alle Kosten × 12 Monate

### Lösung

**Ansatz**: Für eine Hausgeld-Änderung legt man zwei Kosten-Einträge an:
- Hausgeld 400 €, gültig 01.01.–30.06.
- Hausgeld 420 €, gültig 01.07.–31.12.

Die Abrechnung berechnet dann automatisch den zeitanteiligen Jahresbetrag.

### Änderungen

**Datei 1: `src/components/contacts/BuildingContactsList.tsx`** — Kosten-UI erweitern
- In der Kosten-Zeile (Zeile 783–866) zwei kompakte Datums-Inputs für `valid_from` und `valid_to` hinzufügen
- Format: `type="date"`, optional, mit Placeholder "unbegrenzt"
- `updateCost()` wird bereits für beliebige Felder verwendet, daher kein neuer Handler nötig

**Datei 2: `src/components/finance/BillingSettlement.tsx`** — Zeitanteilige Berechnung
- Die Hausgeld-/Rücklage-Berechnung (Zeile 418–440) anpassen:
  - Statt `amount × 12`, den Überlappungszeitraum zwischen `[valid_from, valid_to]` und der Abrechnungsperiode `[period_from, period_to]` berechnen
  - Formel: `amount × überlappende_monate` (bei monatlichem Intervall)
  - Kosten ohne `valid_from`/`valid_to` gelten wie bisher für die gesamte Periode

**Datei 3: `src/components/finance/EconomicPlanEditor.tsx`** — Gleiche Logik
- Die Hausgeld-Summierung (Zeile 200–204) ebenfalls zeitanteilig machen, damit der Wirtschaftsplan konsistent ist

### Berechnungslogik (Hilfsfunktion)

```text
getOverlapMonths(costFrom, costTo, periodFrom, periodTo):
  start = max(costFrom || periodFrom, periodFrom)
  end   = min(costTo   || periodTo,   periodTo)
  if start > end: return 0
  return differenceInMonths(end, start) (gerundet auf Monate)

annualAmount = amount × overlapMonths (bei monatlich)
             = amount × (overlapMonths / 3) (bei quartal)
             = amount × (overlapMonths / 12) (bei jährlich)
```

### Kein Schema-Change nötig
Die Felder `valid_from` und `valid_to` existieren bereits in der Tabelle `contact_building_costs`.

