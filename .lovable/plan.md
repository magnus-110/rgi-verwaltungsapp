# Schlüssel-Modul: 3 Verbesserungen

## 1) Dateien am Anhänger sichtbar & austauschbar (KeyTagDialog)

Problem: Beim Schlüssel `10/01-02 O` (Achweg 3-5) wurde versehentlich ein PDF hochgeladen, wo ein Foto hin sollte. Aktuell ist die Dateiliste eher versteckt und das Foto lässt sich nicht ersetzen/löschen.

Änderungen in `src/components/buildings/keys/KeyTagDialog.tsx`:

- **Foto-Bereich**: Wenn bereits ein `photo_path` existiert, Thumbnail (signed URL) anzeigen mit Buttons „Öffnen“, „Löschen“ und „Ersetzen“. Löschen entfernt Storage-Objekt + setzt `photo_path=null`.
- **Weitere Dateien**: Bestehende Liste (`tagFiles`) prominenter darstellen — Icon je Typ (Bild/PDF/anderes), Dateiname als Link, kleiner Thumbnail bei Bildern, Löschbutton. Bereits vorhanden, wird visuell überarbeitet und mit Zähler versehen.
- Neue Dateien lassen sich weiterhin über den Datei-Auswähler ergänzen; nach dem Speichern erscheinen sie sofort in der Liste (Query-Invalidation).

## 2) Farbmix bei Anhänger-Ausdruck beheben (`tagTemplate.ts`)

Ursache (in Deiner Vorlage verifiziert): die Zellen enthalten `<w:tcPr><w:shd w:fill="4EA72E"/>` / `FFA500` / `EE0000`. Die aktuelle Funktion `stripPlaceholderColoring` entfernt nur die Formatierung im `<w:r>`-Run, nicht die **Zellen-Hintergrundfarbe** in `<w:tcPr>`. Dadurch bleibt die farbige Zelle sichtbar, obwohl der Platzhalter leer ist. Außerdem bricht die Funktion nach dem ersten Vorkommen ab und findet weitere Zellen desselben Platzhalters nicht.

Fix:
- Für jeden nicht befüllten Platzhalter (`{g}`, `{o}`, `{r}`) die **umschließende Tabellenzelle** ermitteln (mit Depth-Counter für verschachtelte Tabellen — Logik ist bereits in `stripCellColoring` vorhanden) und dort `<w:shd .../>`, `<w:color .../>`, `<w:highlight .../>` entfernen — sowohl im `w:tcPr` als auch in allen Runs der Zelle.
- Die Zellen-Suche über **alle** Vorkommen des Platzhalters iterieren (auch bei über mehrere `<w:r>` gesplitteten Platzhaltern: virtueller Gesamttext aller `<w:t>` in der Zelle bilden und prüfen, ob der Platzhalter darin vorkommt).
- Ergebnis: Bei Auswahl „grün“ bleibt nur die grüne Zelle gefärbt; orange und rote Zellen werden hintergrund- und schriftfarblos.

## 3) Automatische Bildkomprimierung beim Upload

Ziel: Fotos/Bilder, die bei Schlüsseln (Foto & Weitere Dateien) hochgeladen werden, werden client-seitig verkleinert, bevor sie in Storage landen — reduziert Speicherverbrauch und Ladezeit.

Umsetzung:
- Neue Hilfsdatei `src/lib/compressImage.ts`: Canvas-basiert, ohne zusätzliche NPM-Abhängigkeit.
  - Nur wenn `file.type.startsWith("image/")` und nicht `image/gif`/`image/svg+xml`.
  - Zielmaße: max. 1920 px Kante, JPEG-Qualität 0.82.
  - Wenn das Ergebnis größer als das Original ist, Original beibehalten.
  - Rückgabe: neues `File`-Objekt mit derselben Basis-Namen aber `.jpg`-Endung.
- Aufruf in `KeyTagDialog.save()` für `photoFile` und für jeden Eintrag in `attachFiles`, direkt vor dem `supabase.storage.upload(...)`.
- Keine Kompression bei PDFs/Word/etc.

## Technische Details

- Keine DB-Migration nötig; Storage-Struktur bleibt unverändert.
- `key_tag_files` wird bereits sauber gepflegt (Delete-Handler existiert).
- Farb-Fix betrifft ausschließlich Client-seitige XML-Manipulation vor dem `zip.generate(...)` — kein Server-Roundtrip.
- Kompression läuft im Browser (Canvas + `toBlob`); keine Auswirkung auf bestehende Uploads.
