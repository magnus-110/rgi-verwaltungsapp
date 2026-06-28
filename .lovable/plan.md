## Problem

Aktuell flackern die Abschnitte 1 (Wohnung) und 2 (Mieter) leer auf und werden schrittweise befüllt, während mehrere asynchrone Ladevorgänge (Wohnungen → Perioden → Positionen/Mieter/Kosten) nacheinander laufen. Es ist unklar, ob noch geladen wird oder ob bereits keine Daten vorhanden sind.

## Ziel

Eine einzige, klare Ladephase: Solange irgendetwas geladen wird, sieht der Nutzer einen Ladebildschirm. Danach entweder eine eindeutige Hinweismeldung (falls keine Daten hinterlegt sind) oder das vollständig vorbefüllte Formular.

## Änderungen (nur `src/pages/weg-owner/NebenkostenTool.tsx`)

1. **Drei separate Ladeflags einführen** (statt nur `loadingData`):
   - `loadingAssignments` (Initial true, false nach `list-owner-units`)
   - `loadingPeriods` (true sobald ein `assignmentId` gesetzt wird, false nach Periodenabfrage; false wenn keine Wohnung gewählt)
   - `loadingData` bleibt wie gehabt für Positionen/Mieter/Extra-Kosten
   - Abgeleitet: `isInitialLoading = loadingAssignments || (assignmentId && loadingPeriods) || (assignmentId && periodId && loadingData)`

2. **Vollbild-Ladezustand** vor dem `<h1>` Heading bzw. anstelle des Formulars rendern:
   - Zentrierter Spinner (`Loader2 animate-spin`) + Text „Daten werden geladen …"
   - Wird angezeigt, solange `isInitialLoading` true ist
   - Der „Zurück"-Button bleibt sichtbar

3. **Empty-State nach Laden**:
   - Wenn `assignments.length === 0` → bestehende rote Alert-Box „Keine Wohnung hinterlegt … kontaktieren Sie die Verwaltung" anzeigen, plus klarer Hinweis: „Die Nebenkostenabrechnung kann noch nicht erstellt werden."
   - Wenn nur eine Wohnung existiert (Auto-Select greift bereits) und `periods.length === 0` → bestehende Alert „Noch keine WEG-Abrechnung finalisiert" + gleicher Hinweis. Wenn mehrere Wohnungen vorhanden sind, normal Select anzeigen und Alert erst nach Auswahl.

4. **Sektionen 1–4 erst rendern, wenn `!isInitialLoading`** – damit nichts mehr leer aufflackert. Innerhalb Sektion 3/4 die bisherigen `loadingData ? <LoadingRow/>` Zweige entfernen (nicht mehr nötig, da global gewartet wird).

5. **`canBuy`** bleibt unverändert (hängt bereits an `!loadingData`).

## Technische Details

- Initiale States: `loadingAssignments=true`, `loadingPeriods=false`, `loadingData=false`.
- `useEffect` #1 (Wohnungen): `finally { setLoadingAssignments(false) }`.
- `useEffect` #2 (Perioden): am Anfang `setLoadingPeriods(true)` wenn `selectedAssignment` vorhanden, in `.then/.catch` jeweils `setLoadingPeriods(false)`.
- `useEffect` #3 (Daten): wie bisher, setzt `loadingData`.
- Loading-Komponente nutzt vorhandenes RGI-Styling (kein neues Design-System).

Keine Logik-/Backend-Änderungen, reine UI/Lade-Choreographie.