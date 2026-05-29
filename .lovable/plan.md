## Ziel
Veraltete Mistral-Modelle (Retirement 31.05.2026 ff.) projektweit durch die offiziellen Nachfolger ersetzen.

## Mapping
| Alt | Neu | Hinweis |
|-----|-----|---------|
| `mistral-large-latest` | `mistral-medium-3-5` | Mistral Large 2 wird abgeschaltet |
| `mistral-medium-latest` | `mistral-medium-3-5` | Aktuelles `-latest` zeigt auf 3.1, wird abgeschaltet |
| `mistral-small-latest` | unverändert | `-latest` zeigt bereits auf Small 4 |
| `mistral-ocr-latest` | unverändert | Alias zeigt auf OCR 3 |
| `voxtral-mini-latest` | unverändert | Bereits 2.0 |
| `mistral-embed` | unverändert | Nicht betroffen |

Andere im Mail genannte Modelle (devstral*, pixtral*, magistral*, ministral*, leanstral, `mistral-moderation-*`, feste Datums-Snapshots wie `mistral-medium-2508`) werden im Code **nicht** verwendet — kein Handlungsbedarf.

## Code-Änderungen

### Edge Functions (`mistral-large-latest` → `mistral-medium-3-5`)
- `supabase/functions/voice-to-email/index.ts` (Zeile 128, plus Kommentar Zeile 1)
- `supabase/functions/parse-bank-statement-pdf/index.ts` (97)
- `supabase/functions/query-documents/index.ts` (482, 618)
- `supabase/functions/suggest-match/index.ts` (377)
- `supabase/functions/analyze-billing/index.ts` (61)
- `supabase/functions/generate-payment-purpose/index.ts` (47)
- `supabase/functions/generate-meeting-protocol/index.ts` (168)

### Edge Functions (`mistral-medium-latest` → `mistral-medium-3-5`)
- `supabase/functions/classify-email/index.ts` (295)

### Frontend
- `src/pages/DocumentSettings.tsx`
  - Dropdown-Optionen (Zeilen 65–67): `mistral-medium-3-5` als Empfohlen, `mistral-small-latest` als „Schneller". Die alte „Large"-Option entfernen.
  - Default-State (Zeile 80) und Fallback (Zeile 102) auf `mistral-medium-3-5` umstellen.

### Datenbank-Migration
Neue Migration, die
- die `DEFAULT`-Klausel von `public.document_chat_settings.model` auf `mistral-medium-3-5` setzt,
- bestehende Zeilen mit `model = 'mistral-large-latest'` auf `mistral-medium-3-5` aktualisiert.

```sql
ALTER TABLE public.document_chat_settings
  ALTER COLUMN model SET DEFAULT 'mistral-medium-3-5';

UPDATE public.document_chat_settings
   SET model = 'mistral-medium-3-5', updated_at = now()
 WHERE model IN ('mistral-large-latest', 'mistral-medium-latest');
```

## Nicht im Scope
- Kein `reasoning_effort: "high"` hinzufügen: Die alten Aufrufe waren Nicht-Reasoning-Modelle (Large 2 / Medium 3.1). Ein automatisches Aktivieren würde Latenz und Kosten erhöhen, ohne dass es vom Nutzer gewünscht wurde. Auf Wunsch nachrüstbar.
- Keine Anpassung der Embeddings, OCR-, Voxtral- oder Small-Aufrufe.

## Verifikation
- `rg "mistral-large-latest|mistral-medium-latest"` muss leer sein.
- Edge Functions automatisch redeployen lassen; stichprobenhaft `analyze-billing` und `query-documents` über die UI testen.
