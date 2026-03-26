

# Plan: Wirtschaftsplan mit Gesamt- und Einzelwirtschaftsplan + Guided Workflow

## Gesetzliche Grundlage (§28 WEG)

Ein Wirtschaftsplan nach deutschem WEG-Recht besteht aus:
1. **Gesamtwirtschaftsplan** — Alle voraussichtlichen Einnahmen und Ausgaben der Gemeinschaft, aufgeteilt nach Kostenarten
2. **Einzelwirtschaftspläne** — Pro Eigentümer: deren Anteil an den Gesamtkosten + monatliches Hausgeld (Vorschüsse gem. §28 Abs. 1 WEG)

Pflichtinhalte:
- Voraussichtliche Bewirtschaftungskosten (Instandhaltung, Verwaltung, Versicherung, etc.)
- Zuführung zur Erhaltungsrücklage (§19 Abs. 2 Nr. 4 WEG)
- Verteilungsschlüssel je Kostenposition
- Hausgeld-Vorschüsse pro Eigentümer (monatlich)
- Vergleich zum Vorjahr

## Neues Konzept: Geführter 5-Schritt-Workflow

Analog zur Abrechnung wird der Wirtschaftsplan als Schritt-für-Schritt-Prozess aufgebaut:

```text
┌─────────────────────────────────────────────────┐
│ 1. Liegenschaft & Basisjahr wählen              │
│ 2. Gesamtwirtschaftsplan (Kostenplanung)        │
│ 3. Erhaltungsrücklage festlegen                 │
│ 4. Einzelwirtschaftspläne (Hausgeld pro Eigent.)│
│ 5. Genehmigung & PDF-Export                     │
└─────────────────────────────────────────────────┘
```

### Schritt 1: Liegenschaft & Basisjahr
- BillingPeriodSelector wie bisher
- Anzeige: Planjahr = Basisjahr + 1

### Schritt 2: Gesamtwirtschaftsplan
- Bestehende Kostenplanung (Tabelle mit Konten, Ist-Vorjahr, Plan-Betrag, Δ%)
- KI-Vorschlag-Button bleibt (ohne "KI" Label prominent)
- Gruppierung nach Kostenkategorien (Betriebskosten, Verwaltung, Instandhaltung)
- Summenzeile mit Gesamtkosten

### Schritt 3: Erhaltungsrücklage
- Separate Eingabe der geplanten Rücklagenzuführung
- Anzeige des aktuellen Rücklagenstands
- Empfehlung basierend auf Gebäudealter/Zustand (optional)

### Schritt 4: Einzelwirtschaftspläne
- Tabelle pro Eigentümer mit:
  - Einheit, Name, MEA-Anteil
  - Anteil Bewirtschaftungskosten
  - Anteil Rücklage
  - Gesamt-Jahresbetrag
  - **Monatliches Hausgeld (= Jahresbetrag / 12)**
  - Vergleich zum aktuellen Hausgeld
- Hinweis auf Verteilungsschlüssel-Abweichungen

### Schritt 5: Genehmigung & Export
- Status-Badges (Entwurf → Genehmigt)
- PDF-Export: Gesamtwirtschaftsplan als Dokument
- PDF-Export: Einzelwirtschaftspläne (einzeln oder alle)
- Genehmigen-Button

## Technische Umsetzung

### 1. `src/components/finance/EconomicPlanEditor.tsx` — Komplett umbauen
- Collapsible-Step-Workflow (Pattern aus BillingTab übernehmen)
- Schritt 1 entfällt (wird von Finance.tsx gehandhabt)
- Schritte 2-5 als aufklappbare Cards mit Nummerierung
- Bestehende Logik (Kontenliste, Hausgeld-Vergleich) wird auf die Schritte verteilt
- Neuer Abschnitt für Erhaltungsrücklage (nutzt `total_reserve` Feld in `economic_plans`)
- Einzelwirtschaftsplan-Tabelle erweitert um Rücklage-Anteil und Jahresgesamt

### 2. Keine DB-Änderungen nötig
- `economic_plans.total_reserve` existiert bereits
- `economic_plan_items` hat `distribution_key`
- `contact_building_shares` und `contact_building_costs` liefern Eigentümerdaten

### 3. `src/pages/Finance.tsx` — Keine Änderung
Die Wirtschaftsplan-Tab-Logik (Liegenschaft + Periode wählen) bleibt wie sie ist.

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/finance/EconomicPlanEditor.tsx` | Komplett umgebaut: 4-Schritt-Wizard mit Collapsible-Cards, Rücklage-Sektion, erweiterte Einzelwirtschaftspläne, Genehmigungs-Schritt |

