

# Plan: Abrechnungssystem vervollständigen — PDF, Wirtschaftsplan & Rechtskonformität

## Übersicht

Das bestehende System wird um 4 Bereiche erweitert: (A) Rechtskonformität sicherstellen, (B) PDF-Generierung mit Hintergrundvorlage, (C) Wirtschaftsplan-Generator (KI-gestützt), (D) Design-Verbesserungen.

---

## A. Rechtskonformität & Berechnungslogik

### A1. Vermögensbericht (§28 WEG)
Neue Sektion in `BillingSettlement.tsx` — Tab "Vermögensbericht" neben "Kostenübersicht" und "Eigentümer":
- Bankkonten-Saldo (aus `account_balances` mit `carry_forward_balance`)
- Rücklagenentwicklung: Anfangsbestand + Zuführungen − Entnahmen = Endbestand
- Forderungen (offene Hausgeld-Rückstände)
- Verbindlichkeiten (offene Rechnungen)

### A2. §35a EStG-Bescheinigung
In der Einzelabrechnung pro Eigentümer:
- Buchungen mit `is_35a_relevant = true` separat summieren
- Aufteilen in "Haushaltsnahe Dienstleistungen" (20%, max 4.000€) und "Handwerkerleistungen" (20%, max 1.200€)
- Anteilig nach Verteilerschlüssel berechnen und ausweisen

### A3. Zeitanteilige Berechnung
Bei Eigentümerwechsel: `valid_from` / `valid_to` der `contact_building_shares` gegen `period_from` / `period_to` abgleichen und anteilig (Tage) berechnen.

### A4. Rücklage als eigene Position
Rücklage wird separat von den umlagefähigen Kosten dargestellt:
- Gesamtabrechnung: Betriebskosten + Rücklagenzuführung = Gesamtkosten
- Einzelabrechnung: Kostenanteil Betrieb + Kostenanteil Rücklage − Vorauszahlungen = Ergebnis

---

## B. PDF-Generierung mit Hintergrundvorlage

### B1. Report Template System
Neue DB-Tabelle `report_templates`:
- `id`, `name`, `type` (gesamtabrechnung, einzelabrechnung, wirtschaftsplan, vermoegensbericht)
- `background_pdf_url` (hochgeladenes Briefpapier als PDF)
- `header_html`, `footer_html` (optionale Kopf-/Fußzeile)
- `margins` (jsonb: top, right, bottom, left in mm)
- `building_id` (nullable — global oder pro Liegenschaft)
- `is_default` (boolean)

### B2. Template-Upload UI
Neue Komponente `ReportTemplateSettings.tsx` (erreichbar über Settings oder direkt im BillingTab):
- Upload eines Hintergrund-PDFs (Briefpapier/Firmenlogo)
- Vorschau des hochgeladenen Hintergrunds
- Ränder konfigurieren
- Vorlagen pro Typ verwalten

### B3. Edge Function `generate-billing-pdf`
- Empfängt: `buildingId`, `periodId`, `fiscalYear`, `ownerId` (optional für Einzelabrechnung)
- Generiert HTML mit den Abrechnungsdaten
- Nutzt eine PDF-Library (z.B. `jspdf` oder Puppeteer über Deno) 
- Legt das Hintergrund-PDF als Ebene unter den Inhalt
- Speichert generierte PDFs im `building-documents` Bucket
- Gibt eine signierte URL zurück

### B4. PDF-Inhalte

**Gesamtabrechnung (1 PDF pro Liegenschaft):**
- Deckblatt: Liegenschaft, Zeitraum, Verwalter
- Kostenaufstellung nach Verteilerschlüssel
- Einzelkontenauszüge
- Vermögensbericht
- Rücklagenentwicklung

**Einzelabrechnung (1 PDF pro Eigentümer):**
- Persönliche Ansprache
- Kostenanteil-Tabelle mit Verteilerschlüsseln
- Vorauszahlungen vs. Kostenanteil
- Ergebnis (Guthaben/Nachzahlung)
- §35a-Bescheinigung
- Bankverbindung für Nachzahlung

### B5. UI-Integration
In `BillingSettlement.tsx`:
- Button "Alle PDFs generieren" → generiert Gesamtabrechnung + alle Einzelabrechnungen
- Button "PDF-Vorschau" pro Eigentümer
- Download-Buttons für einzelne oder ZIP aller PDFs

---

## C. Wirtschaftsplan-Generator (KI-gestützt)

### C1. DB-Tabelle `economic_plans`
- `id`, `building_id`, `fiscal_year`, `status` (draft, approved, active)
- `based_on_period_id` (Referenz zur Abrechnung)
- `total_costs`, `total_reserve`
- `adjustments` (jsonb — KI-Vorschläge + manuelle Korrekturen)
- `created_at`, `approved_at`, `approved_by`

### C2. DB-Tabelle `economic_plan_items`
- `id`, `plan_id`, `account_id`
- `previous_amount` (aus Vorjahresabrechnung)
- `planned_amount` (KI-Vorschlag oder manuell)
- `adjustment_reason` (Text — z.B. "Energiepreise +8%")
- `distribution_key`

### C3. Edge Function `generate-economic-plan`
Datensammlung (wie `analyze-billing`):
- Alle Konten + Buchungssummen der letzten 2-3 Jahre
- Brennstoffpreise und Verbrauchstrends
- Rücklagenstand und geplante Instandhaltungen (aus Wartungsmodul)
- Bestehende Verträge und deren Laufzeiten

KI-Prompt (Mistral Large):
- Analysiert historische Kosten und Trends
- Berücksichtigt bekannte Preissteigerungen (Energie, Versicherung, Dienstleister)
- Schlägt für jedes Konto einen Planbetrag vor mit Begründung
- Berechnet neues monatliches Hausgeld pro Eigentümer
- Gibt strukturiertes JSON zurück mit `planned_items[]` und `reasoning`

### C4. UI: Wirtschaftsplan-Editor
Neuer 7. Schritt im BillingTab oder eigener Bereich:
- Tabelle: Konto | Ist-Kosten Vorjahr | KI-Vorschlag | Anpassung | Begründung
- Jede Zeile editierbar — KI-Wert übernehmen oder manuell anpassen
- Automatische Berechnung: Gesamtkosten → Verteilung → neues Hausgeld pro Eigentümer
- Vergleichsansicht: Altes vs. neues Hausgeld pro Einheit
- Button "Wirtschaftsplan als PDF generieren"
- Button "Wirtschaftsplan genehmigen" → setzt Status auf `approved`, kann als Basis für neue `contact_building_costs` dienen

---

## D. Design & UX

### D1. PDF-Vorschau im Browser
- Modal mit eingebettetem PDF-Viewer (bereits vorhandener `PdfViewerModal`)
- Live-Vorschau der generierten Abrechnung bevor sie final erstellt wird

### D2. Sammelexport
- "Alle Abrechnungen generieren" → Fortschrittsanzeige → ZIP-Download
- Oder: Direkt in `building-documents` ablegen mit automatischer Kategorie

---

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/finance/BillingSettlement.tsx` | Vermögensbericht-Tab, §35a, zeitanteilige Berechnung, PDF-Buttons |
| `src/components/finance/BillingTab.tsx` | Optionaler 7. Schritt "Wirtschaftsplan" |
| `src/components/finance/EconomicPlanEditor.tsx` | NEU: KI-gestützter Wirtschaftsplan-Editor |
| `src/components/finance/ReportTemplateSettings.tsx` | NEU: Vorlagen-Upload & -Verwaltung |
| `src/components/finance/BillingPdfPreview.tsx` | NEU: PDF-Vorschau-Modal |
| `supabase/functions/generate-billing-pdf/index.ts` | NEU: PDF-Generierung |
| `supabase/functions/generate-economic-plan/index.ts` | NEU: KI-Wirtschaftsplan |
| Migration | `report_templates`, `economic_plans`, `economic_plan_items` Tabellen |

## Umsetzungsreihenfolge

1. **DB-Migrationen** — Neue Tabellen für Templates, Wirtschaftspläne
2. **Rechtskonformität** — Vermögensbericht, §35a, zeitanteilige Berechnung in Settlement
3. **Report Templates** — Upload-UI + Storage
4. **PDF-Generierung** — Edge Function + UI-Integration
5. **Wirtschaftsplan-KI** — Edge Function + Editor-UI
6. **Sammelexport & Polish** — ZIP, Vorschau, Design

