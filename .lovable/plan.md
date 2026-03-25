

# Plan: E-Mail-Anhänge als Rechnungen in Finanzen importieren

## Konzept
PDF-Anhänge in der E-Mail-Detailansicht bekommen einen "Als Rechnung importieren"-Button. Per Klick wird der Anhang aus dem `email-attachments` Storage geladen, in den `invoices` Bucket kopiert, ein Rechnungsdatensatz erstellt und die OCR-Erkennung gestartet — genau wie beim Upload auf der Finanzseite.

**Warum Button statt Drag & Drop:** Echtes Drag & Drop zwischen zwei verschiedenen Seiten (Postfach → Finanzen) ist technisch nicht möglich, da der Seitenwechsel den Drag-Vorgang abbricht. Stattdessen wird ein dedizierter Import-Button direkt am Anhang angeboten — ein Klick genügt.

## Umsetzung

### 1) EmailAttachments.tsx erweitern
- Neben dem Download-Button einen neuen "Rechnung importieren"-Button (FileText + Sparkles Icon) für PDF-Anhänge anzeigen.
- Beim Klick:
  1. Signierte URL des Anhangs aus `email-attachments` Bucket holen
  2. Datei herunterladen (fetch)
  3. In `invoices` Bucket hochladen (Pfad: `unassigned/{timestamp}_{filename}`)
  4. `invoices`-Datensatz erstellen (status: open, ocr_status: pending)
  5. `extract-invoice` Edge Function aufrufen (OCR + Liegenschaftserkennung)
  6. Toast-Meldung mit Erfolg und Link zur Finanzseite
- Button wird disabled/loading während des Imports
- Bereits importierte Anhänge erkennen (optional: über `file_name` Match in invoices)

### 2) Betroffene Dateien
- `src/components/email/EmailAttachments.tsx` — Import-Button + Logik hinzufügen

### Technische Details
- Kein neues Backend nötig: alle Operationen (Storage copy, DB insert, Edge Function invoke) laufen über den bestehenden Supabase Client
- Die Logik ist identisch mit `InvoiceDropZone.uploadFile`, nur dass die Quelle ein Storage-Blob statt ein lokaler File ist
- OCR + automatische Liegenschaftserkennung funktionieren wie gewohnt

