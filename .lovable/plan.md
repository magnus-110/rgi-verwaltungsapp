## Ziel
Das WEG-Eigentümer-Dashboard (`/weg-owner`) wird auf Basis der Skizze neu strukturiert. Zusätzlich werden Beschlüsse als „umsetzungsrelevant" markierbar, automatisch mit einem Vorgang verknüpft und im neuen Bereich „Beschlüsse" für Eigentümer sichtbar gemacht.

## 1. Datenmodell-Erweiterung

**Migration `etv_resolutions`:**
- `is_actionable boolean default false` — Markierung „umsetzungsrelevant"
- `case_id uuid references public.cases(id) on delete set null` — Verknüpfung zum Vorgang
- `actionable_status text` (open/in_progress/completed) — gespiegelt aus Case-Status für schnelles Filtern

**Trigger:**
- Wird `is_actionable=true` gesetzt und es existiert noch kein `case_id`: automatisch einen `cases`-Eintrag anlegen (title = `resolution_number` + Kurztext, building_id, category='beschluss_umsetzung', status='open', created_by=current_user). Anschließend `case_id` und `actionable_status='open'` zurückschreiben.
- Wird der verknüpfte Case auf `status='closed'` gesetzt: `actionable_status='completed'` im Beschluss spiegeln (Trigger auf `cases`).
- Bei jedem neuen `case_events`-Eintrag: `cases.updated_at` aktualisieren (existiert ggf. schon) — wird im UI als „Letzter Bearbeitungsstand" angezeigt.

## 2. Admin-Seite: Beschluss als umsetzungsrelevant markieren

- In `ResolutionLedger.tsx` und `BuildingResolutionsTab.tsx`: pro Beschluss-Karte ein Toggle/Switch „Umsetzungsrelevant" (nur sichtbar für Admin).
- Bei Aktivierung: optional Quick-Dialog mit Fälligkeit & Verantwortlichem (sonst leer übernommen).
- Anzeige eines kleinen Badges + Verlinkung zum Vorgang, sobald `case_id` gesetzt ist.
- Entlastungsbeschlüsse o. Ä. bleiben einfach ungetoggelt.

## 3. Neues Eigentümer-Dashboard (`src/pages/weg-owner/Dashboard.tsx`)

Aufbau gemäß Skizze (von oben nach unten):

1. **Header** bleibt unverändert (Logo + Menü via `WegOwnerLayout`).
2. **„Willkommen zurück, {first_name}"** + Liste der zugeordneten Gebäude (wie aktuell).
3. **Zwei Stat-Kacheln nebeneinander:**
   - „Offene Meldungen" → zählt eigene `weg_reports` mit `status='open'`, Klick → `/weg-owner/reports`
   - „Offene Beschlüsse" → zählt `etv_resolutions` mit `is_actionable=true AND actionable_status!='completed'` für die Buildings des Users, Klick → `/weg-owner/resolutions`
4. **Jahreszyklus-Widget (vereinfacht, neu):**
   - Komponente `OwnerAnnualCycleWidget`.
   - Pro Gebäude: Building-Selector oben rechts (wenn >1 Gebäude).
   - Horizontale Timeline (5–7 Hauptmeilensteine aus `ANNUAL_CYCLE_TASKS`), Schritte als gefüllte/halb-gefüllte/leere Kreise je Status. Read-only, kein Edit-Popover.
5. **Vier Schnellaktions-Kacheln (Icons + Label):** Dokumente · Chat · Schwarzes Brett · Versammlungen. (Bedingung: „Dokumente" nur wenn `hasVisibleFiles`.)
6. **Kontakt & Notfall:**
   - Erst RGI-Kontaktblock (Telefon, E-Mail, Adresse — aus `PROPERTY_MANAGER_FALLBACK`).
   - Darunter ausklappbarer Block „Handwerker / Notfallkontakte" → wiederverwendet `EmergencyContactsWidget` mit den Building-IDs des Users.

## 4. Neue Eigentümer-Route „Beschlüsse"

- Neue Seite `src/pages/weg-owner/Resolutions.tsx` mit Tabs:
  - **„Umzusetzen"** — alle `is_actionable=true AND actionable_status!='completed'` Beschlüsse mit:
    - Beschlusstext, Versammlung, Datum
    - Status-Badge (offen / in Bearbeitung / abgeschlossen)
    - „Letzter Bearbeitungsstand: TT.MM.JJJJ" (= `cases.updated_at` bzw. neuster `case_events.occurred_at`) — **nur Datum, kein Inhalt**.
  - **„Alle Beschlüsse"** — komplette Beschlusssammlung der Gebäude des Users (gefiltert auf `published=true`).
- Route in `App.tsx` registrieren: `/weg-owner/resolutions`.
- Eintrag „Beschlüsse" (Icon `Scale`) in `navigationItems` von `WegOwnerLayout.tsx` ergänzen.

## 5. Auto-Sync Vorgang ↔ Beschluss
- Wenn Verwaltung den Case schließt → Beschluss erscheint nicht mehr in „Umzusetzen" und Stat-Zähler sinkt (per Trigger oben).
- Reaktivierung des Cases setzt `actionable_status` zurück auf `open`/`in_progress`.

## 6. Anzeige „Letzter Bearbeitungsstand"
- Quelle: `MAX(case_events.occurred_at)` pro Case, fallback `cases.updated_at`.
- Format: `Letzter Bearbeitungsstand: 08.06.2026` — kein Eventtitel/-text (DSGVO-light für Eigentümer).

## Technische Notizen
- Alle neuen Selects per `building_id IN (weg_owner_buildings of current user)` einschränken.
- RLS-Policy für `etv_resolutions` muss `is_actionable`/`actionable_status` lesen lassen — die bestehende SELECT-Policy für WEG-Eigentümer prüfen, ggf. erweitern, damit auch unpublished-actionable nicht ungewollt sichtbar wird (nur `published=true`).
- Keine Änderung an bestehender Admin-Versammlungs-Logik außer dem neuen Toggle und Auto-Case-Erstellung.

## Out of Scope
- Tenant-Dashboard (Mieter) — bleibt unverändert.
- Inhaltliche Bearbeitungs-Historie im Eigentümer-Portal (nur Datum, kein Text).
