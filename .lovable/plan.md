

## Kontext & Recherche

Der Nutzer fragt nach einem konzeptionellen Plan für CO₂-Steuer + CO₂-Emissionen bei Brennstoffkäufen. Lass mich kurz die relevanten Bestandteile prüfen.
<lov-tool-use id="toolu_vrtx_015wcx2qPEuhrfmFaV6o43TJ" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/finance/FuelInventorySection.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01PDSHva2b6dMhbEVTDSg1kN" name="code--search_files" integration-id="code" data="{\"query\": \"co2|CO2|fuel_inventory\", \"include_patterns\": \"*.ts,*.tsx,*.sql\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_011fH5g5Ct5YSFKJRo4Kr7ss" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/finance/FuelInventorySection.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01UYSsT6C8pjHQ4e8PccGhPH" name="code--search_files" integration-id="code" data="{\"query\": \"fuel_inventory|co2|CO2|brennstoff|Brennstoff\", \"include_patterns\": \"*.ts,*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Aw7ejWwEXxCqtcsVMY9WYb" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/finance/InvoiceDetailSheet.tsx\", \"lines\": \"450-620\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01XZezS67eCFMtdonrtjjpHG" name="code--search_files" integration-id="code" data="{\"query\": \"fuel_inventory\", \"include_patterns\": \"supabase/migrations/*.sql\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01V1MWGNk3ffh1M7QrasPpN4" name="code--view" integration-id="code" data="{\"file_path\": \"supabase/migrations/20260325182702_e991709c-f0d0-4b99-9408-9a59c7ef0248.sql\", \"lines\": \"23-50\"}">
</lov-tool-use>
I have enough context to draft a sound plan.

<lov-plan>

## Ziel

CO₂-Steuer und CO₂-Emissionen sauber in Brennstoffkauf + Heizkostenabrechnung integrieren — mit OCR-Vorschlag (Human-in-the-Loop), klaren Pflichtfeldern für die Ablesefirma und sauberer Trennung Vermögensbericht ↔ Heizkostenabrechnung.

## Praxis-Hintergrund (kurz)

- **BEHG / CO₂-Kostenaufteilungsgesetz (CO2KAufG, seit 2023):** Verwalter müssen den CO₂-Preis-Anteil und die CO₂-Emissionen (kg CO₂) je Liegenschaft ermitteln und nach 10-Stufen-Modell zwischen Vermieter/Mieter bzw. unter WEG-Eigentümern aufteilen. Bei WEG: nur informatorisch in der Abrechnung, da Eigentümer = "Mieter+Vermieter" in einem.
- **Datenquellen Rechnung:**
  - **Heizöl:** Liter, Brennwert, CO₂-Emission in kg, CO₂-Steueranteil in € — steht meist explizit auf Lieferschein/Rechnung.
  - **Gas:** kWh, CO₂-Emission (g/kWh), CO₂-Kostenanteil — in Jahresrechnung des Versorgers.
  - **Fernwärme:** kWh, primärenergetischer CO₂-Faktor, CO₂-Kostenanteil — Versorger-Bescheinigung.
  - **Pellets:** kein CO₂-Preis (biogen), nur Menge/Energie für Vermögensbericht.
- **Was die Ablesefirma (Techem/ista/BRUNATA) braucht:** Verbrauchsmenge, Brennwert, **CO₂-Emission gesamt (kg)**, **CO₂-Kosten gesamt (€)** je Energieträger pro Abrechnungszeitraum.

## Systemarchitektur

### 1. Datenmodell — Erweiterung `fuel_inventory`

Neue Spalten (Migration):
```text
co2_emissions_kg     NUMERIC   -- kg CO₂ aus dieser Lieferung
co2_tax_amount       NUMERIC   -- € CO₂-Preisanteil (BEHG)
energy_content_kwh   NUMERIC   -- Brennwert/Energiegehalt (für Heizöl/Pellets)
net_amount           NUMERIC   -- Netto € (für Vermögensbericht)
vat_amount           NUMERIC   -- MwSt €
```
Bleibt 1 Tabelle — gilt für `purchase`, `opening_balance`, `closing_balance` (CO₂-Felder nur bei `purchase` relevant).

### 2. OCR-Erweiterung (`extract-invoice` / `analyze-document`)

Mistral-Prompt um zusätzliche Felder erweitern, die NUR ausgegeben werden, wenn explizit auf der Rechnung sichtbar:
```text
co2_emissions_kg     (z.B. aus "CO₂-Emissionen: 7.940 kg")
co2_tax_amount_eur   (z.B. aus "CO₂-Preis nach BEHG: 540,00 €")
energy_content_kwh
fuel_type            (oil | gas | district_heating | pellets)
```
**Wichtig (Anti-Halluzination):** Wenn nicht explizit erwähnt → `null`. Keine Berechnung durch KI. Felder bleiben leer und werden vom Verwalter manuell ergänzt.

### 3. UI-Platzierung

**A) `InvoiceDetailSheet` → `FuelDataSection` (Aufbau):**
- Bestehende Felder: Brennstoffart, Menge, Gesamtpreis
- **NEU:** CO₂-Emissionen (kg), CO₂-Steueranteil (€), Brennwert (kWh)
- OCR-Vorschläge mit gelbem "Erkannt"-Badge je Feld; leere Felder mit Lupe-Icon "Bitte aus Rechnung ergänzen"
- Logik: Bei `gas` / `district_heating` / `oil` werden CO₂-Felder eingeblendet; bei `pellets` ausgeblendet (CO₂-neutral)

**B) `FuelInventorySection` (Übersicht):**
- Tabelle bekommt 2 zusätzliche Spalten: **CO₂ (kg)** und **CO₂-Steuer (€)** (nur sichtbar, wenn Werte vorhanden)
- Plausibilitäts-Badges erweitert: zeigt Jahres-CO₂-Summe pro Energieträger
- Warnung wenn Energieträger CO₂-pflichtig (oil/gas/FW) aber keine CO₂-Daten erfasst

**C) `HeatingExportSection` (CSV für Ablesefirma):**
- CSV erhält zusätzliche Spalten: `CO2_Emissionen_kg`, `CO2_Steuer_EUR`, `Brennwert_kWh` je Lieferung
- Aggregat-Block am Ende: Jahressumme CO₂-Emissionen + CO₂-Steuer pro Energieträger
- Format kompatibel zu Techem/ista-Eingabemasken

**D) `AssetReportSection` (Vermögensbericht):**
- Bleibt unverändert beim Restbestand-Wert (Öl, Pellets) — CO₂ ist NICHT bilanzwirksam
- Nur Hinweis-Zeile: "Für CO₂-Daten siehe Heizkostenabrechnung"

### 4. Gesetzliche Plausi-Checks (`BillingValidationPanel`)

Neue Checks:
- ⚠️ Heizöl-Lieferung ohne CO₂-Steuer erfasst (BEHG-Pflicht seit 2023)
- ⚠️ Gas-/Fernwärme-Periode ohne CO₂-Daten → Hinweis "vor Versand an Ablesefirma ergänzen"
- ✅ Pellets: kein CO₂-Check (biogen)

## Workflow aus Sicht des Verwalters

```text
Rechnung Heizöl-Lieferung trifft per E-Mail ein
  → OCR extrahiert: 3.000 l, Preis 3.450 €, CO₂: 7.940 kg, CO₂-Steuer 540 €
  → InvoiceDetailSheet: alle 5 Felder mit gelbem "Erkannt"-Badge vorausgefüllt
  → Verwalter prüft 1× → "Als Brennstoff-Eintrag speichern"
  → Eintrag in fuel_inventory mit allen Werten
  
Jahresende → Tab "Heizkosten" → "Export für Ablesefirma"
  → CSV mit Mengen + CO₂-Daten
  → Upload in Techem/ista-Portal
```

## Technische Umsetzung (Reihenfolge)

1. **Migration** — 5 neue Spalten in `fuel_inventory` (alle nullable)
2. **`extract-invoice/index.ts`** — Mistral-Prompt um CO₂-Felder erweitern (strikt anti-halluzinativ)
3. **`InvoiceDetailSheet.tsx` → FuelDataSection** — neue Eingabefelder + OCR-Vorbefüllung
4. **`FuelInventorySection.tsx`** — Tabellen-Spalten + Add-Dialog erweitern
5. **`HeatingExportSection.tsx`** — CSV-Export um CO₂-Spalten + Aggregat ergänzen
6. **`BillingValidationPanel.tsx`** — neue CO₂-Plausi-Checks
7. **Memory** speichern: `mem://features/finance/co2-tracking-logic`

## Bewusste Einschränkungen (KISS)

- **Keine** automatische CO₂-Berechnung aus Liter × Faktor — Verwalter trägt nur ein, was auf der Rechnung steht (Rechtssicherheit)
- **Keine** automatische 10-Stufen-Aufteilung Vermieter/Mieter im ersten Wurf — kommt als Phase 2, wenn Bedarf besteht
- **Pellets ohne CO₂-Felder** — biogene Brennstoffe sind vom BEHG ausgenommen

