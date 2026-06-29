## Problem

Die Doc-Generierung schlägt fehl, weil die Word-Vorlage einen Tag-Mismatch enthält:

```
Closing tag does not match opening tag
openingtag: "ergebnis_gruen"
closingtag: " ergebnis_gruen"   ← Leerzeichen
```

docxtemplater bricht ab → `service_orders.status` bleibt `paid`, `document_error` wird gesetzt, aber der Success-Screen pollt endlos.

Es gibt zwei unabhängige Themen:

### A) Vorlage tolerant einlesen (Code-Fix)
Bevor das DOCX an docxtemplater geht, normalisieren wir Whitespace **innerhalb** unserer `{...}`-Tags in `word/document.xml` (und Header/Footer), damit Tippfehler wie `{/ ergebnis_gruen}`, `{# ergebnis_gruen }` oder `{ mieter_name }` nicht mehr zum Abbruch führen.

Umsetzung in `supabase/functions/generate-service-document/index.ts`:
1. Vor `new Docxtemplater(zip, …)` die relevanten XML-Dateien des Zips lesen.
2. Per Regex `\{\s*([#/^]?)\s*([a-zA-Z0-9_]+)\s*\}` zu `{$1$2}` ersetzen — entfernt nur Whitespace direkt nach `{` / vor `}` und um den Section-Marker. Andere Inhalte (Word-XML-Tags zwischen Wörtern) bleiben unberührt.
3. Zip mit normalisierten XMLs neu setzen, dann rendern.

Zusätzlich Fehler sichtbar machen: bei `TemplateError` schreiben wir `status='document_error'` (statt es auf `paid` zu lassen) und speichern eine lesbare Meldung in `document_error`. Der Success-Screen soll diese Fehlermeldung anzeigen statt endlos zu spinnen.

### B) Success-Screen: Timeout + Fehleranzeige
In `src/pages/weg-owner/ServiceHubSuccess.tsx`:
- Wenn `status === 'document_error'` oder `document_error` gesetzt → klare Fehlermeldung statt Spinner, plus „Erneut versuchen"-Button, der `generate-service-document` neu antriggert.
- Nach z. B. 90 s ohne `document_ready` ebenfalls Hinweis anzeigen („Bitte Support kontaktieren / erneut versuchen").

### C) Hängende Bestellung jetzt freischalten
Die aktuelle Bestellung steht auf `paid` ohne Dokument. Sobald A) deployt ist, kann ein einmaliger Re-Trigger von `generate-service-document` für diese `order_id` das Dokument nachträglich erzeugen. Ich packe einen „Erneut versuchen"-Button (siehe B) in den Success-Screen, der genau das tut – kein manueller SQL-Eingriff nötig.

### D) Empfehlung an dich (kein Code)
In der Word-Vorlage den Block-Tag korrigieren: aus `{/ ergebnis_gruen}` → `{/ergebnis_gruen}` (und alle ähnlich falsch gesetzten Tags). A) ist nur die Sicherheitsnetz-Lösung; eine saubere Vorlage ist langfristig besser.

## Dateien

- `supabase/functions/generate-service-document/index.ts` — Pre-Processing der Template-XMLs + Fehler-Status setzen
- `src/pages/weg-owner/ServiceHubSuccess.tsx` — Fehleranzeige + Retry-Button + Soft-Timeout

Keine DB-Migration nötig (Spalten `document_error`, `status` existieren bereits).
