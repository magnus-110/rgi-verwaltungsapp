# Terminfindung für Eigentümerversammlungen

Verwaltung schlägt mehrere mögliche Termine vor, Eigentümer antworten in der App mit Ja / Vielleicht / Nein und wählen bevorzugte Tageszeiten. Nach Ende der Umfrage schlägt die App den besten Termin vor.

## Ablauf aus Sicht der Verwaltung

1. Beim Anlegen einer Versammlung (Tab "Vorbereitung") gibt es einen neuen Block **Terminfindung**, direkt über der Datums-Auswahl.
2. Solange kein Datum feststeht: Button "Terminumfrage starten".
3. Im Dialog: 5–10 Terminvorschläge anlegen (Datum + Uhrzeit, Uhrzeit optional), Enddatum der Umfrage (Standard: heute + 14 Tage), optionaler Hinweistext.
4. Nach dem Start zeigt der Block eine Live-Auswertung: pro Termin ein Balken mit Ja / Vielleicht / Nein, Teilnahmequote, und darunter eine Tabelle **wer wie geantwortet hat** (namentlich, nur Admin).
5. Button "Umfrage schließen" (auch automatisch nach Enddatum) → die App zeigt eine sortierte **Empfehlung** der besten Termine mit Begründung.
6. Ein Klick auf "Diesen Termin übernehmen" setzt Datum und Uhrzeit der Versammlung.

## Ablauf aus Sicht der Eigentümer

Neuer Menüpunkt **Terminabfrage** im Eigentümer-Menü (nur sichtbar, wenn für eine der eigenen Liegenschaften eine Abfrage offen ist; zusätzlich als auffällige Karte auf dem Dashboard).

Sehr einfache, große Bedienung:

- Kurzer Erklärtext: "Wann passt es Ihnen für die Eigentümerversammlung? Bitte klicken Sie bei jedem Termin an, ob Sie können."
- Pro Terminvorschlag eine große Karte mit ausgeschriebenem Datum ("Dienstag, 14. April 2027, 18:00 Uhr") und drei großen Buttons:
  - **Ja, passt** (grün) · **Vielleicht** (orange) · **Nein** (rot)
- Danach eine Frage zur bevorzugten Uhrzeit als Mehrfachauswahl mit großen Buttons: **Nachmittag (ab 15 Uhr)** · **Früher Abend (17–18 Uhr)** · **Abend (ab 19 Uhr)** · **Samstag/Wochenende bevorzugt**
- Optionales Freitextfeld "Anmerkung an die Verwaltung".
- Speichern-Button unten, Antworten sind bis zum Ende der Frist änderbar.
- Eigentümer sehen **ausschließlich ihre eigenen Angaben** – keine Namen, keine Zahlen, keine Balken anderer.
- Nach Ende der Frist: "Vielen Dank, die Abfrage ist abgeschlossen." mit den eigenen Antworten schreibgeschützt.

## Empfehlungslogik

Punkte pro Terminvorschlag: Ja = 2, Vielleicht = 1, Nein = 0, keine Antwort = 0 (wird nicht negativ gewertet).

Sortiert nach: Anzahl "Nein" aufsteigend → Punktzahl absteigend. Zusätzlich wird angezeigt:
- Anteil der Eigentümer, die zugesagt haben
- MEA-Anteil der Zusagen (Beschlussfähigkeit im Blick)
- Übereinstimmung mit dem meistgewählten Zeitfenster

Die App zeigt die Top 3 mit Klartext-Begründung, z. B. "14 von 22 Eigentümern können, keine Absage, passt zum bevorzugten Zeitfenster Abend".

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
