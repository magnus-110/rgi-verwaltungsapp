# Problem

Am 06.07. um 08:00 wurden 32 geplante E-Mails ausgelöst. Ein großer Teil ist mit `error_message: "Failed to decode base64"` auf Status `failed` gelandet – darunter die Mail von Magnus Göttinger an Carsten Sieden (Betreff "Re: Anfrage zur Verwaltung einer 2-Parteien-WEG in Hopfen am See", `scheduled_emails.id = 3e57214a-27ee-4d4f-9773-462c540e1807`). Diese Mails wurden nie über SMTP verschickt und liegen deshalb weder im Postausgang noch im Gesendet-Ordner.

# Ursache

`FloatingComposeWindow.tsx` lädt Anhänge > 128 KB in den Storage-Bucket `email-attachments` hoch und speichert im `scheduled_emails.attachments`-Array nur `{ filename, storage_path, contentType, size }` (kein `content`). Kleine Anhänge werden als Base64 in `content` mitgespeichert.

Der Dispatcher `supabase/functions/dispatch-scheduled-emails/index.ts` kennt aber nur den Inline-Pfad und ruft blind
```ts
Uint8Array.from(atob(att.content), c => c.charCodeAt(0))
```
auf. Für Storage-Anhänge ist `att.content = undefined` → `atob(undefined)` wirft "Failed to decode base64", der `catch` markiert die ganze Mail als `failed`. Beim regulären Sofortversand (`send-email`) funktioniert es, weil dort der Storage-Pfad ausgewertet wird.

# Lösung

## 1. Dispatcher fixen (`supabase/functions/dispatch-scheduled-emails/index.ts`)

Attachment-Mapping so aufbauen wie in `send-email`:

- Wenn `att.storage_path` vorhanden ist: über den Service-Role-Client aus dem Bucket `email-attachments` herunterladen (`storage.from("email-attachments").download(att.storage_path)`), in `Uint8Array` konvertieren und als `content` an nodemailer geben.
- Sonst `att.content` (Base64) wie bisher dekodieren.
- Fehlt beides → Anhang überspringen und warnen, statt die Mail zu verlieren.
- Nach erfolgreichem Versand die hochgeladenen Storage-Objekte aufräumen (`storage.remove([...])`), analog zur bestehenden Meta-Verkleinerung.

Zusätzlich einen `try/catch` pro Anhang, damit ein einzelner defekter Anhang nicht die komplette Mail sprengt.

## 2. Fehlgeschlagene Mails vom 06.07. neu ausrollen

- Betroffene Zeilen: `SELECT id, subject, to_addresses FROM scheduled_emails WHERE status='failed' AND error_message='Failed to decode base64';`
- Nach dem Deploy per SQL zurücksetzen:
  ```sql
  UPDATE scheduled_emails
  SET status='scheduled', error_message=NULL, scheduled_at = now() + interval '2 minutes'
  WHERE status='failed' AND error_message='Failed to decode base64';
  ```
  Der bestehende pg_cron-Dispatcher greift dann und verschickt sie regulär. Die Magnus→Sieden-Mail geht damit automatisch mit raus.

## 3. Verifikation

- `supabase--edge_function_logs` für `dispatch-scheduled-emails` nach Deploy prüfen – erwartete Log-Zeilen: `sent`-Zähler > 0, keine `Failed to decode base64`.
- Query `scheduled_emails` erneut: Zeile `3e57214a-…` sollte `status=sent`, `sent_at` gesetzt haben.
- Im Postfach `magnus.goettinger@rgi-immobilien.de` → Gesendet nach der Mail an Carsten Sieden sehen.

# Nicht betroffen

- Sofortversand über `send-email` – der behandelt Storage-Anhänge bereits korrekt.
- Serienmails (`comm-send-bulk-email`) – eigene Pipeline.
