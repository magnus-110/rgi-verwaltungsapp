# Plan: Wirtschaftsjahr pro Liegenschaft konfigurierbar

## Ziel
1. Die Karte „Allgemeine Infos" wird in der Gebäudeübersicht direkt **unter** den Jahreszyklus-Streifen verschoben (statt ganz unten).
2. In „Allgemeine Infos" kann der Wirtschaftsjahr-Beginn für die Liegenschaft gesetzt werden (Monat + Tag, z. B. 01.07.). Diese Einstellung steuert dann sämtliche Jahreszyklus-/Wirtschaftsjahr-Anzeigen für diese Liegenschaft.

## Änderungen

### 1) Datenbank
Neue Spalten auf `public.buildings`:
- `fiscal_year_start_month` `smallint` (1–12, Default 1)
- `fiscal_year_start_day` `smallint` (1–28, Default 1)

Keine RLS-Änderung (Tabelle besteht bereits).

### 2) Helper `src/lib/annualCycle.ts`
`buildFiscalYears` so erweitern, dass Start-Monat/Tag übergeben werden können:
- bei Default (1/1) bleibt das Verhalten identisch (`2026` → 01.01.–31.12.).
- bei abweichendem Beginn (z. B. 7/1) wird der Zeitraum `2026-07-01` → `2027-06-30` erzeugt; Label = „2026/2027".

### 3) Reihenfolge in `BuildingOverviewTab.tsx`
`<BuildingGeneralInfoCard>` direkt nach `<AnnualCycleTimeline>` rendern (alte Position am Ende entfernen).

### 4) `BuildingGeneralInfoCard.tsx`
- Neues Feld „Wirtschaftsjahr-Beginn" (zwei kleine Selects: Tag + Monat, Default 1. Januar) in den Stammfeldern oben.
- Speichern schreibt `fiscal_year_start_month` / `fiscal_year_start_day` in `buildings`.
- Beim Ändern wird `["building-general-info"]` und `["jz-tasks"]` invalidiert.

### 5) Konsumenten von `buildFiscalYears`
Überall, wo ein konkretes Gebäude im Scope ist, lädt der Aufrufer Start-Monat/Tag aus `buildings` und ruft `buildFiscalYears(currentYear, { startMonth, startDay })`:
- `src/components/buildings/AnnualCycleTimeline.tsx`
- `src/components/buildings/AnnualCycleBuildingTab.tsx`
- Im globalen Überblick (`pages/Jahreszyklus.tsx`, Dashboard-Widgets) bleibt der Kalenderjahr-Default — diese Übersichten sind gebäudeübergreifend.

### 6) Seed-RPC
`seed_annual_cycle_tasks` wird in `AnnualCycleTimeline` bereits mit `selected.start`/`selected.end` aufgerufen — durch den neuen Helper passen Start/Ende automatisch zum konfigurierten Wirtschaftsjahr-Beginn, ohne die RPC anzufassen.

### 7) Finance-Seite
`Finance.tsx` arbeitet mit `billing_periods` (eigene Zeiträume, nicht mit `buildFiscalYears`). Hier sind keine Änderungen nötig — der Beginn wird beim Anlegen neuer `billing_periods` ohnehin manuell gewählt; die neue Building-Einstellung kann später als Default beim Anlegen herangezogen werden (out of scope dieses Tickets).

## Technische Details
- Speicherformat im UI: zwei Select-Felder (Tag 1–28, Monat 1–12). 28-Tage-Limit vermeidet 29.–31.-Edge-Cases.
- Label-Logik: `startMonth === 1 && startDay === 1` → „2026"; sonst „2026/2027".
- Period-Range bei abweichendem Beginn: `start = YYYY-MM-DD`, `end = (YYYY+1)-MM-(DD-1)` (mit korrektem Vormonats-Übergang).

## Out of scope
- Automatisches Anlegen passender `billing_periods` aus dieser Einstellung.
- Migration vorhandener `annual_cycle_tasks`-Zeilen auf neue Zeiträume.
