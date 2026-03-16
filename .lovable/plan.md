

## Problem

Die `analyze-document` Edge Function nutzt `mistral-small-latest` ueber die Chat-Completions-API mit base64-encodiertem PDF als `image_url`. Dieses Modell kann keine PDFs als Bild verarbeiten -- daher schlaegt die OCR fehl und es wird kein Text extrahiert.

Die anderen funktionierenden Functions (`process-building-file`, `process-knowledge-document`) nutzen die dedizierte **Mistral OCR API** (`/v1/ocr` mit `mistral-ocr-latest`).

## Loesung

Die OCR-Logik in `analyze-document` auf die Mistral OCR API umstellen:

### `supabase/functions/analyze-document/index.ts`

1. **Signed URL statt base64**: Statt die Datei herunterzuladen und base64 zu encodieren, eine Signed URL fuer den Storage-Pfad erstellen (wie in `process-building-file`)
2. **Mistral OCR API nutzen**: `POST /v1/ocr` mit `model: "mistral-ocr-latest"` und `document_url` statt Chat-Completions mit `image_url`
3. **OCR-Ergebnis parsen**: Pages-Array auslesen und Markdown/Text zusammenfuehren
4. **Analyse-Schritt beibehalten**: Der zweite Mistral-Call fuer die inhaltliche Analyse bleibt unveraendert

### Aenderungen im Detail

```text
VORHER:
  Download -> base64 -> chat/completions (mistral-small) mit image_url -> FAIL

NACHHER:
  Signed URL erstellen -> /v1/ocr (mistral-ocr-latest) mit document_url -> Text extrahiert
  -> chat/completions (mistral-small) fuer Analyse -> Antwort
```

Nur eine Datei betroffen: `supabase/functions/analyze-document/index.ts`

