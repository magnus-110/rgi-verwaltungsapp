# Warum fehlen OCR & Chunks bei den Teilungserklärungen?

## Befund (DB-Abfrage)

| Datei | Größe | extracted_text | rag_enabled | Chunks |
|---|---|---|---|---|
| Aufteilungspläne.pdf | 11,5 MB | NULL | true | 0 |
| NW8 830930 Änderung Teilung.pdf | 1,6 MB | NULL | true | 0 |
| NW8 830405 Teilung.pdf | 7,5 MB | NULL | true | 0 |
| Aufteilungspläne.pdf (Dublette) | 11,5 MB | NULL | false | 0 |

Alle drei Haupt-Dokumente wurden am **29.04.2026 zwischen 15:40–15:45 Uhr** in schneller Folge hochgeladen. In den Edge-Function-Logs für `process-building-file` ist **kein einziger Eintrag** vorhanden — d.h. die OCR-Verarbeitung wurde entweder nie aufgerufen oder hat den Function-Cold-Start nie überlebt.

## Ursachen (sortiert nach Wahrscheinlichkeit)

1. **Fire-and-forget-Invocation im Upload-Dialog.** In `UploadDocumentDialog.tsx`, `FileUploadDialog.tsx`, `FileDropCard.tsx` und `SaveAttachmentToBuildingDialog.tsx` wird nach dem Insert so aufgerufen:
   ```ts
   supabase.functions.invoke('process-building-file', { body: { fileId } })
     .catch(err => console.error(...));
   ```
   Das Promise wird **nicht awaited**. Beim Schließen des Dialogs / Navigieren wird der `fetch` im Browser abgebrochen, bevor der Edge-Function-Boot abgeschlossen ist. Bei 3 PDFs hintereinander (parallel-invoke, Dialog schließt sofort) trifft das alle drei.

2. **Cold-Start + 150s-Limit bei großen PDFs.** 11,5 MB gescannte Bauzeichnungen → Mistral-OCR-Roundtrip kann >2 min dauern. Selbst wenn der Call reinläuft, kann die Function ohne Background-Task-Pattern (`EdgeRuntime.waitUntil`) abgewürgt werden.

3. **Kein Retry / kein Status-Tracking.** `building_files` hat kein `processing_status`-Feld. Wenn die Function still scheitert, sieht weder UI noch Nutzer, dass etwas hängt. Aktuell „erkennt" nur eine Logik den Fehler: `extractedText.length < 30 → rag_enabled = false` — aber das setzt voraus, dass die Function überhaupt durchläuft.

## Geplante Behebung

### 1. Sofort-Reparatur der 3 betroffenen Dateien
Nach Switch in Build-Mode einmal `process-building-file` mit `{ fileId, force: true }` pro Datei aufrufen (server-seitig, blockierend) und prüfen, ob OCR sauber durchläuft. Falls Aufteilungspläne tatsächlich nur Pixel-Grafiken ohne Text enthalten, dokumentieren wir das (kein Bug — RAG hat dann nichts zu indexieren).

### 2. Robuste Hintergrund-Verarbeitung (Edge Function)
`supabase/functions/process-building-file/index.ts`:
- `EdgeRuntime.waitUntil(processFile(...))` verwenden und sofort `202 Accepted` antworten → Function läuft auch nach Client-Disconnect weiter.
- Beim Start: `processing_status = 'processing'` setzen; bei Fehler: `'failed'` + `processing_error`; bei Erfolg: `'done'`.
- Retry-Wrapper für Mistral-OCR (2 Versuche mit Backoff, konsistent mit unserer RAG-API-Resilience-Memory).

### 3. Migration: Status-Spalten + Backfill-View
```sql
ALTER TABLE public.building_files
  ADD COLUMN IF NOT EXISTS processing_status text
    DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','done','failed','skipped')),
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;
```
Bestehende Datensätze: wo `extracted_text IS NOT NULL` → `'done'`, sonst `'pending'`.

### 4. Reprocess-Button im DMS
In `DocumentDetailPanel.tsx` (es gibt dort schon einen `process-building-file`-Aufruf): Badge mit Status (`pending`/`processing`/`failed`) + Button „OCR erneut starten" (`force: true`). Für Admins sichtbar, damit Regina/Maxi solche Karteileichen selbst reparieren können.

### 5. Cron-Backfill (optional, klein)
pg_cron-Job 1×/Stunde: alle `building_files` mit `processing_status = 'pending'` und Alter >5 min via `net.http_post` an `process-building-file` schicken (max 5 pro Lauf, um Mistral-Quota zu schonen — passt zu unserer RAG-Cost-Protection-Memory).

## Technische Details (kurz)

- Background-Task-Muster: siehe Deno-Doku `EdgeRuntime.waitUntil` — bereits in anderen Functions im Projekt verwendet (z.B. `fetch-emails`).
- Keine Schema-Änderung an `document_chunks` nötig — dort ist alles korrekt.
- Frontend-Aufrufer (`UploadDocumentDialog`, `FileUploadDialog`, `FileDropCard`, `SaveAttachmentToBuildingDialog`) bleiben fire-and-forget, weil die Function jetzt zuverlässig im Hintergrund läuft.

## Geänderte Dateien

- `supabase/functions/process-building-file/index.ts` — waitUntil + Status-Tracking + Retry
- Neue Migration für `processing_status`-Spalten + Backfill
- `src/components/buildings/documents/DocumentDetailPanel.tsx` — Status-Badge + Reprocess-Button
- (optional) `supabase/migrations/...` pg_cron-Job
