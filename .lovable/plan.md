# DMS-Filepicker für E-Mail-Anhänge überarbeiten

## Problem
Der aktuelle `DmsFilePickerDialog` zeigt eine flache, nicht scrollbare Liste aller Dokumente. Es fehlt: Liegenschaftsauswahl, Ordnerstruktur (Kategorien), zuverlässiges Scrollen.

## Ziel
Picker spiegelt die Eigentümer-/Mieter-DMS-Ansicht (`src/pages/weg-owner/Files.tsx`) wider: erst Liegenschaft, dann nach Kategorien (Ordner) gegliederte Dokumente mit Multi-Select.

## Änderungen

### `src/components/meetings/DmsFilePickerDialog.tsx` (Hauptarbeit)

1. **Layout fix**: `DialogContent` mit `max-h-[85dvh] flex flex-col`, scrollbarer Mittelbereich (`flex-1 min-h-0 overflow-y-auto`) statt `ScrollArea` mit fixer Höhe — behebt das „nicht scrollbar"-Problem.

2. **Schritt 1 — Liegenschaft wählen** (nur wenn `buildingId` nicht vorgegeben oder Nutzer mehrere Buildings hat):
   - Lade Buildings, auf die der User Zugriff hat (`buildings` via RLS, oder über `building_users`/Manager-Zuordnung — gleiche Query wie in der DMS-Seite).
   - Karten- oder Listenauswahl. Klick setzt internen `selectedBuildingId`.
   - Wird `buildingId`-Prop übergeben (z. B. aus dem Kontext der E-Mail), Schritt überspringen, aber „Liegenschaft wechseln"-Button anzeigen.

3. **Schritt 2 — Ordnerstruktur** (nach Wahl der Liegenschaft):
   - Lade `building_file_categories` für das Gebäude (mit `parent_id`, `name`, `color`) und `building_files` (gleiche Felder wie heute).
   - Baum-/Akkordeon-Darstellung analog `FilesBrowser` in `weg-owner/Files.tsx`:
     - Kategorien als ausklappbare Ordner (mit `ChevronRight/Down`, `Folder`-Icon, Kindkategorien rekursiv).
     - Unter jedem Ordner die zugehörigen Dateien mit Checkbox, Name, Größe, Datum.
     - Eigene Sektion „Ohne Kategorie".
   - Suchfeld filtert Dateien quer durch alle Ordner (öffnet betroffene Ordner automatisch).
   - Optional: Jahresfilter (Select, analog DMS-Seite), defaultmäßig „Alle".

4. **Multi-Select**:
   - Bereits vorhanden (`selected`-Map), bleibt erhalten.
   - „Alle in Ordner auswählen"-Checkbox je Kategorie-Header.
   - Badge „X ausgewählt" + `Übernehmen`-Button bleiben im Footer.
   - `onSelectItems`-Payload unverändert (`path`, `name`, `mimeType`, `size`), damit `FloatingComposeWindow` ohne Änderung weiterläuft.

5. **Zurück-Button**: Im Header (oder neben Titel) ein `Zurück`-Button bei Schritt 2, um zur Liegenschaftsauswahl zurückzukehren.

### Keine weiteren Dateien
- `FloatingComposeWindow.tsx` muss nicht geändert werden (gleicher Prop-Vertrag).
- Keine DB-/RLS-Änderungen, keine Edge-Functions.

## Nicht enthalten
- Keine Anzeige von Dateien außerhalb einer Liegenschaft (persönliche Dokumente).
- Keine Vorschau/Download im Picker (bleibt reine Auswahl).
- Keine Drag&Drop-Sortierung.

## Testfälle
- Picker öffnen ohne `buildingId` → Liegenschaftsauswahl erscheint, Liste lässt sich scrollen.
- Liegenschaft wählen → Ordnerbaum erscheint, Ordner aufklappbar.
- Mehrere Dateien aus verschiedenen Ordnern auswählen → alle landen als Anhang in der E-Mail.
- Suche „rechnung" → öffnet relevante Ordner und zeigt Treffer.
- `buildingId`-Prop vorgegeben → Schritt 1 übersprungen, „wechseln"-Button funktioniert.
