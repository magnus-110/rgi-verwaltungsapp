## Problem
Im Rechnungs-Editor gibt es aktuell nur:
- „Als Entwurf speichern" (kein Render)
- „Versenden (PDF erzeugen)" (setzt Status auf `sent` — will man beim Entwurf prüfen nicht)

Im Listen-View gibt es einen Render-Button (♻️), aber:
- Nur PDF-Download sichtbar (DOCX wird gerendert, aber nirgends verlinkt)
- Aus dem Editor heraus nicht erreichbar

## Lösung

### 1. Editor: „Vorschau erzeugen" Buttons
Im `DialogFooter` von `InvoiceEditorDialog.tsx` zwei zusätzliche Buttons neben „Als Entwurf speichern":
- **PDF-Vorschau** — speichert als Draft, ruft `rgi-render-invoice` auf, öffnet PDF in neuem Tab
- **DOCX herunterladen** — speichert als Draft, ruft `rgi-render-invoice` auf, lädt DOCX

Beides ändert den Status **nicht** auf `sent`. Erst der explizite „Versenden"-Button tut das.

### 2. Liste: DOCX-Button ergänzen
In `InvoicesTab.tsx` neben dem PDF-Download (`pdf_storage_path`) auch einen Button für `docx_storage_path` zeigen (Icon: FileType, gleicher `rgiSignedUrl`-Mechanismus, Bucket `rgi-invoices`).

### 3. Hilfsfunktion
`rgiRenderInvoice` gibt bereits `{ docx_path, pdf_path }` zurück (siehe edge function). Im Editor nach Render entsprechend `rgiSignedUrl("rgi-invoices", path)` aufrufen und `window.open` bzw. `<a download>` triggern.

## Geänderte Dateien
- `src/components/rgi-intern/invoices/InvoiceEditorDialog.tsx` — 2 neue Footer-Buttons + Handler
- `src/components/rgi-intern/invoices/InvoicesTab.tsx` — DOCX-Download-Button in der Zeile

Keine Migration, keine Edge-Function-Änderung nötig — die DOCX wird bereits generiert und gespeichert.
