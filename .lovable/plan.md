## Ziel
1. Andrej Javornik (und alle Eigentümer) sehen ihre Wohnung im Nebenkosten-Tool zuverlässig.
2. Die geführten Touren starten **nicht mehr automatisch** beim Öffnen einer Unterseite — Eigentümer rufen sie aktiv über den Hilfe-Button auf.

---

## 1. Wohnung wird nicht angezeigt

### Diagnose
- Die DB-Daten sind vorhanden: Andrej (`user_id 9efd…2731b`) hat Contact `c9685…591081` mit aktivem Assignment in Gebäude „Tirolerstr. 142", Whg. `0001`.
- RLS auf `contacts`, `contact_building_assignments` und `buildings` erlaubt den Lesezugriff für `weg_owner`.
- Die aktuelle Frontend-Abfrage in `NebenkostenTool.tsx` macht **zwei getrennte Roundtrips** (`contacts` → `contact_building_assignments`) und joint zusätzlich `buildings(...)`. Wenn einer dieser Calls leer / null zurückkommt (z. B. weil `is_active` Flag bei Migration nicht gesetzt war, oder die Buildings-RLS bei seltenen Edge-Cases greift), zeigt der Selector lautlos "Bitte wählen" — es gibt kein sichtbares Fehler-/Leer-Feedback.

### Fix
- **Neue Edge Function** `list-owner-units` (service-role): liefert für den eingeloggten User alle aktiven Wohnungen inkl. Gebäudename/-adresse in **einem** RPC, robust gegen RLS-Edge-Cases und gibt sprechende Fehler zurück.
- `NebenkostenTool.tsx`:
  - Daten via `supabase.functions.invoke("list-owner-units")` laden statt zwei getrennter Queries.
  - **Empty-State**-Karte unter dem Auswahl-Block, wenn `assignments.length === 0`: Hinweis „Für Ihren Account ist aktuell keine Wohnung hinterlegt — bitte info@rgi-immobilien.de / 08363 960656 kontaktieren."
  - Console-Log bei Fehler / leerem Resultat (hilft Debug künftiger Fälle).

---

## 2. Auto-Start der Touren deaktivieren

### Fix
- `useAutoStartPageTour(...)`-Aufrufe entfernen in:
  `Dashboard.tsx`, `Reports.tsx`, `Files.tsx`, `Resolutions.tsx`, `Forum.tsx`, `Meetings.tsx`, `Chatbot.tsx`, `Settings.tsx`, `CashAudit.tsx`.
- In `GuidedTourProvider.tsx` den automatischen Dashboard-Tour-Start (`useEffect` Zeile 340–347) entfernen.
- `useAutoStartPageTour` Hook bleibt vorerst exportiert (rückwärtskompatibel), wird aber nicht mehr genutzt — kann später entfernt werden.
- Hilfe-Button (FAB) und die manuelle „Diese Seite erklären"-Aktion bleiben **unverändert**: Touren laufen nur noch on demand.

---

## Technische Details

**Neue Datei**: `supabase/functions/list-owner-units/index.ts`
- Auth-Check via Bearer Token.
- Service-Role-Query: `contacts` (user_id = me) → `contact_building_assignments` (is_active) → `buildings`.
- Response: `{ units: [{ id, unit_number, building_id, building_name, building_address }] }`.

**Geänderte Dateien**:
- `src/pages/weg-owner/NebenkostenTool.tsx` — Auswahl-Loader auf Edge Function umstellen + Empty-State.
- `src/components/weg-owner/onboarding/GuidedTourProvider.tsx` — Auto-Start-`useEffect` entfernen.
- 9× `src/pages/weg-owner/*.tsx` — `useAutoStartPageTour(...)`-Aufrufe und Imports entfernen.
