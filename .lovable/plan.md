## Problem

Beim Klick auf bestimmte Buchungen (Beispiel: Tirolerstr. 14, WJ 2026, 09.06.2026, 380,80 €, Beleg `RG212043.PDF`) startet der Browser sofort einen Download der Rechnung und die Vorschau im Buchungsdialog bleibt leer.

**Ursache:** Die Datei liegt im `invoices`-Bucket mit einem fehlenden oder falschen `content-type` (vermutlich `application/octet-stream`, weil sie mit Großbuchstaben-Endung `.PDF` hochgeladen wurde und der Upload keinen expliziten `contentType` gesetzt hat). Ohne `content-type: application/pdf` interpretiert der Browser die Datei nicht als PDF und lädt sie beim Einbetten in ein `<iframe>` herunter, statt sie inline anzuzeigen.

## Fix

Signed URLs für Rechnungs-PDFs so erzeugen, dass der Server beim Ausliefern **immer** `Content-Type: application/pdf` und `Content-Disposition: inline` mitschickt — egal, was ursprünglich gespeichert wurde. Supabase Storage unterstützt dafür Query-Parameter am Signed-URL-Response.

Konkret an die Signed URL anhängen:

```
?...&response-content-type=application/pdf&response-content-disposition=inline
```

### Betroffene Stellen

An diesen Stellen wird eine Signed URL aus dem `invoices`-Bucket direkt in ein `<iframe>` geladen und braucht den Fix:

1. `src/components/finance/BookingReviewDialog.tsx`
   - `pdfUrl` (Zeile ~98–104) — Haupt-Beleg
   - `templateInvoiceUrl` (Zeile ~159–173) — verknüpfte Rechnung aus Buchungsvorlage, sowohl Token- als auch Admin-Pfad
2. Wenn `audit-signed-url` (Edge Function für Token-Modus in der Kassenprüfung) die gleiche Signed URL zurückgibt, dort denselben Query-String an die zurückgegebene URL anhängen, damit Owner-Token-Zugriffe ebenfalls inline öffnen.

Nur der Rendering-/URL-Bau-Pfad wird angefasst — keine Datenmigration, keine Änderungen am Upload-Flow, keine Änderungen an bestehenden Dateien.

### Umsetzung (Detail)

Kleine Helper-Funktion in `BookingReviewDialog.tsx` (oder in einer geteilten Utility, wenn sinnvoll):

```ts
function forceInlinePdf(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}response-content-type=application/pdf&response-content-disposition=inline`;
}
```

Und in beiden `setPdfUrl(...)` / `setTemplateInvoiceUrl(...)` -Aufrufen:

```ts
setPdfUrl(forceInlinePdf(data.signedUrl));
```

Für die Token-Variante (Edge Function `audit-signed-url`): entweder in der Edge Function selbst die Query-Parameter an die zurückgegebene URL anhängen (bevorzugt, damit auch andere Aufrufer profitieren), oder im Frontend nach Erhalt der URL mit derselben `forceInlinePdf`-Funktion nachbearbeiten.

## Was der Fix bewusst NICHT tut

- Keine Migration bestehender Dateien und keine Neuberechnung/Reset von `content-type` im Storage.
- Kein Eingriff in Upload-Pfade (falsch gesetzter MIME beim Upload bleibt bestehen — spielt aber keine Rolle mehr, weil die Anzeige den Type überschreibt).
- Keine Änderungen an Buchungslogik, Kassenprüfung-Datenmodell oder Detailanzeige links.

## Erwartetes Ergebnis

Nach dem Fix öffnet ein Klick auf jede Buchung mit hinterlegtem Rechnungs-PDF (auch `RG212043.PDF`) die Vorschau direkt inline im Dialog — kein automatischer Download mehr.
