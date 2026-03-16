

## Plan: Dokument-Upload und KI-Analyse in Nova

### Ziel
Im Nova-Chat soll der Admin ein Dokument (PDF) direkt hochladen und von Mistral AI analysieren lassen koennen -- z.B. eine Abrechnung pruefen, eine Rechnung zusammenfassen, etc. Dies ist eine Ad-hoc-Analyse, nicht das Hinzufuegen zum RAG-Wissensbestand.

### Funktionsweise

1. **Neuer Menuepunkt im Plus-Menu**: "Dokument analysieren" mit Datei-Upload (PDF)
2. **Upload-Flow**: Datei wird in den bestehenden `building-documents` Bucket hochgeladen, dann per Edge Function an Mistral OCR gesendet
3. **Neue Edge Function `analyze-document`**: Nimmt die hochgeladene Datei, extrahiert Text via Mistral OCR, sendet den Text zusammen mit der Nutzerfrage an Mistral Large zur Analyse
4. **Chat-Integration**: Die Antwort erscheint als normale Assistenten-Nachricht im Chat, mit Hinweis auf das analysierte Dokument

### Aenderungen

**1. Neue Edge Function: `supabase/functions/analyze-document/index.ts`**
- Empfaengt: `filePath` (Storage-Pfad), `question` (optionale Nutzerfrage), `sessionId`
- Laedt die Datei aus Storage, sendet an Mistral OCR (`pixtral-large-latest` mit document_url)
- Sendet extrahierten Text + Frage an Mistral Large fuer Analyse
- Speichert Nachrichten in `document_chat_messages`
- Gibt strukturierte Antwort zurueck

**2. `src/components/documents/ChatInputField.tsx`**
- Neuer Menuepunkt "Dokument analysieren" im Plus-Menu (zwischen Tiefenrecherche und Prompt-Vorlagen)
- Klick oeffnet einen versteckten File-Input (nur PDF)
- Nach Dateiauswahl: Datei wird hochgeladen, Badge "Dokument angehaengt" erscheint ueber dem Input
- Beim Senden wird statt `query-documents` die neue `analyze-document` Function aufgerufen

**3. `src/pages/Documents.tsx`**
- `handleSend` erweitern: Wenn ein Dokument angehaengt ist, `analyze-document` statt `query-documents` aufrufen
- Neues State-Feld `attachedFile` durchreichen

**4. `supabase/config.toml`**
- Neue Function `analyze-document` mit `verify_jwt = true` registrieren

### Ablauf

```text
Admin klickt "+" -> "Dokument analysieren" -> waehlt PDF
  |
  v
Badge "Dokument.pdf angehaengt" erscheint ueber Input
  |
  v
Admin tippt Frage (z.B. "Fasse diese Abrechnung zusammen")
  |
  v
Datei wird in Storage hochgeladen
  |
  v
Edge Function: OCR via Mistral -> Text + Frage -> Mistral Large
  |
  v
Antwort erscheint als Chat-Nachricht
```

### Technische Details
- Mistral OCR nutzt `pixtral-large-latest` mit base64-encodiertem PDF
- Maximale Dateigroesse: 20MB (Storage-Limit)
- Temporaerer Upload-Pfad: `analysis/{timestamp}_{filename}`
- Die Datei wird nach Analyse nicht geloescht (kann spaeter fuer Referenz genutzt werden)

