

## Plan: Multi-Dokument-Upload und Vergleichsanalyse

### Aktueller Stand
Derzeit kann nur **eine einzelne Datei** pro Nachricht hochgeladen werden. Die Edge Function `analyze-document` verarbeitet genau ein Dokument.

### Ziel
Mehrere Dokumente (z.B. Kontenblaetter + Abrechnungen) gleichzeitig hochladen, damit Nova diese abgleichen und Unstimmigkeiten finden kann.

### Aenderungen

**1. `src/components/documents/ChatInputField.tsx`**
- `attachedFile` (single) zu `attachedFiles: File[]` (array) aendern
- File-Input auf `multiple` setzen
- Badge zeigt Anzahl der Dateien oder Liste der Dateinamen
- Beim Senden: alle Dateien nacheinander in Storage hochladen, dann alle Pfade an die Edge Function senden

**2. `src/pages/Documents.tsx`**
- `handleSend` anpassen: statt einem `attachedFile` ein Array `attachedFiles` mit mehreren `{ file, storagePath }` Objekten
- Alle Dateien an `analyze-document` senden

**3. `supabase/functions/analyze-document/index.ts`**
- Neuen Parameter `files` (Array von `{ filePath, fileName }`) akzeptieren, zusaetzlich zum bestehenden `filePath`/`fileName` fuer Rueckwaertskompatibilitaet
- OCR fuer jedes Dokument einzeln ausfuehren
- Alle extrahierten Texte zusammenfuehren mit klarer Kennzeichnung pro Dokument
- Im Analyse-Prompt explizit darauf hinweisen, dass mehrere Dokumente verglichen werden sollen
- Alle temporaeren Dateien nach OCR loeschen

### Ablauf

```text
Admin klickt "+" -> "Dokument analysieren" -> waehlt 2+ PDFs
  |
  v
Badges zeigen "Kontenblatt.pdf, Abrechnung.pdf"
  |
  v
Admin tippt: "Vergleiche diese Dokumente und finde Unstimmigkeiten"
  |
  v
Alle Dateien werden in Storage hochgeladen
  |
  v
Edge Function: OCR pro Datei -> Texte zusammenfuehren -> Analyse-Prompt
  |
  v
Antwort mit Vergleich und gefundenen Unstimmigkeiten
```

### Technische Details
- Maximale Anzahl Dateien: 5 (um Token-Limits nicht zu sprengen)
- Jedes Dokument wird separat per Mistral OCR verarbeitet
- Die Texte werden im Analyse-Prompt klar getrennt: `--- Dokument 1: Kontenblatt.pdf ---` etc.
- Analyse-Modell bleibt `mistral-small-latest` mit erhoehtem `max_tokens: 12000` fuer Multi-Dokument-Antworten
- Rueckwaertskompatibilitaet: einzelner `filePath` Parameter funktioniert weiterhin

