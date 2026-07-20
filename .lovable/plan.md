## Ursache

In `src/components/buildings/keys/tagTemplate.ts` löscht `stripRunColoring` beim leeren Platzhalter nur die Formatierung des **einzelnen `<w:r>`-Runs**, der den Platzhalter enthält. Nicht angetastet werden:

- **Zellen-Schattierung** in `<w:tc><w:tcPr><w:shd .../>` (das ist in Word-Vorlagen für farbige Anhänger der Standard-Weg, weil man dort per Rechtsklick → „Rahmen und Schattierung" die Zellen-Hintergrundfarbe setzt).
- **Weitere Runs derselben Zelle** (Word splittet Text regelmäßig in mehrere `<w:r>` mit identischem `<w:rPr><w:shd/></w:rPr>`).

Effekt: Wenn `{o}` leer ist, bleibt die orange Zelle trotzdem orange eingefärbt → bei grüner Auswahl siehst du „Grün + Orange", bei roter „Rot + Orange", bei oranger nur „Orange" (weil die anderen zwei Zellen offenbar keine Cell-Shading haben, die orange schon).

## Fix

Nur Datei `src/components/buildings/keys/tagTemplate.ts` anfassen (kein DB-, kein UI-Change nötig).

### 1. Neue Helper-Funktion `stripCellColoring(xml, placeholder)`

- Ausgehend vom Platzhalter-Index das **umschließende `<w:tc>`** finden (nächstes `<w:tc ...>` rückwärts, passendes `</w:tc>` vorwärts).
- Innerhalb dieses Cell-Blocks entfernen:
  - `<w:shd .../>` in `<w:tcPr>` (Zellenhintergrund),
  - **alle** `<w:shd .../>`, `<w:color .../>`, `<w:highlight .../>` (Run-Ebene, kein Limit auf einen Run mehr).
- Zusätzlich `<w:tcBorders>`-Farben unangetastet lassen (nur Shading/Font-Color/Highlight).
- Fallback: findet sich kein umschließendes `<w:tc>` (z. B. Vorlage ohne Tabelle), auf das bisherige Run-Verhalten zurückfallen.

### 2. Aufrufe umstellen

Zeilen 71–73:

```ts
if (!fillGreen)  xml = stripCellColoring(xml, "{g}");
if (!fillOrange) xml = stripCellColoring(xml, "{o}");
if (!fillRed)    xml = stripCellColoring(xml, "{r}");
```

Die alte `stripRunColoring` bleibt als interner Fallback, wird aber vom neuen Helper aufgerufen.

### 3. Robustheit

- Beim Suchen nach `<w:tc>`/`</w:tc>` verschachtelte Tabellen berücksichtigen (Depth-Counter, kein simples `indexOf`, damit z. B. Nested Tables in einer Zelle nicht die Grenzen sprengen).
- Nur die **erste** Cell rund um den Platzhalter behandeln; falls derselbe Platzhalter mehrfach in verschiedenen Zellen vorkommt, in einer Schleife alle Vorkommen abarbeiten, bis keiner mehr gefunden wird.

## Verifikation

1. In der App für den Neuen Weg 14 (oder eine Test-Liegenschaft) je einen Schlüsselanhänger in Grün, Rot und Orange erstellen und drucken.
2. Erwartet:
   - Grün → nur grüne Zelle gefüllt, orange & rote Zelle **weiß**.
   - Rot → nur rote Zelle gefüllt.
   - Orange → nur orange Zelle gefüllt.
3. Zur Sicherheit die generierte DOCX einmal entpacken (`unzip -p Anhaenger_*.docx word/document.xml`) und prüfen, dass in den beiden ungenutzten Zellen kein `<w:shd .../>` mehr im `<w:tcPr>` steht.

## Nicht Teil dieses Fixes

- Keine Änderungen an der Word-Vorlage selbst — die aktuelle Vorlage bleibt gültig.
- Keine Änderung an der Farbwerkung (`isGreenish` / `isOrangeish` / `isReddish`).
- Keine Änderung an §35a / Bank-Reconciliation / anderen Themen aus vorherigen Turns.
