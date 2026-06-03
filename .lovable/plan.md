## Ziel

In **Buchen → Kontoauszüge** zwei klar getrennte Upload-Buttons. CAMT-XML wird wie bisher ausgelesen (Transaktionen), erscheint aber **nicht** mehr in der Liste „Importierte Auszüge". PDFs werden **nur gespeichert** (keine OCR mehr), in „Importierte Auszüge" angezeigt **und** automatisch in der Kassenprüfung als Kontoauszug-Beleg sichtbar.

## Änderungen

### 1. Upload-UI (`BankStatementsTab.tsx`)
- Statt einem Button zwei Buttons im Header:
  - **„CAMT-XML importieren"** (Icon `FileCode`) — `accept=".xml"` → ruft Edge Function `parse-bank-statement`.
  - **„PDF-Beleg hochladen"** (Icon `FileText`) — `accept=".pdf"` → lädt direkt in Storage hoch und legt eine `bank_statements`-Zeile mit `source_format='pdf'`, `file_path`, `file_name`, `building_id`, `fiscal_year` an. **Kein** Aufruf von `parse-bank-statement-pdf` mehr.
- `handleFileUpload` wird in zwei Handler aufgeteilt (CAMT / PDF).
- Toasts entsprechend ("CAMT importiert: x Transaktionen" / "PDF gespeichert").

### 2. Liste „Importierte Auszüge"
- Query filtert auf `source_format = 'pdf'`, sodass CAMT-Importe dort nicht mehr auftauchen.
- CAMT-Badge/Icon-Logik entfällt im Item-Render (immer PDF).
- Lösch-Button für PDFs (entfernt Storage-Datei + Zeile).

### 3. Storage
- PDFs werden in den vorhandenen Storage-Bucket gelegt, den der bisherige PDF-Pfad auch verwendet (`bank-statements`). Bucket existiert bereits — wird nicht neu erstellt.
- Bei Löschung wird die Datei mit entfernt.

### 4. Kassenprüfung (`CashAuditDocuments.tsx`)
- Sektion „Kontoauszüge" zieht zusätzlich zu `cash_audit_statements` automatisch die PDFs aus `bank_statements` für `buildingId + fiscalYear` mit `source_format='pdf'`.
- Anzeige als gemeinsame Liste (mit Quellen-Badge „Auto" für die aus Kontoauszüge stammenden, damit klar ist, dass sie nicht aus dem Audit-Upload kommen).
- Öffnen via `openViaStorage('bank-statements', file_path, file_name)` für Admin-Modus; für Token-Modus (externer Prüfer) wird die bestehende `audit-signed-url` Edge Function um `kind: "bank_statement_pdf"` erweitert, oder einfacher: neue RPC `get_audit_bank_statement_pdfs_by_token(p_token)` analog zu `get_audit_pdf_statements_by_token`.

### 5. Edge Function `parse-bank-statement-pdf`
- Bleibt vorerst bestehen (nicht aufgerufen), wird in dieser Iteration **nicht** gelöscht (Rückwärtskompatibilität).

## Technische Details

- Datenbank: keine Schema-Änderungen nötig — `bank_statements.source_format`, `file_path`, `fiscal_year` existieren bereits.
- Neue RPC + Edge-Function-Erweiterung für externen Prüfer-Token (Lesezugriff auf `bank_statements`-PDFs für eine Kassenprüfung).
- Bestehender PDF-Upload-Code/State (`uploadProgress`, `fileToBase64`) wird für direkten Storage-Upload wiederverwendet.

## Nicht Teil dieser Iteration

- Keine OCR-Verarbeitung von PDFs mehr.
- Keine Veränderung am CAMT-Parsing.
- Keine Migration bisheriger PDF-Bank-Statements — werden weiterhin angezeigt (haben bereits `source_format='pdf'` + `file_path`).
