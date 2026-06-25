## Problem

1. **König-Mail** (`Fwd: WEG Faulenseeweg 22 … Tagesordnungspunkte ETV 2026`, ID `2fc63fed…`) hat `has_attachments=true`, aber 0 Zeilen in `email_attachments`. `imap_uid` ist `NULL`, also kann ein bestehender Reparse-Pfad nicht greifen.
2. **Böck-Mail archiviert** (`RE: [EXTERNAL] FW: SCHINDLER …`, ID `829dbe83…`) hat 13 Anhänge, aber **alle `is_inline=true`** (Schindler-Signatur-Logos). UI filtert inline raus → User sieht nichts, obwohl Büroklammer im Listenicon erscheint.

## Lösung

### Teil A – Anhänge nachladen via Message-ID

Neue Edge Function **`reparse-by-message-id`**:
- Input: `{ emailId }`
- Lädt aus `emails` Tabelle: `message_id_header`, `account_id`, `folder_id`
- Holt `email_accounts`-Credentials, baut ImapFlow-Connection (gleicher Helper wie `fetch-emails`)
- Wählt alle Standard-Folder (INBOX, Archive, Sent, …) und sucht via `client.search({ header: ['Message-ID', '<…>'] })` nach der UID
- Sobald gefunden: ruft den **bereits existierenden** `processMessage`/`downloadAttachmentsFromStructure`-Pfad aus `fetch-emails` auf (Code-Auslagerung in gemeinsames Modul oder Re-Use über internen Aufruf)
- Schreibt fehlende Anhänge in Storage + `email_attachments`, aktualisiert `imap_uid` und `folder_id` falls anders gefunden
- Setzt `has_attachments` korrekt (siehe Teil C)

Trigger im UI:
- In `EmailAttachments.tsx`: Wenn `has_attachments=true` aber `attachments.length===0`, zeige Button **„Anhänge nachladen"** mit Spinner; ruft die Function auf und invalidiert die Query.
- Sofortiger einmaliger Aufruf für die König-Mail nach Deployment.

### Teil B – Inline-Bilder im UI ausblenden + Indikator korrigieren

- `EmailAttachments.tsx` filtert bereits `is_inline=false` → bleibt so.
- Das Listen-/Karten-Symbol stützt sich auf `emails.has_attachments`. Wir korrigieren die Quelle, damit nur **echte** Anhänge zählen.

### Teil C – `has_attachments` neu definieren

1. **Edge Function `fetch-emails`** (Schreibstelle für `has_attachments`): Statt „irgendein Part mit Content-Disposition" → nur zählen, wenn `is_inline=false` (also kein `Content-ID` / `Content-Disposition: inline`).
2. **`reparse-by-message-id`** verwendet die gleiche Logik.
3. **DB-Trigger** auf `email_attachments` (`AFTER INSERT/UPDATE/DELETE`): aktualisiert `emails.has_attachments` automatisch als `EXISTS(SELECT 1 FROM email_attachments WHERE email_id=NEW.email_id AND is_inline=false)`. So bleibt das Flag konsistent.
4. **Einmalige Migration**: `UPDATE emails SET has_attachments = EXISTS(... non-inline ...)` für Bestandsdaten – dadurch verschwindet die Büroklammer bei den Böck-Signatur-Mails sofort.

### Teil D – Optional, leichte UX-Hilfe

In Mail-Detail-Ansicht: dezenter Hinweis „📎 Diese Mail hatte ursprünglich Anhänge, die nicht geladen werden konnten" wenn `has_attachments=true` und 0 Rows existieren – inkl. „Nachladen"-Button (siehe Teil A).

## Technische Details

**Dateien**
- Neu: `supabase/functions/reparse-by-message-id/index.ts` (re-use IMAP-Helper aus `fetch-emails`)
- Edit: `supabase/functions/fetch-emails/index.ts` (`has_attachments`-Berechnung nur non-inline)
- Edit: `src/components/email/EmailAttachments.tsx` (Nachlade-Button-Branch bei has_attachments && 0 rows)
- Neue Migration:
  - Funktion + Trigger `update_email_has_attachments_flag()` auf `email_attachments`
  - Backfill: `UPDATE emails SET has_attachments = EXISTS(SELECT 1 FROM email_attachments a WHERE a.email_id=emails.id AND a.is_inline=false)`

**Ablauf nach Deployment**
1. Migration läuft → `has_attachments` für alle bestehenden Mails korrekt → Böck-Signatur-Mails verlieren Büroklammer.
2. König-Mail behält `has_attachments=true` (wurde so erkannt), zeigt jetzt Nachlade-Button.
3. Ein Klick → Function holt Anhänge nach IMAP-Lookup, Anhänge erscheinen, `has_attachments` bleibt korrekt durch Trigger.

**Risiken**
- Search by Message-ID kann je nach Server slow sein → wir scannen nur INBOX + Archive (account-typisch); falls nicht gefunden, sauberer Fehler-Toast.
- Falls Original-Mail beim Provider gelöscht wurde, Function meldet „Quelle nicht mehr verfügbar" – kein Datenverlust durch den Aufruf.