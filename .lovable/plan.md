

# Plan: MeetingEditor in 3-Tab-Struktur umbauen

## Überblick
Der MeetingEditor wird von 6 Collapsible-Schritten auf 3 Tabs (Segment-Style) umgebaut:

```text
┌─────────────┬──────────────┬────────────────┐
│ Vorbereitung│ Durchführung │ Nachbereitung  │
└─────────────┴──────────────┴────────────────┘
```

## Tab 1: Vorbereitung
Enthält die bisherigen Schritte 1-3 als Collapsibles:
- Grunddaten (Titel, Gebäude, Datum, Ort)
- Tagesordnung (AgendaItemEditor)
- Einladung (MeetingInvitationPdf + Freischaltung)

## Tab 2: Durchführung
Komplett neu strukturiert mit zwei Ansichten:

### Ansicht A: Eröffnung & TOP-Übersicht
- **Eröffnung**: Quorum-Card, Versammlung eröffnen/schließen Buttons
- **Anwesenheitsliste**: Check-in-Liste mit Vollmacht-Anzeige (bisheriger AttendeeManager + Check-in aus LiveVotingManager)
- **TOP-Übersicht**: Karten-Liste aller TOPs mit Status-Badge (offen/Abstimmung läuft/abgestimmt). Klick → Drill-down

### Ansicht B: TOP-Detail (Drill-down)
Wird angezeigt wenn ein TOP ausgewählt ist. Enthält:
- Header mit "← Zurück zur Übersicht" + "TOP X von Y" + Vor/Zurück-Pfeile
- Beschreibung des TOPs
- Beschlusstext (bearbeitbar als Textarea, inline speicherbar)
- Abstimmung öffnen/beenden + manuelle Stimmabgabe
- Ergebnis-Anzeige nach Abstimmung
- Notizen-Textarea für Protokoll (neues Feld `admin_notes` auf `etv_agenda_items`)
- Navigation: "← Vorheriger TOP" / "Nächster TOP →"

## Tab 3: Nachbereitung
Enthält die bisherigen Schritte:
- Beschlusssammlung aktualisieren (aus MeetingProtocol)
- Protokoll (KI-Generierung, Editor, Vorschau, Download, Veröffentlichung)

## Technische Details

### Neue Komponente: `MeetingLiveSession.tsx`
Vereint die Durchführung-Logik (aus LiveVotingManager + AttendeeManager):
- State: `selectedTopId` für Drill-down
- TOP-Übersicht vs. TOP-Detail via conditional rendering
- Beschlusstext inline editierbar mit Save-Button
- Notizen-Feld pro TOP (`admin_notes` Column)
- Vor/Zurück-Navigation zwischen TOPs

### DB-Migration
`admin_notes` Column existiert bereits auf `etv_agenda_items` (wird in MeetingProtocol referenziert). Keine Migration nötig.

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/meetings/MeetingEditor.tsx` | Collapsible-Schritte durch 3 Segment-Tabs ersetzen; Tab 1 = Vorbereitung (Grunddaten + TOPs + Einladung als Collapsibles), Tab 2 = neue MeetingLiveSession Komponente, Tab 3 = Nachbereitung (MeetingProtocol) |
| `src/components/meetings/MeetingLiveSession.tsx` | **Neu** — Durchführung-Tab mit Eröffnung/Quorum, Anwesenheitsliste, TOP-Übersicht und TOP-Detail-Drill-down (Beschlusstext bearbeiten, Abstimmung, Notizen, Navigation) |
| `src/components/meetings/LiveVotingManager.tsx` | Wird durch MeetingLiveSession ersetzt (kann als Import für Voting-Logik-Hooks dienen oder entfernt werden) |

