# Postfach regina.goettinger: Abruf hängt an einer "Gift-Mail"

## Was los ist (geprüft)

- Konto `regina.goettinger@rgi-immobilien.de` ist aktiv, letzter erfolgreicher Sync: **18.08.2026, 14:05 Uhr**; im Konto steht bereits die Warnung "Kein E-Mail-Abruf seit 1154 Minuten".
- Gespeicherter Abruf-Stand (`last_uid`) steht fest auf **87559**, das Postfach bei Strato ist bei 87610. Es sind also ~50 Mails offen.
- In den Logs wiederholt sich bei jedem Lauf exakt derselbe Ablauf: Postfach öffnen → "Found 50 UIDs to fetch" → **"CPU Time exceeded"** → Abbruch.
- Ursache: Pro Lauf werden 5 Mails verarbeitet, aber der Abruf-Stand wird **erst nach der kompletten Schleife** gespeichert. Die erste offene Mail (UID 87560, vermutlich sehr groß / viele Anhänge) sprengt das CPU-Limit der Edge Function — dadurch wird gar nichts gespeichert und der nächste Lauf beginnt wieder bei derselben Mail. Endlosschleife: Das Postfach steht seit dem 18.08. still.
- Genau dasselbe Muster erklärt den früheren Vorfall bei `magnus.goettinger@`.

## Was gebaut wird

1. **Fortschritt sofort sichern** (Kernfix): `last_uid` wird nach **jeder einzelnen** verarbeiteten Mail in der Datenbank hochgezählt, nicht erst am Schleifenende. Damit kann ein Absturz nie mehr den kompletten Lauf zurücksetzen — der nächste Lauf macht dort weiter, wo es abgebrochen ist.
2. **Zeitbudget pro Lauf**: Die Schleife bricht nach einem festen Zeitlimit (ca. 40 Sekunden) sauber ab, statt vom Laufzeit-Wächter hart gekillt zu werden.
3. **Gift-Mail-Schutz**: Vor dem Download wird die Nachrichtengröße aus der Struktur geprüft. Ist eine Mail zu groß, wird sie mit Betreff/Absender und dem Hinweis "Anhänge unvollständig" gespeichert (Anhänge werden übersprungen) statt den Lauf zu blockieren. Die Mail ist damit sichtbar, nur ohne Anhang.
4. **Nachlauf-Zähler**: Solange ein Konto Rückstand hat, holt die Funktion beim Aufruf mehrere kleine Blöcke hintereinander (innerhalb des Zeitbudgets), damit die ~50 aufgestauten Mails zügig nachlaufen.
5. **Sichtbarkeit**: Bei Abbruch wegen Zeit/Größe wird eine verständliche Meldung in `last_sync_error` geschrieben (z. B. "Große Nachricht übersprungen"), statt einer reinen Hänge-Warnung.

## Technische Details

- Datei: `supabase/functions/fetch-emails/index.ts`
  - `last_uid`-Update aus dem Block nach der Schleife (Zeile ~483) in die Schleife ziehen (leichtes `update` nur des UID-Feldes, nach erfolgreichem Insert/Skip).
  - Deadline via `Date.now()` beim Start; Abbruch der `for`-Schleife bei Überschreitung, danach normaler Persist-Pfad inkl. `last_sync_at`.
  - Größenprüfung über `msg.bodyStructure.size` bzw. Summe der Attachment-Parts gegen ein neues Limit (z. B. 25 MB) — bei Überschreitung `attachments_incomplete: true` setzen und `downloadAttachmentsFromStructure` überspringen.
- Keine Schema-Änderung nötig (`attachments_incomplete`, `last_uid`, `last_sync_error` existieren bereits).
- Nach dem Deploy: Sync für Reginas Konto manuell anstoßen und in den Function-Logs prüfen, dass `last_uid` über 87559 steigt.
