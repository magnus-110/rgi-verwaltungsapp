## Ziel
Die Vorgänge-Übersichtsseite (`/tickets/vorgaenge`) wird neu strukturiert, sodass auf den ersten Blick klar ist, **um welchen Vorgang es geht** — ohne visuelles Rauschen durch Kategorie und Priorität.

## Änderungen in `src/components/cases/CasesGlobalView.tsx`

### 1. Filter & Spalten entfernen
- Filter „Priorität" und „Kategorie" aus der Toolbar entfernen (inkl. zugehöriger States `priorityFilter`, `categoryFilter`).
- Suche, Gebäudefilter, Statusfilter, View-Toggle und „Neuer Vorgang" bleiben.
- KPI-Reihe (5 Status-Kacheln) bleibt unverändert.

### 2. Neue, übersichtliche Listendarstellung (`CasesList`)
Statt 8-spaltigem Tabellengrid → **gestapelte Zeilen mit klarer Hierarchie**:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ ● [Großer Titel des Vorgangs]                       [Status-Pill]   │
│   🏢 Gebäudename · WE 3   •   💬 4   •   ⏰ fällig 12.06.   • vor 2h│
│   ↳ Kurzzusammenfassung aus ai_summary (1 Zeile, muted)             │
└─────────────────────────────────────────────────────────────────────┘
```

Konkret:
- **Zeile 1:** Statuspunkt (kleiner farbiger Dot nach Status statt Priorität) + **fetter Titel (text-base)** links; Status-Select als kompakte Pill rechts.
- **Zeile 2 (Meta):** Gebäude (+ ggf. `unit_number`), Event-Count, Fälligkeit (rot wenn überfällig), „vor X" — alle in `text-xs text-muted-foreground`, durch `·` getrennt.
- **Zeile 3 (optional):** Erste Zeile aus `ai_summary` als einzeiliger truncate-Text, falls vorhanden.
- Hover: dezenter `bg-muted/40` + Lösch-Icon erscheint rechts.
- Keine Badges mehr für Kategorie/Priorität in der Liste.

### 3. Board-Ansicht (`CasesBoard`)
- Karten ebenfalls entschlacken: nur Titel (font-medium), darunter Gebäude + Meta-Zeile, kein Kategorie-Badge, kein Prioritäts-Badge. Lösch-Button & Status bleiben.

### 4. Sortierung
- Default-Sortierung der Liste: überfällige zuerst, dann nach `updated_at` desc (bisher nur `updated_at`). Liefert relevantere Reihenfolge ohne Prio-Filter.

## Nicht geändert
- `useCases`-Hook, DB-Schema, `CaseDetailView` (dort bleiben Kategorie & Priorität editierbar).
- Routing, Tabs in `Tickets.tsx`.
- `BuildingCasesTab` (gebäude-interne Ansicht) — Scope ist nur die globale Vorgänge-Seite.
