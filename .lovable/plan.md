
# RGI Internal — Zeiterfassung & Fakturierung (final)

Neues Admin-Modul „RGI Intern" für firmeninterne Stundenerfassung und Rechnungsstellung. Sichtbar nur für Nutzer mit `admin`-Rolle, strikt getrennt von WEG/Miet-Daten.

## 1. Navigation & Zugriff

- Neuer Sidebar-Eintrag „RGI Intern" (Briefcase-Icon), nur sichtbar bei `has_role(uid,'admin')`.
- Route `/rgi-intern` mit Tabs: **Dashboard · Projekte · Stunden · Rechnungen · Kunden · Vorlagen · Einstellungen**.
- Alle Tabellen mit Prefix `rgi_*`. RLS: jede Policy prüft `has_role(auth.uid(),'admin')` für SELECT/INSERT/UPDATE/DELETE → alle Admins sehen und bearbeiten alles (auch fremde Stundeneinträge).

## 2. Datenmodell

```text
rgi_company_settings   (Singleton) Firmenstammdaten
  ├─ legal_name, address, zip, city, country
  ├─ tax_no, vat_id, ceo, hrb, court
  ├─ iban, bic, bank_name
  ├─ email, phone, website
  ├─ invoice_number_pattern  (z.B. "{YYYY}-{NNNN}" – du gibst Struktur später vor)
  └─ default_payment_terms_days, default_footer_text

rgi_clients            Kunde
  ├─ id, name, type ('contact'|'building'|'free')
  ├─ contact_id?, building_id?  (Snapshot der Adresse damit alte Rechnungen stabil bleiben)
  ├─ address_line1/2, zip, city, country, email, vat_id, customer_no
  └─ default_payment_terms_days, default_hourly_rate

rgi_projects
  ├─ id, client_id, name, sparte ('weg'|'rent'|'sales'|'letting'|'other')
  ├─ status ('active'|'paused'|'closed'), default_hourly_rate
  └─ notes, started_at, closed_at

rgi_time_entries
  ├─ id, project_id, user_id
  ├─ date, minutes, description (Pflicht)
  ├─ hourly_rate (optional override), billable
  └─ invoice_item_id?  (NULL = noch nicht abgerechnet)

rgi_invoices
  ├─ id, client_id, project_id?, invoice_number (unique)
  ├─ issue_date, due_date, service_period_from/to
  ├─ status ('draft'|'sent'|'partial'|'paid'|'overdue'|'cancelled')
  ├─ subtotal_net, vat_total, total_gross, paid_amount
  ├─ intro_text, footer_text, template_id
  ├─ docx_storage_path, pdf_storage_path
  └─ created_by, sent_at, paid_at

rgi_invoice_items
  ├─ id, invoice_id, position, kind ('time'|'flat'|'material'|'text')
  ├─ description, quantity, unit, unit_price_net, vat_rate (0|7|19)
  ├─ line_net, line_vat, line_gross
  └─ source_time_entry_ids[]

rgi_invoice_templates
  ├─ id, name, sparte?, storage_path, is_default
  ├─ placeholder_schema (JSON – erkannte Tags)
  └─ created_by

rgi_invoice_sequences   (scope, year, last_no)   – atomare Nummernvergabe
rgi_payments            (invoice_id, paid_on, amount, note, source)
rgi_reminders           (invoice_id, level 1/2/3, sent_on, fee, pdf_path)
```

Jede Tabelle bekommt GRANTs für `authenticated` + `service_role`, RLS aktiviert, Policies via `has_role()`.

## 3. Stunden-Workflow

- Schnellerfassung-Drawer (Datum, Projekt, Dauer als HH:MM oder Minuten, Beschreibung Pflicht, optional Stundensatz-Override, abrechenbar-Toggle).
- Tages-/Wochenansicht, Filter nach Projekt/Kunde/Sparte/Zeitraum/Status (abgerechnet/offen).
- Aktion „Aus Stunden Rechnung erstellen": Mehrfachauswahl → Rechnungs-Editor mit vorbefüllten Positionen (Gruppierung wählbar: pro Eintrag / pro Tag / Summe). Nach Speichern bekommen Stunden `invoice_item_id`.
- Stundensatz-Logik: Projekt-Default + Override pro Eintrag (beides erlaubt).

## 4. Rechnungen

- Editor: Kopf (Kunde, Projekt optional, Daten, Leistungszeitraum, Vorlage) · Positionen mit USt. 0/7/19 pro Zeile, drag & drop, Mengen × Preis live-berechnet · Summenleiste mit USt-Aufschlüsselung · Intro/Footer-Text.
- Status-Flow: `draft` → `sent` (PDF erzeugt) → `paid|partial|overdue`. Pg_cron-Job `rgi-mark-overdue` markiert täglich überfällige Rechnungen.
- Storno: nach Versand keine Löschung, nur Storno-Rechnung (negativ) erzeugbar.
- Nummernkreis: konfigurierbares Pattern in `rgi_company_settings.invoice_number_pattern` (Platzhalter `{YYYY}`, `{MM}`, `{SPARTE}`, `{NNNN}`). Atomare Vergabe via `rgi_invoice_sequences` und Security-Definer-RPC.

## 5. PDF-Generierung (CloudConvert)

- Edge Function `rgi-render-invoice`:
  1. Lädt Word-Vorlage (`rgi-invoice-templates` Bucket) + Rechnungsdaten.
  2. Rendert via PizZip + Docxtemplater (Pattern wie `generate-billing-document`).
  3. Speichert DOCX in Bucket `rgi-invoices/docx/`.
  4. Konvertiert via **CloudConvert API** zu PDF (`CLOUDCONVERT_API_KEY` ist bereits konfiguriert, wird identisch zu `generate-billing-document` genutzt).
  5. Speichert PDF in `rgi-invoices/pdf/`, schreibt Pfade in `rgi_invoices`.
- Download via Signed URLs (on-demand, Egress-Management).
- Re-Render-Button im Editor erzeugt neue Version (alte bleibt erhalten als `_v2.pdf`).

## 6. Word-Vorlagen

- Upload .docx → Bucket `rgi-invoice-templates` (privat).
- Edge Function `rgi-parse-template-placeholders` extrahiert alle `{tag}` und `{#loop}{/loop}` Blöcke beim Upload → speichert Schema. UI warnt bei fehlenden Pflicht-Tags.
- Dokumentierte Platzhalter (im UI sichtbar als „Hilfe-Sheet"):
  - Firma: `{firma.name}`, `{firma.adresse}`, `{firma.iban}`, `{firma.steuernr}` …
  - Kunde: `{kunde.name}`, `{kunde.adresse}`, `{kunde.email}`, `{kunde.ustid}`
  - Rechnung: `{rechnung.nummer}`, `{rechnung.datum}`, `{rechnung.faellig}`, `{rechnung.leistungszeitraum}`
  - Positionen-Loop: `{#positionen}{nr} {beschreibung} {menge} {einheit} {einzelpreis} {ust} {summe}{/positionen}`
  - Summen: `{summe.netto}`, `{summe.ust19}`, `{summe.ust7}`, `{summe.brutto}`
- Logo & komplettes Briefpapier kommen ausschließlich aus der Word-Vorlage.
- Vorlagen pro Sparte als Default markierbar.

## 7. Kunden

- Picker beim Anlegen: **Bestehender Kontakt** (Suche in `contacts`), **Gebäude** (Suche in `buildings`), oder **Frei erstellen**.
- Adresse wird beim Anlegen aus Kontakt/Gebäude **als Snapshot** in `rgi_clients` kopiert → spätere Änderungen am Kontakt verändern alte Rechnungen nicht.
- Manuell editierbar.

## 8. Dashboard

- KPI-Karten: Umsatz Monat/Jahr (netto & brutto), offene Forderungen, überfällige Beträge, abrechenbare Stunden offen, Stunden diesen Monat.
- Charts: Umsatz pro Monat (12M Balken), Umsatz pro Sparte (Donut), Top-Kunden, durchschnittliche Zahldauer.
- Filter: Jahr, Sparte, Kunde.

## 9. Zahlungseingang & Mahnwesen

- Manuelles Markieren „bezahlt" mit Datum/Betrag, Teilzahlungen über `rgi_payments`.
- Mahnstufen 1/2/3 mit eigenen Word-Vorlagen, manuell auslösbar, Mahngebühr pro Stufe konfigurierbar in Settings.
- Cron-Job markiert `overdue` ab `due_date + 1`.
- Bank-Match aus CAMT-Import: Felder vorgesehen, **nicht** Teil von V1.

## 10. Edge Functions

| Funktion | Zweck |
|---|---|
| `rgi-generate-invoice-number` | Atomare Sequenzvergabe nach Pattern |
| `rgi-render-invoice` | DOCX rendern + CloudConvert → PDF + Storage |
| `rgi-parse-template-placeholders` | Beim Vorlagen-Upload Tags extrahieren |
| `rgi-mark-overdue` | pg_cron daily, setzt `status='overdue'` |
| `rgi-render-reminder` | Mahnungs-PDF analog Rechnung |

## 11. Frontend-Struktur

```text
src/pages/RgiIntern.tsx
src/components/rgi-intern/
  ├─ Dashboard.tsx
  ├─ projects/{ProjectList, ProjectDialog}.tsx
  ├─ time/{TimeEntryDrawer, TimeEntriesTable, TimerWidget}.tsx
  ├─ invoices/{InvoiceList, InvoiceEditor, InvoicePositionsTable, PaymentDialog, ReminderDialog}.tsx
  ├─ clients/{ClientList, ClientDialog, ClientPicker}.tsx
  ├─ templates/{TemplateList, TemplateUploadDialog, PlaceholderHelpSheet}.tsx
  └─ settings/{CompanySettings, NumberPatternEditor, ReminderFeesEditor}.tsx
src/hooks/useRgi*.ts (React Query)
```

## 12. Bewusst NICHT in V1

- Auto-Bank-Match aus CAMT (Felder vorbereitet)
- Wiederkehrende Rechnungen (Tabelle später nachreichen)
- DATEV-Export
- Kleinunternehmer-Modus (du willst USt-Ausweis)
- Skonto
- Stundennachweis-Anhang

## Defaults aus deinen Antworten

- Alle Admins sehen & bearbeiten alles (auch fremde Stundeneinträge)
- 1 Bankkonto in `rgi_company_settings`
- Logo komplett aus Word-Vorlage, kein separater Upload
- Firmendaten in „Einstellungen" Tab
- CloudConvert-PDF (Key bereits vorhanden)

Sobald du den Plan freigibst, beginne ich mit Migration → Buckets → Edge Functions → UI in dieser Reihenfolge.
