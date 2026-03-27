

# Plan: Eigentümer-TOP-Einreichung unabhängig von Versammlungen

## Problem

Aktuell können Eigentümer nur dann TOPs einreichen, wenn eine Versammlung mit Status "invited" existiert. Das widerspricht dem gesetzlichen Anspruch: Eigentümer dürfen **jederzeit** TOPs einreichen, unabhängig davon ob eine Versammlung geplant ist.

## Konzept

### Neue Tabelle: `etv_submitted_tops`

Eingereichte TOPs werden **separat** von den Agenda-Items gespeichert. Sie gehören zu einem Gebäude, nicht zu einer Versammlung. Der Verwalter entscheidet später, welche TOPs er in welche Versammlung übernimmt.

```text
etv_submitted_tops
├── id (UUID)
├── building_id (FK → buildings)
├── submitted_by_user_id (FK → profiles)
├── title (TEXT)
├── description (TEXT)
├── attachment_paths (TEXT[])
├── status: 'pending' | 'accepted' | 'rejected' | 'deferred'
├── accepted_into_meeting_id (FK → etv_meetings, nullable)
├── admin_notes (TEXT)
├── created_at / updated_at
```

### Eigentümer-Portal (weg-owner/Meetings.tsx)

- **TOP-Einreichung immer möglich** — Button ist immer sichtbar, nicht nur bei aktiver Versammlung
- TOPs werden mit `building_id` gespeichert, ohne `meeting_id`
- Eigentümer sehen ihre eingereichten TOPs mit Status (Ausstehend, Aufgenommen, Abgelehnt)
- Versammlungen werden nur angezeigt wenn Status `published` (neuer Status, s.u.)

### Meeting-Sichtbarkeit für Eigentümer

- Neuer Status `published` in `etv_meetings` — Verwalter schaltet die Versammlung manuell frei
- Eigentümer sehen nur Versammlungen mit Status `published`, `in_progress` oder `completed`
- Draft-Versammlungen bleiben für Eigentümer unsichtbar

### Admin-Seite: Eingereichte TOPs verwalten

- Im `MeetingEditor` (Schritt 2 / Tagesordnung): neue Sektion "Eingereichte Anträge" mit Liste der pending TOPs für das Gebäude
- Button "Übernehmen" kopiert den TOP als `etv_agenda_item` in die Versammlung und setzt den submitted-TOP auf `accepted`
- Button "Ablehnen" mit optionalem Kommentar
- Button "Zurückstellen" für spätere Versammlungen

- Im Building-Dashboard: eigener Bereich oder Badge mit Anzahl offener TOP-Einreichungen

### Freischaltung der Versammlung

- Im MeetingEditor Schritt 3 (Einladung): neuer Button "Für Eigentümer freischalten" 
- Setzt Status von `draft` → `published`
- Ab diesem Zeitpunkt: keine neuen TOPs mehr für **diese** Versammlung akzeptierbar (aber Einreichungen laufen weiter für die nächste)

## Technische Umsetzung

### Migration
- Neue Tabelle `etv_submitted_tops` mit RLS (Eigentümer können eigene sehen/erstellen, Admins alles)
- Status `published` wird zur bestehenden Status-Liste von `etv_meetings` hinzugefügt (kein Schema-Change nötig, da TEXT-Feld)

### Geänderte Dateien

| Datei | Änderung |
|---|---|
| `supabase/migrations/` | Neue Tabelle `etv_submitted_tops` + RLS |
| `src/pages/weg-owner/Meetings.tsx` | TOP-Einreichung ohne Meeting-Abhängigkeit, eigene TOPs anzeigen, nur `published`+ Meetings zeigen |
| `src/components/meetings/AgendaItemEditor.tsx` | Sektion "Eingereichte Anträge" mit Übernehmen/Ablehnen |
| `src/components/meetings/MeetingEditor.tsx` | Freischaltungs-Button im Einladungs-Schritt |
| `src/components/meetings/MeetingInvitationPdf.tsx` | Freischaltungs-Logik einbauen |

