

## Ziel
Im Brennstoffkauf-Dialog (im Buchungs-Prüfmodus / TransactionReviewMode) sollen — wie bereits in `InvoiceDetailSheet` und `FuelInventorySection` — die Felder **CO₂-Emissionen (kg)**, **CO₂-Steueranteil (€)** und **Energieinhalt (kWh)** sichtbar und bearbeitbar sein. Zusätzlich soll, falls die Liegenschaft mehrere Heizkreise hat, der **Heizkreis** zugeordnet werden können. Werte werden beim Speichern in `fuel_inventory` mitgeschrieben.

## Umsetzung

### 1. Row-State erweitern (`TransactionReviewMode.tsx`)
Im `RowState`-Typ und in allen Initialisierungen (Zeilen ~57–65, ~331–338, ~420–427) folgende Felder ergänzen:
- `fuel_co2_emissions_kg: string`
- `fuel_co2_tax_amount: string`
- `fuel_energy_content_kwh: string`
- `fuel_heating_unit_id: string`

### 2. OCR-Prefill erweitern (Zeilen ~506–514)
Wenn `ocr_extracted_data` vorhanden ist, zusätzlich vorbefüllen:
- `co2_emissions_kg` → `fuel_co2_emissions_kg`
- `co2_tax_amount_eur` → `fuel_co2_tax_amount`
- `energy_content_kwh` → `fuel_energy_content_kwh`

### 3. Brennstoff-Dialog UI erweitern (Zeilen ~1789–1843)
- Auswahl **Art** um `gas` (Gas, Einheit kWh) und `district_heating` (Fernwärme, Einheit kWh) ergänzen — konsistent mit den restlichen Stellen im System.
- Einheit (`l` / `kg` / `kWh`) dynamisch ableiten.
- Neuer Block „CO₂-Daten (BEHG) — für Heizkostenabrechnung" (amber-Hinweisbox, analog `InvoiceDetailSheet`):
  - Nur sichtbar bei `oil`, `gas`, `district_heating`
  - Inputs: CO₂-Emissionen (kg), CO₂-Steueranteil (€)
  - Hinweistext „Werte aus Rechnung übernehmen, nicht raten" (Anti-Halluzination, gemäß Memory `co2-tracking-logic`)
- Neues Feld **Energieinhalt (kWh)** (immer sichtbar bei Kauf).
- Neues Feld **Heizkreis** (Select) — Daten aus `heating_units` per Building-ID; nur anzeigen wenn ≥ 1 Eintrag existiert. „Kein Heizkreis" als Default.

### 4. Speicher-Logik erweitern (Zeilen ~705–732)
Beim Insert in `fuel_inventory` zusätzliche Felder mitschreiben:
- `co2_emissions_kg`, `co2_tax_amount`, `energy_content_kwh` (jeweils nur wenn gesetzt)
- `heating_unit_id` (falls gewählt)
- `unit` korrekt ableiten (`l` / `kg` / `kWh`)

### 5. Daten-Fetch
Innerhalb der Komponente (oder per kleinem Helper-Hook) `heating_units` für die aktive Liegenschaft per `useQuery` laden, damit der Select gefüllt werden kann.

## Bewusst nicht geändert
- `FuelInventorySection` und `InvoiceDetailSheet`: bereits korrekt, kein Eingriff nötig.
- DB-Schema/`fuel_inventory`-Tabelle: enthält bereits alle Felder, keine Migration nötig.
- Anti-Halluzinations-Regel: Werte werden nur als Vorschlag aus OCR übernommen, der Nutzer prüft (Human-in-the-Loop, gemäß Projekt-Knowledge).

## Betroffene Datei
- `src/components/finance/TransactionReviewMode.tsx`

## QA
- Brennstoff-Dialog öffnen: CO₂-Felder erscheinen nur bei Heizöl/Gas/Fernwärme, nicht bei Pellets.
- OCR-erkannte Werte vorausgefüllt (sofern Rechnung diese enthält).
- Speichern → Eintrag in `fuel_inventory` enthält CO₂-Emissionen, CO₂-Steuer, kWh, ggf. Heizkreis.
- Bei Liegenschaft ohne Heizkreise wird der Select ausgeblendet.
- Bestehender Flow (nur Heizöl/Pellets ohne CO₂) funktioniert weiterhin.
