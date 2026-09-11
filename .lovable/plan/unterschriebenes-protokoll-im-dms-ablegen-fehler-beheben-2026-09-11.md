# Unterschriebenes Protokoll im DMS ablegen – Fehler beheben

## Was tatsächlich passiert

Für die Versammlung Sorgschrofenweg 2 (02.09.2026) sind 4 Unterschriften gespeichert, aber es existiert **kein erzeugtes Protokoll-PDF**. Die Ablage-Funktion setzt aber voraus, dass vorher schon einmal ein PDF-Protokoll erzeugt wurde – sonst bricht sie mit einem Fehler ab, der in der App nur als „Edge Function fehlgeschlagen" ankommt.

Die Funktion selbst läuft fehlerfrei; es fehlt schlicht die Grundlage (das PDF) und eine verständliche Rückmeldung.

## Was geändert wird

1. **Protokoll automatisch erzeugen**: Fehlt ein PDF, erzeugt die Ablage-Funktion es selbst (mit der Standard-Protokollvorlage der Liegenschaft bzw. der zuletzt genutzten Vorlage) und stempelt darauf die Unterschriftenseite. Kein manueller Zwischenschritt mehr.
2. **Klare Fehlermeldung**: Wenn gar keine Vorlage hinterlegt ist, erscheint statt „Edge Function fehlgeschlagen" der Hinweis „Kein Protokoll-PDF vorhanden und keine Vorlage hinterlegt – bitte zuerst Protokoll erzeugen."
3. **Button-Hinweis in der Nachbereitung**: Neben „Final signieren & im DMS ablegen" wird angezeigt, ob bereits ein PDF-Protokoll vorliegt.

## Technische Details

- `supabase/functions/etv-finalize-signed-protocol/index.ts`: Wenn kein `etv_protocol_renders`-Eintrag mit `format = 'pdf'` existiert, intern `etv-render-protocol` (output_format `pdf`) aufrufen und dessen `storage_path` verwenden; Fehler mit sprechendem Text statt HTTP 400 ohne Kontext zurückgeben.
- `src/components/meetings/ProtocolSignaturesInline.tsx`: Fehlertext aus der Antwort (`data.error`) auch bei Non-2xx-Antworten auslesen und im Toast zeigen; kleiner Statushinweis „PDF-Protokoll vorhanden / noch nicht erzeugt".
- Keine Datenbankänderungen nötig.
