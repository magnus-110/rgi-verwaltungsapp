## Ziel
Schon **bei der Versammlungsvorbereitung** (Agenda-TOP) markieren können, dass der spätere Beschluss umgesetzt werden muss. Beim Speichern der Beschlusssammlung wird die Markierung automatisch übernommen → Trigger legt Vorgang an → Eigentümer sehen ihn sofort auf Beschlüsse-Seite und Dashboard.

## 1) Datenbank-Migration
Neue Spalte auf `etv_agenda_items`:
- `is_actionable boolean NOT NULL DEFAULT false` — „Beschluss ist später umzusetzen".

Optional in derselben Migration: gleiche Spalte auf `etv_resolution_templates` (`is_actionable boolean NOT NULL DEFAULT false`), damit Vorlagen die Markierung mitbringen.

Kein neuer Trigger nötig — bestehender `trg_resolution_actionable` auf `etv_resolutions` greift weiter und erzeugt den Vorgang sobald `is_actionable=true` beim Insert übergeben wird.

## 2) UI: `AgendaItemEditor.tsx`
Im Editor jedes TOPs (dort wo `resolution_text`/`voting_principle` gepflegt werden) eine kleine Switch-Zeile ergänzen:

> 🔧 **Beschluss ist umzusetzen** — Erstellt nach der Versammlung automatisch einen Vorgang zur Nachverfolgung.

- Switch schreibt `is_actionable` auf `etv_agenda_items`.
- Nur sichtbar wenn TOP überhaupt einen `resolution_text` hat (Abstimmungs-TOP).
- In der Vorlagen-Verwaltung (`etv_resolution_templates`) analoge Checkbox, damit beim Übernehmen einer Vorlage in die Agenda das Flag mitgezogen wird.

## 3) Übernahme in Beschlusssammlung: `MeetingProtocol.tsx`
In `saveResolutionsMutation` (Zeile 69–93):
- `select(...)` um `is_actionable` erweitern.
- Im `resolutions.map(...)` Payload `is_actionable: item.is_actionable ?? false` ergänzen.

Damit wird beim „Beschlusssammlung speichern" der bestehende DB-Trigger `handle_resolution_actionable` ausgelöst → Vorgang in `cases` wird automatisch angelegt und mit Resolution verknüpft.

## 4) Optionales Sichtbarmachen
- In `MeetingEditor`/Agenda-Liste neben TOPs mit `is_actionable=true` ein kleines Wrench-Badge anzeigen, damit man im Überblick sieht, welche TOPs später Vorgänge erzeugen.
- Im bestehenden `ResolutionLedger`-Switch ändert sich nichts — er bleibt als nachträgliche Korrektur­möglichkeit erhalten.

## Was sich für Eigentümer ändert
- Sobald „Beschlusssammlung speichern" + „Veröffentlichen" geklickt wurde, taucht der Beschluss bei Eigentümern unter **Beschlüsse → Tab „Umzusetzen"** und im **Dashboard-Widget** auf — ohne dass die Verwaltung den Switch noch einmal nachträglich umlegen muss.

## Nicht im Scope
- Änderungen am `handle_resolution_actionable`-Trigger.
- Änderungen an der Cases-Detailansicht oder am Eigentümer-Dashboard-Layout.
