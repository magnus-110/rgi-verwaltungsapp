# Ursache

In deiner Vorlage stehen `{g}`, `{r}`, `{o}` **nicht in Tabellenzellen**, sondern als bunt eingefärbte Runs direkt hintereinander in einem Absatz. Word hat `{r}` und `{o}` außerdem über mehrere `<w:r>`-Runs gesplittet (`{r` + `}` bzw. `{` + `o` + `}`).

Der aktuelle Ablauf in `src/components/buildings/keys/tagTemplate.ts`:

1. `stripCellColoring("{o}")` findet keine umschließende `<w:tc>` → Fallback auf `stripRunColoring`.
2. `stripRunColoring` sucht per `xml.indexOf("{o}")` — findet **nichts**, weil `{o}` gesplittet ist → tut gar nichts.
3. `replaceSplitPlaceholder` leert nur den Text, lässt aber `<w:rPr><w:shd .../></w:rPr>` mit der Füllfarbe stehen.

Ergebnis: Die farbigen Runs von `{r}`/`{o}` behalten ihre Hintergrundfarbe, obwohl sie leer sind → beim Druck erscheinen zusätzliche orange/rote Streifen.

# Fix

Ich ersetze `stripRunColoring` / `stripCellColoring` durch **eine** Funktion `stripPlaceholderColoring`, die gesplittete Platzhalter korrekt behandelt:

1. Alle `<w:r>...</w:r>`-Blöcke mit ihrem enthaltenen `<w:t>`-Text indexieren (wie `replaceSplitPlaceholder`).
2. Über den konkatenierten virtuellen Text jedes Vorkommen des Platzhalters lokalisieren.
3. Für **jeden** Run, der den Platzhalter-Bereich überlappt, aus dem `<w:rPr>` die Tags `<w:shd .../>`, `<w:color .../>`, `<w:highlight .../>` entfernen — sowohl selbstschließend als auch mit Attributen (`<w:shd ... />`).
4. Falls (wie in dieser Vorlage) direkt an den Platzhalter angrenzende leere Whitespace-Runs zwischen den Farb-Placeholdern liegen, bleiben sie unverändert (keine Farbe).

Datei: `src/components/buildings/keys/tagTemplate.ts`
- Entfernt: `stripCellColoring`, `stripRunColoring` (bzw. bleiben nur als interner Fallback).
- Neu: `stripPlaceholderColoring(xml, placeholder)`.
- Aufrufe in Zeilen 71–73 auf die neue Funktion umstellen.
- Reihenfolge beibehalten: erst Farbe entfernen, dann `replaceSplitPlaceholder` mit `""` bzw. `"GG"/"OO"/"RR"`.

Keine Änderungen an Vorlage, DB oder anderer UI.

# Verifikation

- Build muss durchlaufen.
- Danach ein grüner, ein oranger und ein roter Anhänger testen — jeweils darf nur die eine Farbe erscheinen.
