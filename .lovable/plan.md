# Problem

Die Test-Mail an `magnus.goettinger@rgi-immobilien.de` (und vermutlich weitere Mails) kommen nicht in der App an, obwohl die IMAP-Verbindung erfolgreich ist.

## Ursachenanalyse aus den Logs + DB

Edge-Function-Logs (`fetch-emails`):
```
magnus.goettinger@rgi-immobilien.de
Mailbox opened: 18 messages, uidNext: 19
Found 0 UIDs to fetch
```
DB `email_accounts.last_uid` für magnus = **31**.

Das Postfach hat aber nur noch UIDs **1–18** (uidNext = 19). Unsere gespeicherte „letzte UID" (31) liegt **höher** als alles, was im Postfach existiert → die Suche `uid: "32:*"` liefert immer 0 Treffer. Wir holen nie wieder eine neue Mail.

Ursache: Das IMAP-Postfach wurde bei Strato neu aufgebaut / geleert / migriert. Dadurch hat sich der **UIDVALIDITY-Wert** geändert und die UID-Sequenz beginnt wieder bei 1. Unser Code in `supabase/functions/fetch-emails/index.ts` speichert UIDVALIDITY nicht und erkennt diesen Reset nicht.

Solange `last_uid` höher bleibt als alles Neue, wird **nie** eine Mail abgeholt – exakt das Symptom „Test kommt nicht an, viele weitere fehlen".

# Lösung

In `fetch-emails` UIDVALIDITY tracken und bei Reset / Inkonsistenz `last_uid` zurücksetzen.

## Schritte

1. **Migration**: Spalte `uid_validity TEXT` zu `email_accounts` hinzufügen.

2. **`fetch-emails/index.ts` anpassen** (Mailbox-Open-Block, ca. Zeile 245–260):
   - Aus `mailboxOpen("INBOX")` zusätzlich `mailbox.uidValidity` lesen.
   - Wenn `account.uid_validity` gesetzt ist und **nicht** zum aktuellen Wert passt → Reset: `last_uid = 0`, alle Mails neu durchgehen (gefiltert via vorhandenem `import_since`-Cutoff, damit nicht 8000 alte Mails reinkommen).
   - Wenn `account.last_uid > mailbox.uidNext - 1` (Sicherheits-Fallback, falls UIDVALIDITY in einer alten Reihe nie gespeichert wurde) → ebenfalls `last_uid = 0` und Re-Sync mit Cutoff.
   - Beim erfolgreichen Fetch am Ende `uid_validity` zusammen mit `last_uid` in die DB schreiben.
   - Loggen, wenn ein UIDVALIDITY-Reset erkannt wurde, damit das in den Edge-Logs sichtbar ist.

3. **Sofort-Reparatur (einmalig per Migration oder manuelles Update)**: Für `magnus.goettinger@rgi-immobilien.de` `last_uid` auf `0` setzen und ein passendes `import_since` (z.B. heutiges Datum minus 14 Tage) eintragen, damit beim nächsten Cron-Lauf die fehlenden Mails inkl. Test-Mail nachgeladen werden, aber keine alten 18 Mails doppelt zugeordnet werden, falls schon vorhanden.
   - Optional: Für alle anderen Accounts ebenfalls einmalig prüfen, ob `last_uid > uidNext-1`. Die Logs zeigen aktuell nur Magnus als betroffen, aber wenn der User „viele weitere" sagt, lohnt es sich, einmalig auch die anderen Postfächer manuell zurückzusetzen, sobald die Erkennungslogik live ist (sie übernimmt das dann automatisch).

4. **Duplikat-Schutz prüfen**: Vor dem Insert in `emails` wird bereits per `message_id` deduped (sollte vorhanden sein) – sicherstellen, dass das beim Re-Sync greift, damit ein Reset keine Doppel-Mails erzeugt.

## Technische Details

- IMAPFlow gibt `mailbox.uidValidity` als BigInt/Number zurück → als String speichern.
- Reset-Logik vor dem `client.search(...)` Aufruf einsetzen, sodass `uids` korrekt mit dem neuen Startwert berechnet wird.
- `import_since`-Filter im bestehenden Loop bleibt unverändert und schützt vor Reimport sehr alter Mails nach dem Reset.

## Out of scope

- Keine Änderungen an UI / Inbox-Liste.
- Keine Änderungen am SMTP-Versand oder an der KI-Klassifizierung.
