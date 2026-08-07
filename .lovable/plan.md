# Verwaltungsbericht als eigener TOP mit Word-Vorlage

## Ziel
Ein TOP kann als "Bericht der Verwaltung" markiert werden. Dafür gibt es eine eigene Eingabemaske mit vier festen Textfeldern. Aus diesen Feldern wird über eine hochgeladene Word-Vorlage ein Bericht (DOCX/PDF) erzeugt und direkt im TOP zum Download angeboten.

## Ablauf für den Nutzer
1. Beim Anlegen/Bearbeiten eines TOPs gibt es den Schalter "Bericht der Verwaltung".
2. Ist er aktiv, erscheint statt des normalen Beschreibungsfeldes eine Maske mit vier Feldern:
   - Sachstandsbericht
   - Instandhaltungsbericht
   - Vermögensbericht
   - Sonstiges
3. Unter der Maske: Auswahl der Berichtsvorlage (Standard vorbelegt) und die Buttons "Bericht erzeugen (PDF)" bzw. "als Word".
4. Der erzeugte Bericht wird gespeichert und ist im TOP jederzeit erneut abrufbar; das Anhängen an die Einladung erfolgt manuell.

## Vorlagenverwaltung
Neuer Tab "Bericht-Vorlagen" in Versammlungen, analog zum bestehenden Tab "Protokoll-Vorlagen": .docx hochladen, Standard setzen, öffnen, löschen, plus Platzhalter-Hilfe.

Platzhalter der Vorlage:
```text
{weg.name} {weg.adresse} {gebaeude.name} {gebaeude.adresse}
{versammlung.titel} {versammlung.datum} {versammlung.ort} {versammlung.leitung}
{top.nummer} {top.titel}
{bericht.sachstand}
{bericht.instandhaltung}
{bericht.vermoegen}
{bericht.sonstiges}
{ort_datum}
```

## Technische Umsetzung
- Migration:
  - `etv_agenda_items`: neue Spalten `is_management_report boolean not null default false` und `report_sections jsonb not null default '{}'` (Schlüssel: `sachstand`, `instandhaltung`, `vermoegen`, `sonstiges`).
  - Neue Tabelle `etv_report_templates` (name, storage_path, is_default, placeholder_schema, Zeitstempel) mit GRANTs, RLS und Policies analog `etv_protocol_templates`.
  - Neue Tabelle `etv_report_renders` (meeting_id, agenda_item_id, template_id, storage_path, format, created_by, created_at) mit GRANTs, RLS und Policies analog `etv_protocol_renders`.
- Edge Function `etv-render-report`: baut das Payload aus Versammlung, Gebäude und den vier Berichtsfeldern, rendert mit docxtemplater aus der Vorlage, wandelt bei Bedarf über den bereits genutzten CloudConvert-Weg in PDF, legt die Datei unter `building-files/_etv-report-renders/{meeting_id}/` ab und gibt eine signierte URL zurück. Struktur und Hilfsfunktionen aus `etv-render-protocol` werden wiederverwendet.
- Frontend:
  - `AgendaItemEditor.tsx`: Schalter plus vier Textareas (Speicherung in `report_sections`), Vorlagenauswahl und Download-Buttons.
  - Neue Komponente `ReportTemplatesTab.tsx` in `src/components/meetings/`, eingebunden als weiterer Tab in `src/pages/Meetings.tsx`.
  - Protokoll-Rendering: für Berichts-TOPs werden die vier Abschnitte als zusammengesetzter Text in `{text}` ausgegeben, damit das Protokoll weiterhin vollständig ist.
