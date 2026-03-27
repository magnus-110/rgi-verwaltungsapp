

# Plan: Eigentümer automatisch als Teilnehmer registrieren

## Problem
Die Vollmacht-Sektion (Zeile 587) wird nur angezeigt wenn `myAttendee` existiert. Dieser Eintrag wird aber erst vom Admin manuell angelegt. Eigentümer sehen daher keine Vollmacht-Option.

## Logik-Klarstellung
"Freigeschaltet" (Status `published`) = alle Eigentümer des Gebäudes sind eingeladen. Kein manueller Schritt nötig.

## Umsetzung

### 1. Auto-Registrierung im Owner-Portal (`src/pages/weg-owner/Meetings.tsx`)
- Wenn `myAssignment` vorhanden + `myAttendee` ist `null` + Meeting-Status ist `published` oder `in_progress`: automatisch einen `etv_attendees`-Eintrag mit `attendance_type: "absent"` erstellen (via `useMutation` in einem `useEffect`)
- Danach `refetchAttendee()` aufrufen, damit die UI sofort aktualisiert wird

### 2. Vollmacht-Sektion Bedingung erweitern
- Zeile 587 ändern: Statt `myAttendee` prüfen auf `myAssignment` (der Attendee-Eintrag wird ja automatisch erstellt)
- Status-Bedingung erweitern: `published` **und** `in_progress`
- Mutation-Logik: Falls `myAttendee` noch nicht geladen ist (Race Condition), kurz warten oder Button deaktivieren

### 3. Admin-seitige Auto-Initialisierung (`src/components/meetings/AttendeeManager.tsx`)
- `useEffect` hinzufügen: Wenn `attendees.length === 0 && owners.length > 0`, automatisch `initMutation.mutate()` aufrufen (statt nur Button)
- Button "Eigentümer laden" bleibt als Fallback sichtbar, falls neue Eigentümer hinzugekommen sind

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/pages/weg-owner/Meetings.tsx` | `useEffect` für Auto-Registrierung; Vollmacht-Bedingung auf `myAssignment` + Status `published`/`in_progress` erweitern |
| `src/components/meetings/AttendeeManager.tsx` | `useEffect` für automatische Initialisierung aller Eigentümer beim Laden |

