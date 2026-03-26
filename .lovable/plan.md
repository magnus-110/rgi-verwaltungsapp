

# Plan: Live-Vorschau für Wirtschaftsplan (Gesamt & Einzel)

## Konzept

Zwei **Floating Buttons** rechts unten im Wirtschaftsplan-Editor, die eine modale Live-Vorschau öffnen. Die Vorschau rendert den Wirtschaftsplan als HTML-Dokument im iframe — exakt so, wie er als PDF exportiert werden würde. Keine Edge Function nötig, da die Daten bereits client-seitig vorhanden sind.

```text
┌─────────────────────────────────────────────┐
│  Wirtschaftsplan Editor                     │
│  ...                                        │
│                                             │
│                          ┌──────────────┐   │
│                          │ 📄 Gesamt    │   │
│                          │ 📄 Einzel    │   │
│                          └──────────────┘   │
└─────────────────────────────────────────────┘
         ↓ Klick
┌─────────────────────────────────────────────┐
│  Dialog: Live-Vorschau Gesamtwirtschaftsplan│
│  ┌─────────────────────────────────────┐    │
│  │  (iframe mit HTML-Dokument)         │    │
│  │  sieht aus wie gedrucktes PDF       │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## HTML-Templates (client-seitig)

### Gesamtwirtschaftsplan-Vorschau
- Überschrift: "Gesamtwirtschaftsplan {planYear}"
- Liegenschaftsname, Adresse, Verwalter
- Tabelle: Konto | Bezeichnung | Ist Vorjahr | Plan | Δ%
- Gruppiert nach Kostenkategorien
- Summe Bewirtschaftungskosten
- Erhaltungsrücklage (Zuführung)
- Gesamtbetrag
- Footer mit Datum

### Einzelwirtschaftsplan-Vorschau
- Dropdown zur Eigentümer-Auswahl oder "Alle"
- Pro Eigentümer: Name, Einheit, MEA-Anteil
- Tabelle: Bewirtschaftungskosten-Anteil, Rücklage-Anteil, Gesamt/Jahr, **Hausgeld/Monat**
- Vergleich zum aktuellen Hausgeld

## Umsetzung

### 1. Neue Komponente: `src/components/finance/EconomicPlanPreview.tsx`
- Nimmt alle berechneten Daten als Props (categoryGroups, ownerPlans, totals, building info, etc.)
- Generiert HTML-String im gleichen Style wie `generate-billing-pdf`
- Rendert in einem `<iframe srcDoc={html} />` innerhalb eines `Dialog`
- Zwei Modi: `gesamt` und `einzel` (mit Owner-Selector)

### 2. `src/components/finance/EconomicPlanEditor.tsx` — Floating Buttons hinzufügen
- Zwei FAB-artige Buttons unten rechts (`fixed` oder `sticky`)
- "Gesamtplan Vorschau" und "Einzelplan Vorschau"
- Nur sichtbar wenn Daten vorhanden (Plan existiert oder Konten geladen)
- Übergeben die berechneten Daten an die Preview-Komponente
- Building-Daten zusätzlich fetchen (Name, Adresse, Verwalter)

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/finance/EconomicPlanPreview.tsx` | **Neu**: Preview-Dialog mit iframe + HTML-Templates |
| `src/components/finance/EconomicPlanEditor.tsx` | Building-Query ergänzen, Floating Buttons + Preview-State |

