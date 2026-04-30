## Ziel

1. **Archive-Button entfernen** — Archivierung läuft nur noch über den Zuordnen-Dialog (Checkbox "E-Mail zusätzlich archivieren").
2. **Entarchivieren** ergänzen — wenn eine E-Mail im Archiv-Ordner ist, gibt es einen Button "Aus Archiv entfernen".
3. **"Relevant für Eigentümerversammlung"-Button** in der Detailansicht — nur klickbar, wenn der E-Mail eine Liegenschaft zugeordnet ist. Optional kann ein konkretes anstehendes Meeting gewählt werden.
4. Markierte E-Mails im **MeetingEditor** (also direkt in der Versammlungs-Bearbeitung) als Sektion **"Eingegangene E-Mails zur Versammlung"** anzeigen — kein neuer Gebäude-Tab, keine Case-Verknüpfung.

---

## Schritt 1 — Datenbank

Migration mit zwei neuen Spalten in `emails`:
- `is_etv_relevant boolean NOT NULL DEFAULT false`
- `etv_meeting_id uuid NULL REFERENCES etv_meetings(id) ON DELETE SET NULL`

Plus partieller Index `(building_id, etv_meeting_id) WHERE is_etv_relevant = true`.

---

## Schritt 2 — Inbox-UI (`src/pages/Inbox.tsx`)

**Toolbar in der E-Mail-Detailansicht:**
- Den separaten Archive-Button (aktuell Zeilen ~1276–1285) **entfernen**.
- Neuer Button **"Aus Archiv entfernen"** (Icon `ArchiveRestore`), nur sichtbar wenn `selectedEmail.is_archived === true`. Setzt `is_archived = false`.
- Der "Zuordnen"-Button bleibt — er übernimmt das Archivieren via Dialog.
- Neuer Button **"Für ETV markieren"** (Icon `Vote`):
  - Disabled wenn `selectedEmail.building_id` leer (Tooltip: *"Erst eine Liegenschaft zuordnen"*).
  - Aktiv: öffnet kleinen Popover mit:
    - Toggle "Relevant für Eigentümerversammlung"
    - Optional Select: anstehende Meetings dieses Gebäudes (`etv_meetings` mit `meeting_date >= today`, sortiert) — Default "Allgemein / nächste Versammlung".
  - Speichert `is_etv_relevant` + `etv_meeting_id`. Erneutes Klicken erlaubt Änderung/Entfernen.

**Liste:**
- Kleines Badge **"ETV"** an Listeneinträgen mit `is_etv_relevant = true`.

**Query:**
- `select`-Liste in der Email-Hauptquery um `is_etv_relevant, etv_meeting_id` erweitern.

---

## Schritt 3 — Meeting-Editor

Neue Komponente `src/components/meetings/EtvRelevantEmailsList.tsx`:
- Props: `meetingId`, `buildingId`
- Query: `emails` where `building_id = buildingId AND is_etv_relevant = true AND (etv_meeting_id = meetingId OR etv_meeting_id IS NULL)`
- Zeigt Subject, Absender, Datum, AI-Summary
- Klick → Deep-Link `/inbox?email=<id>` (existiert bereits)
- Aktion **"Markierung entfernen"** (setzt `is_etv_relevant = false`)
- Einbindung in `src/components/meetings/MeetingEditor.tsx` als eigene Sektion (z. B. oberhalb oder neben der TOP-Liste).

---

## Technische Details

**SQL-Migration:**
```sql
ALTER TABLE emails
  ADD COLUMN is_etv_relevant boolean NOT NULL DEFAULT false,
  ADD COLUMN etv_meeting_id uuid REFERENCES etv_meetings(id) ON DELETE SET NULL;
CREATE INDEX idx_emails_etv_relevant
  ON emails(building_id, etv_meeting_id)
  WHERE is_etv_relevant = true;
```

**Geänderte / neue Dateien:**
- `supabase/migrations/...sql` (neu)
- `src/pages/Inbox.tsx` — Archive-Button raus, Entarchivieren-Button rein, ETV-Button + Popover, Badge in Liste, Query-Erweiterung
- `src/components/meetings/EtvRelevantEmailsList.tsx` (neu)
- `src/components/meetings/MeetingEditor.tsx` — Sektion einbinden

`src/integrations/supabase/types.ts` wird automatisch regeneriert.