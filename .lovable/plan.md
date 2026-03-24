

# Plan: E-Mail Body-Parsing Fix, Anhang-Download & Anhang-Versand

## Probleme

1. **"Kein Inhalt"**: Der MIME-Parser in `fetch-emails` scheitert bei verschachtelten multipart-Nachrichten (z.B. `multipart/mixed` mit `multipart/alternative` darin). Er findet nur die erste Boundary, nicht die inneren. Daher bleiben `body_text` und `body_html` leer.

2. **Anhaenge nicht angezeigt**: `has_attachments` wird zwar gespeichert, aber Anhaenge werden weder heruntergeladen noch in der UI angezeigt.

3. **Kein Anhang beim Senden**: ComposeEmailDialog hat kein File-Upload-Feld, send-email nutzt kein `attachments` in nodemailer.

## Umsetzung

### 1. MIME-Parser rekursiv machen (`fetch-emails/index.ts`)

- `parseEmailBody` durch rekursiven Parser ersetzen, der verschachtelte Boundaries erkennt (multipart/mixed > multipart/alternative > text/plain + text/html).
- Anhaenge (disposition: attachment oder nicht-text Parts) extrahieren und in Supabase Storage (`email-attachments`) speichern.
- Neue Tabelle `email_attachments` fuer Anhang-Metadaten (email_id, filename, content_type, storage_path, size).

### 2. DB-Migration: `email_attachments` Tabelle

```sql
CREATE TABLE public.email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
-- RLS: authenticated users can read
```

### 3. Anhaenge in der Detail-Ansicht anzeigen (`Inbox.tsx`)

- Query `email_attachments` wenn eine E-Mail ausgewaehlt wird.
- Anhaenge als klickbare Liste unterhalb des E-Mail-Bodys anzeigen (Icon + Dateiname + Groesse).
- Download ueber signedUrl aus `email-attachments` Bucket.
- Bueroklammer-Icon in der E-Mail-Liste wenn `has_attachments` true.

### 4. Anhang-Upload beim Senden (`ComposeEmailDialog.tsx` + `send-email/index.ts`)

- **ComposeEmailDialog**: File-Input hinzufuegen (multiple, max 10MB pro Datei). Dateien als base64 im Request-Body mitsenden.
- **send-email**: `attachments` Array aus Request lesen und an nodemailer als `attachments: [{ filename, content (base64), encoding: 'base64' }]` uebergeben.

### 5. Edge Functions deployen

Beide Functions (`fetch-emails`, `send-email`) nach Aenderung deployen.

## Dateien

| Datei | Aenderung |
|---|---|
| `supabase/migrations/...` | `email_attachments` Tabelle + RLS |
| `supabase/functions/fetch-emails/index.ts` | Rekursiver MIME-Parser, Anhang-Extraktion + Storage-Upload |
| `supabase/functions/send-email/index.ts` | Attachments aus Request an nodemailer weiterleiten |
| `src/components/email/ComposeEmailDialog.tsx` | File-Upload UI + base64-Konvertierung |
| `src/pages/Inbox.tsx` | Anhaenge-Query + Anzeige + Download, Bueroklammer-Icon in Liste |

