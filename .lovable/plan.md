## Ziel

Die Seite „Meldungen" wird zu einem zentralen Modul **„Tickets"** ausgebaut. Darin werden zwei eng verwandte Dinge zusammengeführt, die heute getrennt sind:

- **Meldungen** – einzelne Eingänge (z.B. Schaden, Beschwerde, Anfrage), die ein Bewohner oder Eigentümer absetzt.
- **Vorgänge** – die übergeordnete Akte, die mehrere Meldungen, E-Mails, Termine, Dokumente und Notizen zu einem Thema bündelt.

Die separate Seite „Prozesse" (Standard-Workflows mit Templates, z.B. Eigentümerwechsel) bleibt unverändert eigenständig.

## Navigation & Benennung

- Sidebar-Eintrag „Meldungen" → **„Tickets"** (Icon bleibt: ClipboardList).
- Route bleibt `/reports` (für Bookmarks), Tabs entscheiden über Inhalt.
- Pfad-Aliase: `/tickets` und `/tickets/vorgaenge` lenken auf dieselbe Seite mit vorausgewähltem Tab.

## Seitenaufbau

```text
┌─ Tickets ─────────────────────────────────────────────┐
│  [ Meldungen ]  [ Vorgänge ]            (Tab-Switch)  │
├───────────────────────────────────────────────────────┤
│  Filterleiste: Gebäude ▾  Status ▾  Priorität ▾       │
│                Kategorie ▾  Zuständig ▾  🔍 Suche      │
│                                       [ Liste | Board ]│
├───────────────────────────────────────────────────────┤
│  Inhalt je nach Tab + Ansicht                         │
└───────────────────────────────────────────────────────┘
```

### Tab 1: Meldungen
Bleibt funktional wie heute (Reports), nur visuell harmonisiert mit Tab 2. Aktion „In Vorgang überführen / verknüpfen" bleibt erhalten.

### Tab 2: Vorgänge (NEU als globale Übersicht)
Heute gibt es Vorgänge nur pro Gebäude (`useCases(buildingId)`). Wir ergänzen eine **gebäudeübergreifende** Liste mit zwei Darstellungen:

**Liste (Default)** – kompakte Tabelle:

| Titel | Gebäude | Kategorie | Priorität | Status | Zuständig | Fällig | Aktualisiert |

- Inline-Sortierung pro Spalte, Klick öffnet die bestehende `CaseDetailView` als Drawer/Sheet.
- Badges für Priorität (Farben gemäß Core-Memory: Niedrig grün, Mittel orange, Hoch rot, Dringend dunkelrot).
- Statusfarben dezent (offen / in Bearbeitung / wartet / erledigt).
- Mini-Indikatoren: Anzahl Events, verknüpfte Meldungen, offene To-Dos.

**Board (Toggle)** – Kanban nach Status:

```text
Offen  │ In Bearbeitung │ Warte auf Extern │ Warte auf Eigent. │ Erledigt
───────┼────────────────┼──────────────────┼───────────────────┼─────────
[Card] │ [Card]         │ [Card]           │ [Card]            │ [Card]
[Card] │ [Card]         │                  │                   │ [Card]
```

- Karten zeigen: Titel, Gebäude (kleines Label), Priorität-Dot, Fälligkeit, Zuständig (Avatar).
- Drag & Drop zwischen Spalten ändert `status` (über `useUpdateCase`).
- Spalten zählen Tickets oben; „Erledigt" ist standardmäßig auf 30 Tage begrenzt, aufklappbar.

### Gemeinsame Filterleiste
Wirkt auf beide Tabs (Filter bleiben bei Tab-Wechsel erhalten):
- Gebäude (Multi-Select, Default „Alle aktiven")
- Status (passend pro Tab)
- Priorität, Kategorie, Zuständig, Suche (Volltext über Titel/Beschreibung)
- Respektiert `management_mode` (weg/rent) wie heute global gesetzt.

### Schnellaktionen oben rechts
- **+ Neuer Vorgang** (öffnet bestehenden `CreateCaseDialog`, Gebäude vorwählbar)
- **+ Neue Meldung** (bestehender Pfad)
- Export Excel (wie heute bei Meldungen)

## Detail-Drawer

Bei Klick auf einen Vorgang in Liste oder Board öffnet sich ein **rechter Drawer** (`Sheet`, ~720 px) mit der vorhandenen `CaseDetailView` (Timeline, KI-Zusammenfassung, Events, Ask-AI). Vorteil: Übersicht bleibt sichtbar, schnelles Durchklicken mehrerer Vorgänge möglich.

## KI-Readiness (gemäß Projektprinzipien)

- Vorgänge tragen bereits `ai_summary`, `ai_keywords`, `ai_next_steps` – diese werden in der Liste als kurze 1-Zeilen-Zusammenfassung unter dem Titel (truncated) angezeigt.
- Filter- und Suchfeld erlauben gezielte Auswahl als künftiger Kontext für Mistral/Nova.
- Verknüpfung Meldung ↔ Vorgang bleibt strukturierter Trainings-/Kontext-Anker.

## Technische Umsetzung

**Neue/erweiterte Hooks**
- `useCases.tsx`: zusätzliche Funktion `useAllCases(filters)` ohne `buildingId`-Pflicht; selektiert über erlaubte Gebäude + RLS, Joins auf `buildings(name)`, Aggregation Event-Anzahl per `case_events_count` (Subquery oder zweiter Query).
- Re-use `useUpdateCase` für DnD-Status-Update.

**Neue Komponenten** (in `src/components/cases/`)
- `CasesGlobalList.tsx` – Tabellen-Ansicht mit Sortier-Headern.
- `CasesBoard.tsx` – Kanban (eine einfache Spalten-Lösung; falls DnD bereits via `@dnd-kit` im Projekt nutzbar, wiederverwenden – sonst optimistisches Update per Klick-Menü „Status ändern").
- `CaseRowCard.tsx` / `CaseBoardCard.tsx` – wiederverwendbare Karte.
- `CaseDetailDrawer.tsx` – Sheet-Wrapper um die vorhandene `CaseDetailView`.
- `TicketsFilterBar.tsx` – gemeinsame Filterleiste (URL-Sync via `useSearchParams`).

**Seiten-Refactor `src/pages/Reports.tsx`**
- Datei wird zu `src/pages/Tickets.tsx` umbenannt (alter Default-Export bleibt als Re-Export für Kompatibilität).
- Oberster `Tabs`-Wrapper mit `value` aus URL (`?tab=meldungen|vorgaenge`).
- Bestehende Meldungen-Logik wandert in Sub-Komponente `MeldungenTab.tsx` (Code-Split, da heute >1000 Zeilen).

**Routing (`src/App.tsx`)**
- `/reports`, `/admin/reports` weiterhin auf neue Komponente.
- Zusätzlich `/tickets` und `/tickets/vorgaenge` als Aliase.

**Sidebar (`src/components/AdminSidebar.tsx`)**
- Eintrag `title: "Tickets"`, `url: "/tickets"`. Active-Match ergänzen, dass beide Pfade markieren.

**Mobile**
- Filterleiste klappt in „Filter"-Button mit Sheet.
- Board horizontal scrollbar; Liste wird zu Kartenliste mit den wichtigsten Feldern.

## Was nicht geändert wird

- Datenmodell `cases` / `case_events` / Reports bleibt unverändert – keine Migration nötig.
- Eigentümer-/Mieter-Portale bleiben funktional gleich (sie sehen weiterhin nur ihre eigenen Meldungen).
- Seite „Prozesse" (Standard-Workflows) bleibt eigenständig im Menü.

## Lieferumfang

1. Sidebar-Umbenennung „Meldungen" → „Tickets".
2. Refactor `Reports.tsx` in `Tickets.tsx` mit Tab-Switch (Meldungen / Vorgänge), URL-State.
3. Globale Vorgänge-Übersicht mit Liste + Board-Toggle, gemeinsame Filterleiste.
4. Detail-Drawer für Vorgänge (wiederverwendet `CaseDetailView`).
5. Drag-&-Drop Statuswechsel im Board (oder Statusmenü als Fallback).
6. URL-Aliase `/tickets` und `/tickets/vorgaenge`.
