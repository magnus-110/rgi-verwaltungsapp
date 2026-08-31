# Rundmail-Anhänge im Ordner „Gesendet" sichtbar machen

## Befund (geprüft in der Datenbank)

Die Mails vom 27.08.2026 von Maximilian Göttinger (z. B. „WEG Öscherweg 1 Vollmacht" an alexandermoll87@gmx.de) liegen im Ordner „Gesendet" und sind mit `has_attachments = true` markiert — aber es existiert **kein einziger Anhang-Datensatz** dazu (0 Zeilen in `email_attachments`). Zum Vergleich: normal über „E-Mail schreiben" versendete Mails desselben Tages haben ihre Anhänge korrekt gespeichert (z. B. 7 bzw. 2 Anhänge).

Ursache: Beim Rundmail-Versand wird die Kopie im Postfach angelegt und als „hat Anhänge" markiert, die Dateien selbst werden aber nie in den E-Mail-Speicher übernommen. Der normale Versandweg macht genau das (Datei in den Bucket `email-attachments` legen + Datensatz anlegen), der Rundmail-Weg nicht.

## Was umgesetzt wird

1. **Rundmail-Versand ergänzen**: Nach dem Anlegen der Kopie im Ordner „Gesendet" werden alle mitgesendeten Dateien (allgemeine Anhänge + persönliche Anhänge des jeweiligen Empfängers) in den E-Mail-Speicher kopiert und als Anhänge zur Mail verknüpft — exakt wie beim normalen Versand. Damit sind Anhänge künftig in der Gesendet-Ansicht sichtbar, herunterladbar und als Rechnung/Dokument weiterverwendbar.
2. **Nachträgliche Reparatur der Mails vom 27.08.2026**: Die Dateien der betroffenen Rundmail-Kampagnen liegen noch im Kampagnen-Speicher. Für jede bereits versendete Rundmail-Kopie werden die zugehörigen Kampagnen-Dateien (allgemein + persönlich) nachträglich verknüpft, sodass die Anhänge in den bestehenden Gesendet-Einträgen wieder auftauchen. Wo eine Datei zwischenzeitlich gelöscht wurde, bleibt der Eintrag ohne Anhang und `has_attachments` wird korrigiert, damit keine leere Büroklammer angezeigt wird.

## Technische Details

- `supabase/functions/comm-send-bulk-email/index.ts`: Insert in `emails` mit `.select("id").single()`; anschließend pro Anhang Upload nach `email-attachments/<email_id>/<idx>_<name>` und Insert in `email_attachments` (`file_name`, `file_path`, `file_size`, `mime_type`, `is_inline: false`) — analog zu `send-email/index.ts` (Zeilen 233–285). Fehler pro Anhang werden geloggt, brechen den Versand nicht ab.
- Backfill: Einmal-Skript/Edge-Function-Lauf, der `comm_campaigns` (Typ `email`, versendet) mit den zugehörigen `emails`-Zeilen über `message_id LIKE 'bulk-<campaign_id>-%'` und die Empfängeradresse mit `comm_recipient_overrides` matcht, Dateien aus `comm-assets` nach `email-attachments` kopiert und die `email_attachments`-Zeilen anlegt.
- Keine Schemaänderung nötig, keine Änderung an der Gesendet-Ansicht im Frontend.
