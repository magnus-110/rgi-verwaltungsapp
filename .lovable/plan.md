# Teilnahmeabfrage am Versammlungs-Kartenfuß (Eigentümer) + Admin-Markierung

## Ziel
Eigentümer können direkt auf der Versammlungs-Karte (vor dem Öffnen des Dialogs) ihre Teilnahme vorab melden: **Anwesend / Vollmacht / Nicht anwesend**. Editierbar bis zum Versammlungs-Datum. Admin sieht in der Anwesenheitsliste ein Icon, das eine selbst gemeldete Teilnahme markiert.

## Datenbank (Migration)
Neue Spalte auf `etv_attendees`:
- `self_registered_at timestamptz NULL` — wird gesetzt, sobald der Eigentümer seine Teilnahme aktiv bestätigt/wählt. Bleibt `NULL` für rein automatisch angelegte Datensätze.

Kein Wechsel der Logik für `attendance_type`/`proxy_type` — diese Felder werden weiterhin genutzt; das neue Feld dient nur als Indikator "Eigentümer hat selbst gemeldet".

## Eigentümer-UI (`src/pages/weg-owner/Meetings.tsx`)

### Neue Datenabfrage
- Neue Query `weg-owner-attendees-all`: lädt Attendee-Records für **alle** in der Liste angezeigten Meetings (gefiltert nach `meeting_id IN (...)` und `assignment_id IN myAssignments`). Damit kann die Karte den aktuellen Status anzeigen, ohne den Detail-Dialog zu öffnen.
- Realtime-Channel ergänzen (oder pro Liste eine), sodass Änderungen Live ankommen.

### Karten-Footer (für `published` / `in_progress` Meetings, vor Versammlungs-Datum)
Am unteren Rand der Meeting-`Card` wird ein abgetrennter Bereich (`border-t pt-3 mt-2`) hinzugefügt:

```text
Ihre Teilnahme:  [ Anwesend ]  [ Vollmacht ]  [ Nicht anwesend ]
                  (aktive Auswahl visuell hervorgehoben)
```

Verhalten:
- Klicks innerhalb des Footers `stopPropagation`, damit der Karten-Klick (Dialog öffnen) nicht ausgelöst wird.
- **Anwesend** → Mutation: `attendance_type='present'`, `proxy_type=null`, `self_registered_at=now()`.
- **Nicht anwesend** → Mutation: `attendance_type='absent'`, `proxy_type=null`, `self_registered_at=now()`.
- **Vollmacht** → öffnet den bestehenden Proxy-Dialog (gleiche Logik wie heute im Detail-Dialog). Beim Speichern der Vollmacht setzt die bestehende `setProxyMutation` zusätzlich `self_registered_at=now()`.
- Bei mehreren Einheiten (mehrere `myAssignments`): pro Assignment eine Zeile (`Einheit X: [Buttons]`), damit jede Einheit separat gemeldet werden kann.
- Für vergangene/abgeschlossene Meetings: Footer wird nicht gerendert.
- Statt expliziter Zeitsperre wird die bestehende Logik (`isProxyLocked` = false) übernommen — bis zum Meeting-Termin bearbeitbar.

### Detail-Dialog (bestehende „Ihre Teilnahme & Vollmacht"-Sektion)
Bleibt unverändert, aber:
- Die Anwesend-/Abwesend-Wahl bekommt zusätzlich die zwei neuen Buttons (Anwesend/Nicht anwesend) als kleines Toggle, damit der Eigentümer auch im Dialog ändern kann. Setzt ebenfalls `self_registered_at`.

## Admin-UI (`src/components/meetings/AttendeeManager.tsx`)
Neben dem Namen jedes Attendees ein neues Icon, wenn `self_registered_at IS NOT NULL`:
- Icon: `UserCheck` (lucide), grün, mit Tooltip „Vom Eigentümer selbst gemeldet am <Datum>".
- Position: direkt rechts neben dem Namen, vor den Badges.

Keine Änderung an Mutations/Logik — nur Anzeige.

## Out of Scope
- Push-/Email-Benachrichtigung bei Selbst-Meldung
- Sperre kurz vor Meeting-Beginn (bleibt bei aktueller Logik: bis Meeting-Datum)
- Änderungen am Proxy-Flow selbst (Schritte, Weisungen) — bestehender Dialog wird wiederverwendet

## Geänderte Dateien
- **Migration**: neue Spalte `self_registered_at` auf `etv_attendees`
- **Bearbeitet**: `src/pages/weg-owner/Meetings.tsx`
- **Bearbeitet**: `src/components/meetings/AttendeeManager.tsx`
