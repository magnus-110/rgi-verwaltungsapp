## Ziel
Die in der App erfassten Unterschriften (Versammlungsleiter, Protokollführer, Eigentümer) sollen automatisch im generierten Protokoll erscheinen – nicht erst nach dem separaten „Final signieren & im DMS ablegen"-Schritt.

## Heutiger Stand
- `etv_protocol_signatures` enthält Rolle, Name und Signatur-PNG (Base64).
- `supabase/functions/etv-render-protocol` rendert DOCX aus Template → PDF via CloudConvert. **Unterschriften werden ignoriert.**
- `supabase/functions/etv-finalize-signed-protocol` hängt mit `pdf-lib` eine Unterschriftenseite an – wird aber nur beim „Final signieren"-Workflow ausgeführt.

## Änderung
**`supabase/functions/etv-render-protocol/index.ts`**
- Nach Erstellung der PDF (vor dem Upload nach `building-files`) Signaturen für `meeting_id` aus `etv_protocol_signatures` laden.
- Falls mindestens eine Unterschrift vorhanden ist, mit `pdf-lib` eine A4-Signaturseite anhängen (gleiches Layout wie in `etv-finalize-signed-protocol`: Titel „Unterschriften", drei Blöcke mit Rolle, Bild, Name, Datum-Linie).
- PDFs ohne Signaturen bleiben unverändert.
- DOCX-Output bleibt unverändert (Bild-Einbettung in Docxtemplater ist ohne Image-Modul nicht zuverlässig); ein kleiner Hinweis in den Render-Optionen ist nicht nötig.

Keine Änderungen an der UI, am Template, am Datenmodell oder am Finalize-Flow. Die „Final signieren & im DMS ablegen"-Aktion behält ihre Funktion (versiegelte Ablage im DMS).
