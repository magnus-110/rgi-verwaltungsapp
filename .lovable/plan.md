## Problem

Belege mit Datei-Endung `.PDF` (Großbuchstaben) landen im Storage als `application/octet-stream`. Der bisherige Fix hängt `?response-content-type=application/pdf&response-content-disposition=inline` an die Signed URL an — aber Supabase Storage **ignoriert** diese Query-Parameter (das sind AWS-S3-spezifische Overrides, der Supabase-Proxy leitet sie nicht weiter). Der Browser sieht weiterhin `octet-stream` und triggert im `<iframe>` einen Download statt einer Anzeige.

## Lösung

Statt zu versuchen, den Content-Type per URL zu overriden, laden wir das PDF per `fetch` in einen **Blob** und erzeugen daraus eine `blob:`-URL mit erzwungenem MIME-Typ `application/pdf`. Genau das Muster verwendet bereits `src/components/documents/PdfViewerModal.tsx` erfolgreich.

### Änderungen in `src/components/finance/BookingReviewDialog.tsx`

1. `forceInlinePdf(url)` → ersetzen durch `toInlinePdfBlobUrl(signedUrl)`:
   - `fetch(signedUrl)` → `response.blob()`
   - `new Blob([blob], { type: "application/pdf" })` (MIME-Typ erzwingen, unabhängig vom Server-Header)
   - `URL.createObjectURL(...)` zurückgeben.
2. In den beiden `useEffect`/Loader-Blöcken (Beleg + verknüpfte Rechnung):
   - Signed URL holen wie bisher.
   - Anschließend `toInlinePdfBlobUrl` aufrufen und das Ergebnis in `setPdfUrl` / `setTemplateInvoiceUrl` speichern.
   - Bei Cleanup / Wechsel `URL.revokeObjectURL(...)` aufrufen, damit keine Blobs leaken.
3. Fehler beim Fetch abfangen und in `pdfError` / `templateInvoiceError` anzeigen (inkl. Fallback-Button „PDF extern öffnen", der die originale Signed URL in neuem Tab öffnet).

### Änderungen in `supabase/functions/audit-signed-url/index.ts`

Der bisherige Query-Param-Anhang bringt nichts und wird entfernt (der Client baut sich den Blob-URL clientseitig aus der reinen Signed URL). Damit ist die Funktion wieder minimal.

### Änderungen in `src/components/finance/CashAuditDocuments.tsx` (Token- & Owner-Modus)

Aktuell öffnet der Kassenprüfer-View PDFs per `window.open(signedUrl)` in einem neuen Tab. Das funktioniert bei `octet-stream` browserabhängig auch als Download. Fix:
- Neuer Helper `openPdfInline(signedUrl, fileName)`: `fetch` → `Blob({type:"application/pdf"})` → `createObjectURL` → `window.open(blobUrl)`. Für Nicht-PDF-Dateien (Endungs-Check) weiterhin direkt `window.open`.
- `openViaToken` und `openViaStorage` nutzen diesen Helper.

## Warum das jetzt funktioniert

Der Blob wird clientseitig mit fest `type: "application/pdf"` erstellt. Der Browser rendert Blobs nach ihrem eigenen MIME-Typ — der ursprüngliche `Content-Type`-Header des Storage-Objekts ist nicht mehr relevant. Damit werden `.PDF`-Dateien und alle Uploads ohne korrekten Content-Type zuverlässig inline angezeigt.

## QA

Nach der Änderung: Buchung Tirolerstr. 14 / 09.06.2026 (`RG212043.PDF`) öffnen — Vorschau muss inline erscheinen, kein Download. Zusätzlich Kassenprüfer-Ansicht Birkenweg 6 prüfen (Owner-Login und Token-Link).
