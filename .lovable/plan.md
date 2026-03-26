

# Plan: Finanzseite mit 3 Unterseiten-Navigation

## Konzept

Die Finanzseite bekommt oben eine **Sub-Navigation mit 3 Bereichen** (wie Tabs/Segment-Control), die zwischen den drei Unterseiten wechselt:

```text
[ Buchen ]  [ Abrechnung ]  [ Wirtschaftsplan ]
```

- **Buchen** = aktuelle Finance-Seite (Rechnungen, Vorlagen, Kontoauszüge, Buchungen)
- **Abrechnung** = Jahresabrechnung (BillingTab)
- **Wirtschaftsplan** = Wirtschaftsplan-Editor (ohne "KI-gestützt")

Die Action-Cards und separaten Seiten (`/finanzen/abrechnung`, `/finanzen/wirtschaftsplan`) werden entfernt. Stattdessen wird alles auf einer Seite mit Top-Navigation zusammengeführt.

## Umsetzung

### 1. `src/pages/Finance.tsx`
- Action-Cards entfernen
- Top-Level `Tabs` mit 3 Werten: `buchen`, `abrechnung`, `wirtschaftsplan`
- Tab "Buchen": Die 4 bestehenden Sub-Tabs (Rechnungen, Vorlagen, Kontoauszüge, Buchungen)
- Tab "Abrechnung": `BillingTab`-Komponente direkt einbetten
- Tab "Wirtschaftsplan": `BillingPeriodSelector` + `EconomicPlanEditor` (Logik aus `EconomicPlan.tsx`)

### 2. `src/pages/EconomicPlan.tsx`
- Beschreibung ändern: "KI-gestützt" entfernen → "Wirtschaftsplan basierend auf der Vorjahresabrechnung erstellen"

### 3. `src/pages/Billing.tsx` & `src/pages/EconomicPlan.tsx`
- Bleiben als eigenständige Routen bestehen (falls jemand direkt navigiert), aber der Hauptzugang ist nun über die Finance-Seite

### 4. `src/components/finance/EconomicPlanEditor.tsx`
- "KI-Vorschlag" Button-Text bleibt (das ist intern), aber keine "KI-gestützt"-Labels in Überschriften

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/pages/Finance.tsx` | Action-Cards weg, 3 Top-Tabs mit eingebetteten Inhalten |
| `src/pages/EconomicPlan.tsx` | "KI-gestützt" aus Beschreibung entfernen |

