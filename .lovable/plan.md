# Problem-Analyse

Beim Klick auf „Als DOCX" im Rechnungseditor (`InvoiceEditorDialog.previewRender("docx")`) passieren zwei unschöne Dinge:

1. **Leerer about:blank-Tab**: Wir öffnen synchron `window.open("", "_blank")` (Zeile 219), bevor der Render läuft. Wenn der Render scheitert, bleibt der leere Tab sichtbar.
2. **„Rendering fehlgeschlagen"** obwohl die Vorlage korrekt ist: Die Edge Function `rgi-render-invoice` rendert IMMER zuerst die DOCX und konvertiert dann via CloudConvert nach PDF. Schlägt der **PDF-Schritt** fehl (CloudConvert-Quota, Netzwerk-Timeout, LibreOffice-Engine-Hänger), bekommt der Client einen 500er — **obwohl die DOCX bereits in Storage liegt**. Damit ist auch der DOCX-Download für den Nutzer „kaputt".

Die hochgeladene `Rechnungsvorlage.docx` rendert in der lokalen docxtemplater-Probe problemlos. Die Vorlage ist also nicht das Problem — es ist die unnötige Kopplung von DOCX an PDF + die Tab-Öffnung-vor-Await-Logik.

# Plan

## 1. Edge Function `rgi-render-invoice` — Formate selektiv erzeugen

- Neuer optionaler Body-Parameter `formats: ("docx" | "pdf")[]` (Default: `["docx","pdf"]` für Rückwärtskompatibilität).
- DOCX wird immer gerendert und hochgeladen.
- PDF nur wenn `formats` `"pdf"` enthält. Schlägt die PDF-Konvertierung fehl, wird die DOCX trotzdem als Erfolg zurückgegeben — mit `pdf_error` im Response statt 500er.
- Response weiterhin `{ ok, docx_path, pdf_path?, pdf_error? }`.

## 2. `rgiRenderInvoice` (Hook) — Formate durchreichen

- Signatur erweitern: `rgiRenderInvoice(invoiceId, formats?)`.
- Default unverändert (beide Formate), damit bestehende Aufrufstellen (z.B. „PDF erzeugen"-Button in `InvoicesTab`) funktionieren.

## 3. `InvoiceEditorDialog.previewRender(format)` — sauberer Download

- **`window.open("", "_blank")` entfernen** (kein about:blank mehr).
- Nur das angefragte Format anfordern: `rgiRenderInvoice(id, [format])`.
- Statt Tab-Redirect ein klassischer Browser-Download: Signed URL holen → `fetch` → Blob → `<a download>` programmatisch klicken (analog zu `ProtocolDownloadButtons.tsx`, dort bewährt). Damit kein Popup-Blocker-Problem und kein leerer Tab.
- Fehler-Toast unverändert, aber ohne `win.close()`-Logik.

## 4. `InvoicesTab` Word-Button — gleiche Download-Logik

- `openPdf(inv.docx_storage_path!)` (öffnet DOCX in neuem Tab → Browser bietet meist nur „Speichern unter" an, je nach Browser teils about:blank) ersetzen durch denselben Blob-Download-Helper. Bei PDF darf der Tab bleiben (PDF-Inline-Viewer ist gewünscht).

## Technische Details

- Datei `supabase/functions/rgi-render-invoice/index.ts`: ~10 Zeilen — `formats`-Parsing, `if (formats.includes("pdf"))` um den CloudConvert-Block, `try/catch` um den PDF-Schritt mit `pdfError`-Variable.
- Datei `src/hooks/useRgi.ts`: `rgiRenderInvoice(invoiceId, formats?: ("docx"|"pdf")[])`, Body um `formats` ergänzen, Rückgabetyp `{ docx_path: string; pdf_path?: string; pdf_error?: string }`.
- Datei `src/components/rgi-intern/invoices/InvoiceEditorDialog.tsx`: `previewRender` umbauen (kein `window.open`, Blob-Download), Aufruf `rgiRenderInvoice(id!, [format])`. Bei `pdf_error` einen Warn-Toast zeigen.
- Datei `src/components/rgi-intern/invoices/InvoicesTab.tsx`: Kleinen `downloadBlob(path)`-Helper für DOCX, PDF-Verhalten unverändert.

## Out of scope

- Keine Vorlagen-Änderung — die hochgeladene Vorlage funktioniert.
- Kein Refactoring der CloudConvert-Logik selbst.
- Keine Änderung an Storage-Buckets/Policies.
