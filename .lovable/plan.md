## Ziel
Nebenkostenabrechnung im Service-Hub rechnet aktuell falsch (Heizung fehlt, alles pauschal nach MEA, Doppelzählungen) und ist nicht mobile-first im RGI-Look. Beides wird in einem Schritt korrigiert.

---

## A) Backend / Berechnung

### `supabase/functions/get-owner-billing-positions/index.ts` ersetzen
Vollständig durch die vom Nutzer gelieferte korrigierte Fassung ersetzen. Kernänderungen:
- **Heizung/Warmwasser/Wasser** kommt NICHT mehr aus Buchungen, sondern als ein Posten aus `heating_distribution_values` (Spalte `amount`) per `assignment_id + billing_period_id`. Fehlt der Wert → `{ amount: 0, source: "missing" }`.
- **Nur kalte Konten** (Kategorie `1.`) aus Buchungen ziehen. Kategorie `2.` komplett raus (kein 1400/1410/1420/1430/1401-Doppel mehr).
- **Verteilerschlüssel je Konto** aus `chart_of_accounts.default_distribution_key`:
  - `mea` / leer → MEA-Anteil
  - `einheiten` → `1 / unitCount`
  - `verbrauch_*` → `consumption_based: true` mit MEA als unverbindlichem Vorschlag, vom Nutzer zu bestätigen
- Response-Form: `{ positions, heating, mea_share, einheiten_share, unit_count, own_mea, total_mea }`.

### `src/lib/services/nebenkosten.ts`
- `AutoPosition` um `consumption_based?: boolean` erweitern.
- Neuen Typ `HeatingPosition = { label: string; amount: number; source: "messdienst" | "missing"; note: string | null }`.
- `getOwnerBillingPositions` → Rückgabe-Typ `{ positions: AutoPosition[]; heating: HeatingPosition; mea_share: number; einheiten_share: number; unit_count: number }`.

---

## B) Frontend `src/pages/weg-owner/NebenkostenTool.tsx`

### Logik
- Neuer State `heating: HeatingPosition | null` und `heatingOverride: number | "" `.
- `totals` neu: `costSum = autoSum(kalte, nicht abgewählte) + heatingValue + extraSum`, dann `result = costSum - prepaySum`.
- Snapshot beim Kauf: zusätzlich `heating: { amount, source }` + `consumption_based`-Flag je Position übergeben.

### UI (Mobile-first im RGI-Look)
Komplettes Re-Layout des Tools nach `service-hub-mobile.html`-Referenz:

- **Fonts**: Google Fonts (`Century Gothic`-Fallback `Arial` für Headings, `Work Sans` für Body) via `index.html` einbinden.
- **Tokens (lokal im Tool, ohne globalen Design-Token-Umbau)**: Primär `#ee7202`, BG `#faf8f5`, Karten weiß, Border `#e7e0d8`.
- **Layout**: einspaltig, gestapelte Cards, Touch-Targets ≥ 44px. Bestehende `lg:grid-cols-3` Aufteilung entfällt; Ergebnis wandert in Sticky-Bottom-Bar.
- **Nummerierte Karten**: 1 Wohnung · 2 Mieter · 3 Heizkosten · 4 Umlagefähige Kosten · 5 Weitere Kosten.
- **Badges**: grün „auto" (vorbefüllt), gelb „ergänzen" (Pflichtfeld leer), „nach Verbrauch – bitte prüfen" für `consumption_based`-Positionen (editierbar).
- **Heizkosten-Karte (neu, Position 3)**: ein Eingabefeld vorbefüllt mit `heating.amount`, grünes Badge wenn `source = "messdienst"`. Bei `missing`: leeres Feld + Hinweis „Bitte Betrag aus der Heizkostenabrechnung eintragen".
- **Umlagefähige Kosten**: pro Zeile Checkbox (default an) zum Abwählen, plus Hinweis-Banner „Wasser, das bereits in der Heizkostenabrechnung enthalten ist, nicht zusätzlich ansetzen."
- **Weitere Kosten / Reparaturen**: bleiben als Liste mit `+ hinzufügen`-Button, eine Zeile pro Position.
- **Sticky-Bottom-Bar**: maskierter Betrag `*.*** €` + Schloss-Icon, großer orange „Jetzt erstellen"-Button (öffnet bestehenden Buy-Dialog).
- **Haftungs-Disclaimer**: kleine Box unten + im Buy-Dialog: „Automatisiert erstellt. Keine Rechts-/Steuerberatung. Verantwortung für Eingaben beim Nutzer. Keine Haftung für Inhalte."

### Service-Hub-Übersicht `src/pages/weg-owner/ServiceHub.tsx`
- Drei große gestapelte Karten (Icon links, Titel, Kurztext, Preis + orangener „Erstellen ›"-Button).
- Desktop: `grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))`.
- Schlanke App-Bar bleibt durch `WegOwnerLayout` erhalten — nur Karten-Layout wird angepasst.

---

## Out of Scope (vom Nutzer als „optional / langfristig" markiert)
- Wiederverwendung der Admin-`BillingSettlement`-Logik für die Mieterabrechnung. Wird NICHT in diesem PR umgesetzt.

---

## Technische Notizen
- `heating_distribution_values`-Tabelle existiert bereits (siehe supabase-tables).
- Keine DB-Migration nötig.
- Edge-Function-Deploy passiert automatisch.
- Keine globalen Design-Token-Änderungen — RGI-Farben werden lokal als CSS-Variablen im Tool-Wrapper gesetzt, damit das übrige Admin-UI unberührt bleibt.