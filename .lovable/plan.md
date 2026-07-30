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

- Einleitung: "Terminfindung für die Eigentümerversammlung. Bitte geben Sie zu jedem Tag an, ob Sie können, und ab wann."
- Pro Tag eine große Karte mit ausgeschriebenem Datum ("Dienstag, 14. April 2027") und drei großen Buttons:
  **Ja, passt** (grün) · **Vielleicht** (orange) · **Nein** (rot)
- Darunter — sichtbar, aktiv erst nach "Ja"/"Vielleicht" — die früheste mögliche Uhrzeit (Einfachauswahl):
  **ab 15:00 Uhr** · **ab 17:00 Uhr** · **ab 19:00 Uhr**
  Hinweis: "Ab wann können Sie frühestens?" Bei "Nein" ausgegraut.
- Optionales Freitextfeld "Anmerkung an die Verwaltung".
- Speichern-Button unten, Antworten bis Fristende änderbar.
- Eigentümer sehen **ausschließlich ihre eigenen Angaben**.
- Nach Fristende: eigene Antworten schreibgeschützt mit Hinweis "Die Abfrage ist abgeschlossen."

## Empfehlungslogik

Punkte pro Tag: Ja = 2, Vielleicht = 1, Nein = 0, keine Antwort = 0.

Uhrzeit-Logik: Wer "ab 15:00" wählt, kann auch um 17:00 und 19:00; "ab 17:00" zählt auch für 19:00. Die Verfügbarkeit je Uhrzeit ist also kumulativ.

Sortiert nach: Anzahl "Nein" aufsteigend → Punktzahl absteigend → Uhrzeit mit den meisten Verfügbaren. Zusätzlich: Anteil der Zusagen und MEA-Anteil.

Top 3 mit kurzer Begründung, z. B. "Dienstag, 14.04. ab 19:00 Uhr — 14 von 22 können, keine Absage".



## Technische Umsetzung

Neue Tabellen (Lovable Cloud / Supabase), an `etv_meetings` und `building_id` gekoppelt:

- `etv_date_polls` — meeting_id, building_id, status (`open` / `closed`), closes_at, intro_text, timestamps
- `etv_date_poll_options` — poll_id, proposed_date (nur Datum, Mo–Fr), sort_order
- `etv_date_poll_responses` — poll_id, contact_id, option_id, choice (`yes` / `maybe` / `no`), earliest_time (`15` / `17` / `19`, nullable), unique (option_id, contact_id)
- `etv_date_poll_notes` — poll_id, contact_id, note (eine Anmerkung pro Eigentümer)

Zugriffsregeln:
- Admin/Mitarbeiter: voller Zugriff auf alle vier Tabellen.
- Eigentümer: dürfen offene Umfragen ihrer eigenen Liegenschaften lesen (über `weg_owner_buildings` / `current_contact_id()`), aber bei den Antworttabellen **nur eigene Zeilen** lesen und schreiben — dadurch sehen sie technisch keine fremden Antworten.
- Auswertung für den Admin über die normalen Abfragen; Aggregation im Frontend.

Frontend:
- Admin: neue Komponente `MeetingDatePollPanel` im Vorbereitung-Tab des `MeetingEditor`, plus Dialog zum Anlegen der Vorschläge.
- Eigentümer: neue Seite `src/pages/weg-owner/DatePoll.tsx` unter `/weg-owner/terminabfrage`, Eintrag im `WegOwnerLayout`-Menü und Dashboard-Karte.
- Automatisches Schließen: beim Öffnen wird `closes_at` geprüft und der Status auf `closed` gesetzt.
- Optional (Folgeschritt): E-Mail-Einladung an alle Eigentümer über das bestehende Kampagnen-Modul.
