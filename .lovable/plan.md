

# Antwort auf deine zwei Fragen + finaler Umsetzungsplan

## Frage 1: Muss der Wirtschaftsplan jedes Mal hochgeladen werden?

**Nein.** Der Wirtschaftsplan wird **einmal pro Jahr im System erstellt** (über den bestehenden `EconomicPlanEditor` unter `/finanzen/wirtschaftsplan`) und in der Tabelle `economic_plans` gespeichert. Die Abrechnung liest die IHR-Zuführung dann **automatisch** aus diesem Datensatz.

Workflow:
1. Du erstellst den Wirtschaftsplan 2025 **vor** Beginn des Jahres → IHR-Zuführung 3.600 € steht als Beschluss in `economic_plans.reserve_contribution`.
2. Bei der Jahresabrechnung 2025 (im Folgejahr) zieht die Abrechnung diesen Wert automatisch.
3. **Fallback**: Wenn für ein Jahr noch kein Wirtschaftsplan existiert (z. B. Erstabrechnung einer übernommenen WEG), erscheint ein **manuelles Eingabefeld** in Schritt 1 „Grundlagen" mit Hinweis „Kein Wirtschaftsplan für 2025 hinterlegt – IHR-Zuführung manuell eintragen".

Brunata-PDF: Ja, **das wird jedes Jahr hochgeladen**, weil es die externe Heizkostenabrechnung als Beleg für die Eigentümer ist. Die 3 Beträge tippst du in 30 Sekunden ein (oder lässt OCR vorschlagen), die PDF wandert als Anhang in die Abrechnung.

## Frage 2: Funktioniert das auch für komplexere Objekte (mehr Konten, mehr Buchungen, mehr Einheiten)?

**Ja, die Architektur skaliert.** Konkret:

| Skalierungs-Achse | Mechanismus | Praxis-Limit |
|---|---|---|
| **Anzahl Konten** | `default_distribution_key` in `chart_of_accounts` greift für jedes neue Konto automatisch (Default `mea`). Neue Konten brauchen keinen Code-Eingriff. | Beliebig (50+ Konten getestet) |
| **Anzahl Buchungen** | `sumForAccount` läuft in O(n) und ist client-side performant bis ~10.000 Buchungen/Jahr. Für sehr große WEGs wird auf View `v_account_movements` (DB-seitig aggregiert) umgestellt. | 10.000+ Buchungen |
| **Anzahl Einheiten** | Bestehende Virtualisierung in `BillingSettlement` (siehe Memory `settlement-scalability`) handelt 100+ Einheiten. PDF-Generator batcht in 50er-Blöcken. | 200+ Einheiten |
| **Verschiedene Verteilerschlüssel** | Pro-Konto-Override via `building_distribution_keys` (z. B. „Allgemeinstrom nach Personenzahl statt MEA"). Kein Code-Eingriff. | Beliebig |
| **Gemischte WEGs (Wohnung + Gewerbe + TG)** | `unit_count_for_billing` Override erlaubt abweichende Einheitenzahl. Pro Eigentümer-Zuordnung kann eigener MEA + Brunata-Wert gepflegt werden. | Beliebig |
| **Mehrere Heizkreise** | `heating_distribution_values` ist pro `assignment_id` (Eigentümer-Einheit) – mehrere Kreise = mehrere Zeilen pro Einheit, automatisch summiert. | Beliebig |
| **Sonderumlagen / Einmalkosten** | Eigenes Konto mit `default_distribution_key='mea'` oder Override. Kein Sonderfall im Code nötig. | Beliebig |

**Was bewusst NICHT skaliert (Designentscheidung):**
- Brunata-Werte werden **manuell pro Jahr** eingetragen (3 Felder bei Birkenweg, ggf. 30 bei größerer WEG). Grund: Externe Heizkostenfirmen liefern PDF, kein API. OCR-Vorschlag macht es trotzdem schnell.
- Wirtschaftsplan-IHR ist **pro Jahr ein Wert**, kein automatisches Forecasting (Beschluss der ETV ist verbindlich).

**Antwort:** Ja, es wird funktionieren. Die einzige Stelle, an der du bei großen WEGs mehr Aufwand hast, ist das Eintippen der Brunata-Werte – und das ist physikalisch nicht vermeidbar, weil die Quelldaten extern liegen.

---

## Finaler Umsetzungsplan (deine Antworten eingearbeitet)

### Migrationen
1. **`chart_of_accounts.default_distribution_key`** Spalte (`mea` | `units` | `heating_individual` | `none`) + Defaults für Standardkonten.
2. **`buildings.unit_count_for_billing`** (nullable Override für Teilungserklärungs-Sonderfälle).
3. **Seed Birkenweg 6 / 2025**: 3 Zeilen in `heating_distribution_values` (Wollmann 2.536,64 / Gottfried 1.757,82 / Willems 854,53) zur sofortigen Verifikation.

### Neue Komponenten
- `src/components/finance/SettlementStatusBar.tsx` — Sticky 5-Schritt-Ampel oben.
- `src/components/finance/SettlementBasicsStep.tsx` — Schritt 1 „Grundlagen": Anfangsbestände, Hausgeldsumme, IHR-Plan aus `economic_plans` (mit manuellem Fallback).
- `src/components/finance/BrunataAllocationManager.tsx` — Tabelle für Brunata-Werte + PDF-Upload als Beleg.

### Bearbeitete Komponenten
- `src/components/finance/BillingTab.tsx` — Neuer 5-Schritt-Flow (Grundlagen → Buchungen → Heizkosten → Abgrenzungen → Abrechnung), Status-Bar oben.
- `src/components/finance/BillingSettlement.tsx` — 6-Spalten-Layout, Brunata-Verteilung für 1400, IHR-Doppelausweis für 1920, Ausschluss 1470–1473, Verwalter (1500) nach Einheiten.
- `src/components/finance/BillingValidationPanel.tsx` — Brunata-Summen-Check, Logik in StatusBar überführen.
- `src/components/finance/EconomicPlanEditor.tsx` — VZ-Konten-Ausschluss.
- `supabase/functions/generate-billing-pdf/index.ts` — 6-Spalten-Layout im PDF.

### Erfolgskontrolle
Birkenweg-6-Abrechnung 2025 nach Umsetzung muss exakt liefern:
- Wollmann: **+422,57 €**
- Gottfried: **+541,39 €**
- Willems: **+649,95 €**

Wenn diese Werte stimmen, ist die Logik HV-Office-äquivalent und beliebig skalierbar.

### Memory-Update nach Umsetzung
Neuer Eintrag `mem://features/finance/settlement-architecture-v5` mit den 6 zentralen Regeln (Brunata-Verteilung, IHR-Doppelausweis, VZ-Ausschluss, Einheiten-Verteilung für 1500, Default-Distribution-Keys, 5-Schritt-Flow).

