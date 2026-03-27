

# Plan: Beschlusstexte ausblenden & Vollmacht-Vergabe im Eigentümer-Portal

## Änderung 1: Beschlusstexte im Owner-Portal ausblenden

In `src/pages/weg-owner/Meetings.tsx` (Zeilen 453-455) den Block mit `resolution_text` entfernen. Dieser Inhalt ist nur für Admins in der Vorbereitung und während der Live-Versammlung relevant.

## Änderung 2: Vollmacht-Vergabe für Eigentümer

Wenn eine Versammlung den Status `published` hat, sollen Eigentümer direkt aus dem Meeting-Detail-Dialog ihre Vollmacht vergeben können (z.B. an den Verwalter oder einen anderen Eigentümer).

### Umsetzung
- Im Meeting-Detail-Dialog (`src/pages/weg-owner/Meetings.tsx`, ab Zeile 428) einen neuen Abschnitt "Ihre Vollmacht" unterhalb der Tagesordnung einfügen
- Der Eigentümer sieht seinen aktuellen Teilnahme-Status (anwesend/abwesend/vertreten)
- Button "Vollmacht erteilen" öffnet einen Dialog mit Auswahl:
  - **An Verwalter** (Standard)
  - **An anderen Eigentümer** (Dropdown mit Kontakten des Gebäudes)
- Logik: 
  1. Den `contact_building_assignment` des eingeloggten Users anhand `profile.user_id` + `building_id` ermitteln
  2. Den zugehörigen `etv_attendees`-Eintrag für dieses Meeting finden
  3. `attendance_type` auf `proxy`, `proxy_type` und `proxy_contact_id` setzen
  4. Möglichkeit, Vollmacht wieder zurückzuziehen (auf `absent` zurücksetzen)
- **1h-Lock-Regel** beachten: Wenn `meeting_date - 1h <= now()`, keine Änderungen mehr erlauben

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/pages/weg-owner/Meetings.tsx` | `resolution_text`-Block entfernen; Vollmacht-Sektion im Meeting-Detail-Dialog hinzufügen mit Status-Anzeige und Vergabe-Dialog |

