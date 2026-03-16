

## Plan: Temporaere Dokument-Analyse (kein dauerhaftes Speichern)

### Problem
Hochgeladene Analyse-Dokumente werden dauerhaft im `building-documents` Bucket gespeichert. Sie gehen zwar nicht in die RAG-Datenbank, bleiben aber als Dateien bestehen.

### Loesung
Die Edge Function `analyze-document` loescht die Datei direkt nach erfolgreicher OCR-Extraktion aus dem Storage. Der extrahierte Text und die Analyse-Antwort bleiben im Chat-Verlauf erhalten.

### Aenderung

**`supabase/functions/analyze-document/index.ts`**

Nach dem OCR-Schritt und vor/nach der Analyse-Antwort:

```typescript
// Nach erfolgreicher OCR: Datei aus Storage loeschen
await supabase.storage
  .from("building-documents")
  .remove([filePath]);
console.log(`Temporary file deleted: ${filePath}`);
```

Das wird direkt nach dem OCR-Response-Parsing eingefuegt (ca. Zeile 115, nach `extractedText = extractedText.trim()`).

### Ergebnis
- Datei wird hochgeladen -> OCR -> sofort geloescht
- Chat-Nachricht mit Analyse bleibt im Verlauf (30-Tage Retention der Chat-Sessions)
- Kein Einfluss auf RAG/Wissensbestand
- Nur 1 Datei betroffen

