

# Plan: Rechnungseingang mit OCR-Extraktion

## Uebersicht

PDF-Rechnungen per Drag-Drop hochladen, automatisch via Mistral OCR auslesen und strukturierte Daten (Lieferant, Betrag, Datum, IBAN, Positionen) extrahieren. Ergebnis wird als Rechnungs-Entwurf angezeigt, den der Nutzer pruefen und freigeben kann.

**Performance-Fokus**: Pagination, serverseitiges Filtern, kein vollstaendiges Laden aller Rechnungen.

## 1. Datenbank-Erweiterungen

Neue Spalten auf `invoices` Tabelle:
- `file_name` (text) - Original-Dateiname
- `vendor_iban` (text) - extrahierte IBAN
- `line_items` (jsonb) - extrahierte Positionen
- `suggested_account_id` (uuid, FK chart_of_accounts) - KI-Kontovorschlag
- `ocr_status` (text, default 'pending') - Status: pending/processing/done/error
- `ocr_error` (text) - Fehlermeldung

Index auf `(building_id, status)` und `(created_at DESC)` fuer performante Abfragen bei 10.000+ Datensaetzen.

## 2. Edge Function: `extract-invoice`

Neue Edge Function die:
1. PDF aus `invoices` Storage-Bucket liest (signierte URL)
2. Mistral OCR aufruft (wie `analyze-document` bereits tut)
3. Mistral Tool-Calling nutzt um strukturierte Daten zu extrahieren:

```text
Tool: extract_invoice_data
Parameters:
  - vendor_name (string)
  - vendor_iban (string)
  - invoice_number (string)
  - invoice_date (string, ISO)
  - due_date (string, ISO)
  - net_amount (number)
  - vat_amount (number)
  - gross_amount (number)
  - line_items (array of {description, amount, vat_rate})
  - suggested_account_number (string) - basierend auf Rechnungsinhalt
```

4. `invoices`-Zeile mit extrahierten Daten aktualisiert
5. `ocr_status` auf 'done' setzt

## 3. Frontend: InvoicesTab Redesign

**Upload-Bereich**: Drag-Drop-Zone oben auf der Rechnungsseite. Mehrere PDFs gleichzeitig moeglich. Upload in `invoices` Storage-Bucket, dann sofort `extract-invoice` Edge Function aufrufen.

**Rechnungsliste mit Pagination**:
- Server-seitige Pagination (25 pro Seite) via `.range(from, to)`
- Filter: Liegenschaft, Status, Zeitraum
- Count-Query fuer Gesamtanzahl
- Virtualisierung nicht noetig bei 25 pro Seite

**Rechnungsdetail-Ansicht**: 
- Inline-Expandable Row oder Sheet/Dialog
- Zeigt OCR-extrahierte Daten editierbar an
- PDF-Vorschau (signierte URL)
- Kontovorschlag aus KI anzeigen, aenderbar
- Status-Flow: Offen -> Geprueft -> Bezahlt -> Gebucht

**"Buchen"-Aktion**: Bei Status "Bezahlt" erscheint Button "Buchen". Erstellt automatisch eine Buchung in `bookings` mit allen Daten aus der Rechnung und setzt Status auf "Gebucht". Erst hier wird spaeter der Make.com Webhook ausgeloest.

## 4. Dateien

| Datei | Aktion |
|---|---|
| Migration SQL | Neue Spalten + Indizes auf `invoices` |
| `supabase/functions/extract-invoice/index.ts` | Neue Edge Function (OCR + Strukturextraktion) |
| `supabase/config.toml` | Neuer Function-Eintrag |
| `src/components/finance/InvoicesTab.tsx` | Redesign mit Upload, Pagination, Detail |
| `src/components/finance/InvoiceDropZone.tsx` | Neue Drag-Drop Upload Komponente |
| `src/components/finance/InvoiceDetailSheet.tsx` | Neue Detail/Edit Ansicht |
| `src/components/finance/CreateInvoiceDialog.tsx` | Anpassung (optional, bleibt fuer manuelle Eingabe) |

## 5. Performance-Massnahmen

- **Pagination**: `.range(offset, offset+limit)` + Count-Header
- **Indizes**: `(building_id, status)`, `(created_at DESC)` fuer schnelle Filterung
- **Lazy Loading**: PDF-Preview nur bei Klick laden (signierte URL on-demand)
- **Optimistic Updates**: Status-Aenderungen sofort im UI, Rollback bei Fehler
- **Query-Keys**: Granular (`["invoices", buildingId, status, page]`) damit nur betroffene Seiten invalidiert werden

