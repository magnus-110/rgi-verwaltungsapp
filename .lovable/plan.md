## Rechnungs-OCR debuggen

E-Mail-KI funktioniert wieder, aber `extract-invoice` läuft nicht. Logs der Function sind komplett leer → die Function wird gar nicht erst aufgerufen, oder existierende Rechnungen hängen mit `ocr_status='pending'` aus der 401-Phase fest.

### Diagnose-Schritte (Build-Mode)

1. **DB-Check**: Wie viele `invoices` haben aktuell `ocr_status` in `('pending', 'processing', 'error')`? Sind das die Rechnungen, die nicht ausgelesen wurden?

2. **Re-Trigger-Mechanismus**: In `InvoiceDropZone.tsx` (Zeile 84) wird OCR fire-and-forget per `supabase.functions.invoke("extract-invoice", ...)` getriggert. Wenn der Aufruf zur 401-Zeit lief, ist die Rechnung jetzt in `pending`/`error` und wird nie mehr automatisch verarbeitet.

   → Ich baue einen **„OCR erneut starten"-Button** in der Rechnungsliste neben jeder Rechnung mit `ocr_status ∈ {pending, error}`, der `extract-invoice` neu triggert.
   
   → Plus einen **„Alle ausstehenden OCR neu starten"** Bulk-Button im Finance-Header.

3. **Live-Test einer frischen Rechnung**: Nach Deploy/UI-Änderung lade ich eine neue Rechnung hoch und prüfe `extract-invoice` Logs auf erfolgreiche Verarbeitung (oder neue Fehler).

4. **Falls Fehler in Logs erscheinen** (z.B. Mistral OCR-Endpoint oder Tool-Calling): gezielt patchen. Mistral hat zwei separate Endpoints im Spiel:
   - `/v1/ocr` mit `mistral-ocr-latest` 
   - `/v1/chat/completions` mit `mistral-small-latest`
   
   Beide brauchen denselben Key, aber der OCR-Endpoint braucht ggf. **OCR-Berechtigung im Mistral-Account**. Falls dort 401/403 kommt: User muss im Mistral-Console prüfen, ob OCR aktiviert ist.

### Was nicht passiert
- Kein Refactor der Function-Logik selbst (Code ist solide).
- Keine DB-Migration (`ocr_status` ist schon da).

### Frage
Wenn das ok ist: ich gehe direkt in Build-Mode, prüfe die hängenden Rechnungen via SQL, baue den Re-Trigger-Button und teste live. Du musst nichts vorbereiten.
