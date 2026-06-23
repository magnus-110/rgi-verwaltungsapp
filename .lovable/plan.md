
# Stempeluhr (Arbeitszeiterfassung)

Eine schlanke, freundliche Stempeluhr oben rechts im Admin-Header — kein Überwachungsgefühl, sondern ein persönliches Tool, das die eigene Arbeitszeit sichtbar macht.

## Konzept (UI/UX)

**Header-Button** (rechts neben dem Titel "WEG-Verwaltung" / "Mietverwaltung" in `AdminLayout`):

- Im **ausgestempelten** Zustand: kleiner, dezenter Pill-Button mit Play-Icon und Text „Einstempeln". Neutrale Farben.
- Im **eingestempelten** Zustand: weicher grüner Pill mit pulsierendem Punkt, Live-Timer („● 02:14:38") und Stop-Icon. Ein Klick auf den Timer-Bereich öffnet das Auswertungs-Popover, ein Klick auf das Stop-Icon stempelt aus.
- Mobile: nur Icon + Timer-Kurzform, Popover als Sheet.

**Popover „Meine Zeit"** (eigene Auswertung, jeder sieht nur sich):
- Heute · Diese Woche · Dieser Monat — als drei große, ruhige Zahlen.
- Liste der letzten 7 Einträge mit Start–Ende und Dauer, jede Zeile inline editierbar (Stift-Icon) und löschbar — Vertrauen statt Kontrolle.
- Kein Standort, kein Foto, keine Pausenpflicht. Optional freie „Notiz" pro Stempelung.
- Button „Manuell nachtragen" für vergessene Stempelungen.
- Footer-Hinweis: „Nur du und Admins sehen deine Zeiten."

**RGI Intern → neuer Tab „Stempelzeiten"** (nur Admin):
- Header-KPIs: aktuell eingestempelte Personen, Σ Stunden heute / diese Woche / Monat.
- Tabelle aller Mitarbeiter mit Wochenstunden, Monatsstunden, letzter Aktivität.
- Drill-Down pro Person: alle Einträge mit Filter (Zeitraum), CSV-Export.
- Admin kann Einträge korrigieren (Audit: `edited_by`, `edited_at`).

## Datenmodell

Neue Tabelle `time_clock_entries`:
- `user_id` (FK profiles.user_id)
- `started_at` (timestamptz)
- `ended_at` (timestamptz, nullable → offener Eintrag = eingestempelt)
- `duration_minutes` (generated/trigger, für schnelle Aggregation)
- `note` (text, optional)
- `source` ('button' | 'manual')
- `edited_by`, `edited_at`

**RLS**:
- User: SELECT/INSERT/UPDATE/DELETE nur eigene Zeilen (`auth.uid() = user_id`).
- Admin: SELECT/UPDATE/DELETE alle (via `has_role(auth.uid(), 'admin')`).
- Constraint: max. 1 offener Eintrag pro User (partial unique index auf `user_id WHERE ended_at IS NULL`).

GRANTs für `authenticated` und `service_role` (kein anon).

## Komponenten / Dateien

Neu:
- `supabase/migrations/...` — Tabelle, Index, RLS, Policies.
- `src/hooks/useTimeClock.ts` — `useActiveEntry`, `useClockIn`, `useClockOut`, `useMyEntries`, `useAllEntries` (admin).
- `src/components/timeclock/TimeClockButton.tsx` — Pill-Button + Live-Timer (Interval nur clientseitig).
- `src/components/timeclock/TimeClockPopover.tsx` — eigene Auswertung, Edit/Delete/Nachtrag.
- `src/components/rgi-intern/timeclock/TimeClockAdminTab.tsx` — Admin-Übersicht + Drill-Down + CSV.

Geändert:
- `src/components/AdminLayout.tsx` — Header-Zeile: `<TimeClockButton />` rechtsbündig neben `<h1>`.
- `src/pages/RgiIntern.tsx` — neuer Tab „Stempelzeiten" (Clock-Icon).

## Technische Details

- Live-Timer via `setInterval(1000)` lokal — kein DB-Polling.
- Realtime-Subscription auf eigene Zeilen, damit z. B. zweites Gerät synchron bleibt.
- Zeitzone: alles UTC in DB, Anzeige in Europe/Berlin via `Intl.DateTimeFormat`.
- Aggregation clientseitig (Einträge sind pro User überschaubar); Admin-Tab nutzt SQL-Aggregat-View `v_timeclock_user_summary` (Stunden pro User/Tag/Woche/Monat) für Performance.
- Keine harten Sperren (auto-clockout bei Mitternacht etc.) — bewusst weggelassen, um nicht überwachend zu wirken. Stattdessen sanfter Hinweis im Popover, wenn ein Eintrag > 12 h offen ist.

## Validierung

- TS-Build.
- Manuell: Einstempeln → Timer läuft → Reload → Timer läuft weiter → Ausstempeln → Eintrag erscheint in Popover und im Admin-Tab.
