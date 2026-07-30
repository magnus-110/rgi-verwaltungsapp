# Terminfindung für Eigentümerversammlungen

Verwaltung schlägt mehrere mögliche Tage vor (nur Wochentage Mo–Fr, kein Wochenende). Eigentümer geben pro Tag an, ob es geht, und wählen dazu die passenden Uhrzeiten. Nach Ende der Umfrage schlägt die App den besten Termin (Tag + Uhrzeit) vor.

## Ablauf aus Sicht der Verwaltung

1. Beim Anlegen einer Versammlung (Tab "Vorbereitung") gibt es einen neuen Block **Terminfindung**, direkt über der Datums-Auswahl.
2. Solange kein Datum feststeht: Button "Terminumfrage starten".
3. Im Dialog: 5–10 Tage vorschlagen (nur Datum, keine Uhrzeit; Samstag/Sonntag werden blockiert), Enddatum der Umfrage (Standard: heute + 14 Tage), optionaler Hinweistext.
4. Nach dem Start zeigt der Block eine Live-Auswertung: pro Tag ein Balken mit Ja / Vielleicht / Nein, dazu die Verteilung auf die drei Uhrzeiten, Teilnahmequote, und darunter eine Tabelle **wer wie geantwortet hat** (namentlich, nur Admin).
5. Button "Umfrage schließen" (auch automatisch nach Enddatum) → die App zeigt eine sortierte **Empfehlung** aus Tag + Uhrzeit mit Begründung.
6. Ein Klick auf "Diesen Termin übernehmen" setzt Datum und Uhrzeit der Versammlung.

## Ablauf aus Sicht der Eigentümer

Neuer Menüpunkt **Terminabfrage** im Eigentümer-Menü (nur sichtbar, wenn für eine der eigenen Liegenschaften eine Abfrage offen ist; zusätzlich als auffällige Karte auf dem Dashboard).

Sehr einfache, große Bedienung:

- Einleitungstext oben:
  "Terminfindung für die Eigentümerversammlung. Wir suchen einen Termin, an dem möglichst viele Eigentümer teilnehmen können. Bitte geben Sie zu jedem der folgenden Tage an, ob Ihnen der Termin passt, und wählen Sie anschließend die Uhrzeiten aus, die für Sie in Frage kommen."
- Pro Tag eine große Karte mit ausgeschriebenem Datum ("Dienstag, 14. April 2027") und drei großen Buttons:
  - **Ja, passt** (grün) · **Vielleicht** (orange) · **Nein** (rot)
- Direkt darunter — von Anfang an sichtbar, aber erst nach "Ja"/"Vielleicht" aktiv — die drei Uhrzeiten als große Mehrfachauswahl:
  **ab 15:00 Uhr** · **ab 17:00 Uhr** · **ab 19:00 Uhr**
  Hinweis darunter: "Bitte wählen Sie alle Uhrzeiten, die Ihnen an diesem Tag passen." Bei "Nein" werden die Uhrzeiten ausgegraut.
- Optionales Freitextfeld "Anmerkung an die Verwaltung".
- Speichern-Button unten, Antworten sind bis zum Ende der Frist änderbar.
- Abschlusstext nach dem Speichern:
  "Vielen Dank. Die Verwaltung wertet alle Rückmeldungen aus und legt anschließend den Termin fest, der für möglichst viele Eigentümer passt. Sie erhalten die offizielle Einladung rechtzeitig danach."
- Eigentümer sehen **ausschließlich ihre eigenen Angaben** – keine Namen, keine Zahlen, keine Balken anderer.
- Nach Ende der Frist: eigene Antworten schreibgeschützt mit Hinweis "Die Abfrage ist abgeschlossen."

## Empfehlungslogik

Punkte pro Tag: Ja = 2, Vielleicht = 1, Nein = 0, keine Antwort = 0 (wird nicht negativ gewertet).

Die Uhrzeit wird innerhalb eines Tages separat gezählt: Für jede der drei Uhrzeiten zählt, wie viele der verfügbaren Eigentümer sie angekreuzt haben. Ergebnis ist immer eine Kombination Tag + Uhrzeit.

Sortiert nach: Anzahl "Nein" aufsteigend → Punktzahl absteigend → Uhrzeit mit den meisten Zustimmungen. Zusätzlich wird angezeigt:
- Anteil der Eigentümer, die zugesagt haben
- MEA-Anteil der Zusagen (Beschlussfähigkeit im Blick)

Die App zeigt die Top 3 mit Klartext-Begründung, z. B. "Dienstag, 14.04. ab 19:00 Uhr — 14 von 22 Eigentümern können, keine Absage, 19:00 Uhr ist die meistgewählte Uhrzeit an diesem Tag".


## Technische Umsetzung

Neue Tabellen (Lovable Cloud / Supabase), an `etv_meetings` und `building_id` gekoppelt:

- `etv_date_polls` — meeting_id, building_id, status (`open` / `closed`), closes_at, intro_text, timestamps
- `etv_date_poll_options` — poll_id, proposed_date, proposed_time (nullable), sort_order
- `etv_date_poll_responses` — poll_id, contact_id, option_id, choice (`yes` / `maybe` / `no`), unique (option_id, contact_id)
- `etv_date_poll_preferences` — poll_id, contact_id, time_slots (text[]), note

Zugriffsregeln:
- Admin/Mitarbeiter: voller Zugriff auf alle vier Tabellen.
- Eigentümer: dürfen offene Umfragen ihrer eigenen Liegenschaften lesen (über `weg_owner_buildings` / `current_contact_id()`), aber bei den Antworttabellen **nur eigene Zeilen** lesen und schreiben — dadurch sehen sie technisch keine fremden Antworten.
- Auswertung für den Admin über die normalen Abfragen; Aggregation im Frontend.

Frontend:
- Admin: neue Komponente `MeetingDatePollPanel` im Vorbereitung-Tab des `MeetingEditor`, plus Dialog zum Anlegen der Vorschläge.
- Eigentümer: neue Seite `src/pages/weg-owner/DatePoll.tsx` unter `/weg-owner/terminabfrage`, Eintrag im `WegOwnerLayout`-Menü und Dashboard-Karte.
- Automatisches Schließen: beim Öffnen wird `closes_at` geprüft und der Status auf `closed` gesetzt.
- Optional (Folgeschritt): E-Mail-Einladung an alle Eigentümer über das bestehende Kampagnen-Modul.
