## Problem
Anhänge mit identischem Dateinamen werden im Supabase Storage unter demselben Key abgelegt (`{email_id}/{filename}`) und mit `upsert:true` überschrieben. Die DB hat zwar 4 Zeilen, alle `file_path`-Werte sind aber identisch → 4× derselbe Inhalt sichtbar.

## Lösung
Storage-Key um einen Eindeutigkeits-Token erweitern, sodass jeder Anhang seine eigene Datei behält. Format: `{email_id}/{index}_{sanitizedName}` (z. B. `…/0_rechnung.pdf`, `…/1_rechnung.pdf`). Index hat den Vorteil, stabil und reproduzierbar zu sein (anders als UUIDs), was Reparse-Idempotenz erleichtert.

## Änderungen

### 1. `supabase/functions/fetch-emails/index.ts`
- **Initialer Fetch (~Z. 378–407):** Schleife auf `attachments.entries()` umstellen, Pfad = `${insertedEmail.id}/${idx}_${sanitize(filename)}`.
- **Reparse-Pfad (~Z. 873–902):** Bestehende Duplikatprüfung nutzt nur `file_name` und übersieht das Problem. Anpassen: Prüfung auf Tupel `(file_name + file_size)` oder den neuen indexbasierten Pfad — sonst werden beim Reparse neue Kopien angelegt. Pfad ebenfalls indexbasiert bauen.

### 2. `supabase/functions/send-email/index.ts` (Z. ~225)
- Beim Persistieren gesendeter Anhänge ebenfalls Index in den Pfad aufnehmen, damit gleichnamige Attachments im Gesendet-Ordner nicht kollidieren.

### 3. Bestehende fehlerhafte Daten (einmalige Reparatur)
- SQL-Auswertung: Wie viele `email_attachments`-Zeilen teilen sich identische `file_path`-Werte?
- Empfehlung an dich: betroffene Mails in der App „Neu einlesen" (Reparse) lassen — nach dem Codefix legt der Reparse neue, eindeutige Storage-Keys an. Alternativ kann ich ein einmaliges Backfill-Skript schreiben, das alle Duplikat-Pfade identifiziert und über IMAP frisch lädt. Diese Bereinigung erst nach deiner Bestätigung.

### 4. Keine DB-Schema-Änderung nötig
`file_path` ist `text`, kein Unique-Constraint betroffen.

## Out of scope
- Kein Wechsel auf content-hash-basierte Pfade (komplexer, später machbar).
- Keine UI-Änderungen — die Liste rendert bereits pro DB-Row, Fix wirkt sofort.
