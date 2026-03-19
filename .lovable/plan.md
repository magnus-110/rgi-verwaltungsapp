

# Stufe 1: Kontenrahmen + Finanzseite (Grundlage)

## Ziel
Globalen Kontenrahmen in Supabase anlegen (aus Excel-Daten), pro Liegenschaft Verteilerschlüssel-Overrides ermöglichen, und eine neue "Finanzen"-Seite im Admin-Bereich erstellen mit Tabs für Kontenrahmen-Verwaltung, Rechnungen und manuelle Buchungen.

## Datenbankstruktur

### Tabelle 1: `chart_of_accounts` (globaler Kontenrahmen)
- `id` uuid PK
- `account_number` text NOT NULL UNIQUE (z.B. "1000", "M0001")
- `account_name` text NOT NULL
- `category` text NOT NULL (z.B. "1. Umlagefähige Betriebskosten")
- `default_distribution_key` text (z.B. "mea", "personen", "verbrauch_wasser", "einheiten", "heizkostenverordnung", "direkt")
- `is_35a_relevant` boolean DEFAULT false
- `is_system_account` boolean DEFAULT false (Standardkonten nicht löschbar)
- `sort_order` integer DEFAULT 0
- `created_at`, `updated_at`

### Tabelle 2: `building_account_overrides` (Verteilerschlüssel pro Liegenschaft)
- `id` uuid PK
- `building_id` uuid FK -> buildings
- `account_id` uuid FK -> chart_of_accounts
- `distribution_key` text NOT NULL (überschreibt den Standard)
- `created_at`, `updated_at`
- UNIQUE(building_id, account_id)

### Tabelle 3: `invoices` (Rechnungen)
- `id` uuid PK
- `building_id` uuid FK -> buildings (Zuordnung zur Liegenschaft)
- `invoice_number` text
- `vendor_name` text
- `invoice_date` date
- `due_date` date
- `gross_amount` numeric
- `net_amount` numeric
- `vat_amount` numeric
- `description` text
- `status` text DEFAULT 'open' (open, verified, paid, booked)
- `file_path` text (PDF im Storage)
- `ocr_raw_data` jsonb (rohe OCR-Ergebnisse fuer KI-Analyse)
- `ocr_extracted_data` jsonb (strukturierte Extraktion)
- `paid_at` timestamp
- `created_by` uuid
- `created_at`, `updated_at`

### Tabelle 4: `bookings` (Buchungen)
- `id` uuid PK
- `building_id` uuid FK -> buildings
- `account_id` uuid FK -> chart_of_accounts
- `invoice_id` uuid FK -> invoices (optional, fuer manuelle Buchungen)
- `booking_date` date NOT NULL
- `amount` numeric NOT NULL
- `description` text
- `fiscal_year` integer NOT NULL
- `performance_period_from` date (Leistungszeitraum)
- `performance_period_to` date
- `status` text DEFAULT 'pending' (pending, confirmed)
- `source` text DEFAULT 'manual' (manual, ocr, make_webhook)
- `created_by` uuid
- `confirmed_by` uuid
- `confirmed_at` timestamp
- `created_at`, `updated_at`

### Seed-Daten
Alle ~90 Konten aus der Excel-Datei werden per INSERT in `chart_of_accounts` eingefuegt mit den Standard-Verteilerschluesseln.

### RLS
Alle 4 Tabellen: `user_has_admin_access(auth.uid())` fuer ALL.

## Frontend

### Neue Seite: `/finanzen` (Finanzen)
Neuer Menue-Eintrag in `AdminSidebar.tsx` mit Wallet/Landmark-Icon zwischen "Adressen" und "Chatbot".

**Tab-Struktur:**

1. **Kontenrahmen** -- Tabelle aller Konten, gruppiert nach Kategorie. Editierbare Bezeichnung. Button "Konto hinzufuegen". Loeschbar wenn kein Systemkonto.

2. **Verteilerschluessel** -- Gebaeude-Auswahl oben, dann Tabelle aller Konten mit dem aktuellen Schluessel (Standard oder Override). Dropdown zum Aendern pro Konto/Liegenschaft.

3. **Rechnungen** -- Liste aller Rechnungen mit Status-Badge (offen/geprueft/bezahlt/gebucht), Gebaeude-Filter, Drag-Drop-Zone fuer PDF-Upload + OCR. Manuelles Anlegen moeglich. Status-Workflow-Buttons.

4. **Buchungen** -- Tabellarische Ansicht aller Buchungen mit Kontozuordnung, Gebaeude-Filter, Geschaeftsjahr-Filter. Button "Manuelle Buchung". Unbestaetigte Buchungen hervorgehoben mit Bestaetigungs-Button.

### Gebaeude-Dashboard Erweiterung
Im `BuildingDashboard.tsx` einen neuen Tab "Finanzen" hinzufuegen, der die Rechnungen und Buchungen gefiltert auf dieses Gebaeude anzeigt (Zusammenfassung mit Link zur Hauptseite).

## Dateien die erstellt/geaendert werden

| Datei | Aktion |
|---|---|
| `supabase/migrations/xxx_create_accounting_tables.sql` | Neu: 4 Tabellen + Seed-Daten |
| `src/pages/Finance.tsx` | Neu: Hauptseite mit 4 Tabs |
| `src/components/finance/ChartOfAccountsTab.tsx` | Neu: Kontenrahmen-Verwaltung |
| `src/components/finance/DistributionKeysTab.tsx` | Neu: Verteilerschluessel pro Gebaeude |
| `src/components/finance/InvoicesTab.tsx` | Neu: Rechnungsliste + Upload |
| `src/components/finance/BookingsTab.tsx` | Neu: Buchungsliste + manuelle Buchung |
| `src/components/finance/CreateInvoiceDialog.tsx` | Neu: Rechnung manuell anlegen |
| `src/components/finance/CreateBookingDialog.tsx` | Neu: Buchung manuell anlegen |
| `src/components/AdminSidebar.tsx` | Aendern: Menue-Eintrag "Finanzen" |
| `src/App.tsx` | Aendern: Route `/finanzen` |
| `src/components/buildings/BuildingDashboard.tsx` | Aendern: Finanz-Tab hinzufuegen |
| `src/integrations/supabase/types.ts` | Wird automatisch aktualisiert |

## Implementierungsreihenfolge
1. DB-Migration mit allen 4 Tabellen + Seed-Kontenrahmen
2. Finanzseite mit Kontenrahmen-Tab (CRUD)
3. Verteilerschluessel-Tab (Gebaeude-spezifische Overrides)
4. Rechnungen-Tab (CRUD + PDF-Upload, OCR kommt spaeter)
5. Buchungen-Tab (manuell erstellen + bestaetigen)
6. Sidebar + Routing + BuildingDashboard-Integration

