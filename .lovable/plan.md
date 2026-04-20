

## Ziel

Bei Jahresabrechnungen für **Gas / Fernwärme** muss der Brennstoffverbrauch (kWh, CO₂-Emissionen, CO₂-Steuer) ins **Verbrauchsjahr** gebucht werden — nicht ins Rechnungsjahr. Bei **Heizöl / Pellets** bleibt die heutige Logik (Rechnungs-/Lieferdatum = Verbrauchsperiode).

## Konzept: „Verbrauchszeitraum vs. Rechnungsdatum"

Wir trennen sauber:

- **Buchung in `bookings`** → bleibt am `booking_date` (Rechnungs-/Zahlungsjahr) → korrekt für Liquidität & §35a
- **Brennstoff-Eintrag in `fuel_inventory`** → bekommt einen eigenen **Verbrauchszeitraum** (`consumption_period_from` / `consumption_period_to`), der bei Gas/Fernwärme aus der Jahresabrechnung kommt → korrekt für Heizkostenabrechnung

So wandert die Liquidität ins Jahr, in dem bezahlt wurde, der Verbrauch landet aber im richtigen Heizjahr.

## Umsetzung

### 1. DB-Migration: `fuel_inventory` erweitern
- `consumption_period_from DATE` (nullable)
- `consumption_period_to DATE` (nullable)
- `consumption_year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM consumption_period_to))` — als bequemes Filter-Feld für die Heizkostenabrechnung
- Index auf `(building_id, consumption_year)`

Backfill: für bestehende Einträge `consumption_period_to = delivery_date` setzen (rückwärtskompatibel).

### 2. OCR-Prefill erweitern (`TransactionReviewMode.tsx`)
Im Brennstoff-Prefill (~Zeile 533) zusätzlich:
- Wenn `ocr.invoice_type === "annual_settlement"` **UND** `fuel_type ∈ {gas, district_heating}`:
  - `fuel_consumption_from` ← `billing_period_from`
  - `fuel_consumption_to` ← `billing_period_to`
- Sonst (Öl/Pellets oder einfache Lieferung): `fuel_consumption_from/to` = `delivery_date`

### 3. UI „Brennstoffkauf"-Dialog (`TransactionReviewMode.tsx`, ~Zeile 1789)
Neuer Abschnitt **„Verbrauchszeitraum"** direkt unter „Lieferdatum":

- Bei `gas` / `district_heating`:
  - **Auffällige amber Hinweisbox**: „Bei Jahresabrechnungen liegt der Verbrauchszeitraum meist im Vorjahr. Werte aus der Rechnung übernehmen — die Buchung bleibt im Rechnungsjahr, der Verbrauch wird dem korrekten Heizjahr zugeordnet."
  - Zwei Date-Inputs: **Verbrauch von** / **Verbrauch bis** (vorbefüllt aus OCR `billing_period_*`)
  - Anzeige: „→ Zugeordnet zu Heizjahr **2024**" (aus `consumption_period_to`)
- Bei `oil` / `pellets`:
  - Standardmäßig versteckt; ein dezenter Toggle „Verbrauchszeitraum abweichend?" blendet die Felder ein (für Edge Cases). Default = `delivery_date`.

### 4. Speicherlogik (`TransactionReviewMode.tsx`, ~Zeile 705)
Beim Insert in `fuel_inventory`:
- `consumption_period_from`: aus State, Fallback `delivery_date`
- `consumption_period_to`: aus State, Fallback `delivery_date`

`booking_date` der Buchung selbst bleibt unverändert (Rechnungsdatum).

### 5. Anzeige in `TransferReviewMode.tsx` (Brennstoff-Box)
Brennstoff-Info-Block ergänzen:
- Zeile **„Verbrauchszeitraum"** (aus `ocr.billing_period_from` / `_to`, falls vorhanden)
- Hinweis-Badge **„Heizjahr 2024"** wenn `billing_period_to` im Vorjahr liegt
- Klare visuelle Trennung: „Rechnungsdatum 2025-02-04 · Heizjahr 2024"

### 6. Heizkostenabrechnung / Auswertungen
- Überall, wo aktuell `delivery_date` für Jahresfilter verwendet wird, auf `COALESCE(consumption_period_to, delivery_date)` umstellen.
- Konkret prüfen: `FuelInventorySection`, `HeatingExportSection`, CO₂-CSV-Export für die Ablesefirma.

## Bewusst NICHT geändert
- `bookings.booking_date` und `fiscal_year`: bleiben auf Rechnungsdatum → korrekt für GuV/Liquidität
- `fuel_inventory.delivery_date`: bleibt als „physisches Lieferdatum" erhalten (= Rechnungsdatum bei Jahresabrechnungen, = Lieferdatum bei Öl/Pellets)
- OCR-Prompt: bereits korrekt, extrahiert `billing_period_*` schon heute

## Betroffene Dateien
- **Migration** (neu): `fuel_inventory` + 2 Spalten + Index + Backfill
- `src/components/finance/TransactionReviewMode.tsx`
- `src/components/transfers/TransferReviewMode.tsx`
- `src/components/finance/FuelInventorySection.tsx` (Anzeige + Jahresfilter)
- `src/components/finance/HeatingExportSection.tsx` (CSV-Filter auf `consumption_year`)

## Beispiel anhand des Screenshots
- Rechnung eao Gas: Rechnungsdatum **04.02.2025**, Verbrauchszeitraum **20.12.2023 – 31.12.2024**
- → Buchung in `bookings`: `booking_date = 2025-02-04`, `fiscal_year = 2025` ✅
- → `fuel_inventory`: `delivery_date = 2025-02-04`, `consumption_period_from = 2023-12-20`, `consumption_period_to = 2024-12-31`, `consumption_year = 2024` ✅
- → Heizkostenabrechnung 2024 sieht 26.751 kWh + 4.852,63 kg CO₂ ✅
- → Liquiditätsbericht 2025 sieht den Zahlungsabfluss ✅

## QA
- Gas-Jahresabrechnung 2024 (kommt 2025) buchen → Verbrauch erscheint in Heizjahr 2024
- Heizöl-Lieferung März 2025 buchen → Verbrauchszeitraum = 2025 (Default)
- CO₂-CSV-Export für Ablesefirma 2024 enthält den Gas-Verbrauch korrekt
- `FuelInventorySection`-Filter „2024" zeigt die Gas-Lieferung trotz Rechnungsdatum 2025

