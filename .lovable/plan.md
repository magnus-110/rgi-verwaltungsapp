# Mailversand an Sina Lang: Fehlermeldung war irreführend

## Befund (geprüft)

- Im Log des Versands (10.09.2026, 08:47 Uhr) hat der Strato-Postausgangsserver die Mail abgelehnt mit: „521 5.1.2 Domain does not exist: hausverwaltung-weisenbach.de".
- Die Adresse war korrekt geschrieben: `s.lang@hausverwaltung-weisenbach.de`.
- Die Domain existiert nachweislich: sie hat gültige Mailserver-Einträge (Microsoft/Outlook) und einen gültigen Server-Eintrag.
- Von genau dieser Adresse liegen zahlreiche empfangene Mails im Postfach von Regina Göttinger, zuletzt am 10.09.2026 um 08:14 Uhr — also kurz vor dem fehlgeschlagenen Versand.

Ergebnis: Es war kein Adressfehler, sondern eine kurzzeitige Störung bei der Namensauflösung auf Seiten des Strato-Postausgangsservers. Unsere App hat diese Ablehnung nur weitergereicht und daraus fälschlich „Die Domain existiert nicht — bitte E-Mail-Adresse prüfen" gemacht.

## Was umgesetzt wird

1. **Automatischer zweiter Versuch**: Wird eine Mail mit dieser Art von Ablehnung (Code 521 / vorübergehende Domain- oder Empfängerablehnung) zurückgewiesen, versucht die App den Versand nach kurzer Wartezeit noch einmal (bis zu zwei Wiederholungen). In den meisten Fällen geht die Mail dann durch, ohne dass jemand etwas merkt.
2. **Ehrliche Fehlermeldung**: Schlägt es weiterhin fehl, steht künftig sinngemäß: „Der Postausgangsserver konnte die Empfänger-Domain gerade nicht erreichen (vorübergehende Störung). Bitte in ein paar Minuten erneut senden." Nur wenn die Adresse tatsächlich dauerhaft ungültig ist (Code 550 „no such user"), wird weiterhin auf einen Adressfehler hingewiesen.
3. **Gleiches Verhalten beim Rundmail- und beim geplanten Versand**, damit dort nicht einzelne Empfänger still ausfallen.

## Technische Details

- `supabase/functions/send-email/index.ts`: `transporter.sendMail` in eine Retry-Schleife (max. 3 Versuche, 1,5 s / 4 s Backoff) kapseln. Retry nur bei `code === "EENVELOPE"` und `responseCode` 421/450/451/452/521 oder Text „Domain does not exist"; dauerhafte 5.1.1-Fehler („no such user", 550) sofort abbrechen.
- Fehlermeldungs-Mapping am Ende der Funktion entsprechend aufteilen (temporär vs. permanent), damit das Frontend die passende Meldung zeigt.
- Gleiche Retry-Hilfsfunktion in `supabase/functions/comm-send-bulk-email/index.ts` und im geplanten Versand (`comm-dispatch-scheduled` / `dispatch-scheduled-emails`) verwenden; dafür als kleine Helper-Datei unter `supabase/functions/_shared/` ablegen.
- Keine Datenbank- oder UI-Änderungen nötig.
