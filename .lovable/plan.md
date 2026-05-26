## Ziel
Platzhalter darf mit Leerzeichen/Tabs in der Zeile stehen (für die Positionierung), trotzdem soll der Farbpunkt erhalten bleiben.

## Lösung: Inline-Platzhalter mit Farb-Modul

Wir wechseln in `src/components/buildings/keys/tagTemplate.ts` von raw-xml (`{@anhaenger}`) auf einen **normalen Platzhalter** plus zwei farbgesteuerte Inline-Tags:

**Neue Vorlagen-Syntax (Beispiel mit Einrückung durch Leerzeichen/Tabs):**
```
        {dot} {anhaenger}
```

- `{dot}` → wird durch ein farbiges „●" ersetzt (Farbe = key_type.color_hex)
- `{anhaenger}` → wird durch den Infotext ersetzt (Tag-Nr · Typ · Schließplan · Liegenschaft)

Beides sind **normale Tags**, die mitten in einer Zeile mit beliebigem Text/Whitespace davor und danach stehen dürfen. Damit ist die Multi-Error-Beschränkung weg.

### Wie der Farbpunkt funktioniert
docxtemplater ersetzt `{dot}` nur durch Text. Damit der Punkt farbig wird, registrieren wir ein kleines **inspect/postparse-Modul** bzw. nutzen einen einfacheren Weg:

**Einfacher Weg (empfohlen, kein Custom-Modul):**
In der Word-Vorlage formatiert der Nutzer **die Stelle `{dot}` selbst farbig** ist nicht möglich, weil die Farbe pro Anhänger variiert. Daher nutzen wir doch raw-xml, aber **nur für den Punkt allein**, mit der Regel "raw-xml-tag muss alleiniger Inhalt seines Absatzes sein" umgehen wir, indem `{@dot}` in einer **eigenen Tabellenzelle** oder **eigenen Zeile** steht — was die UX wieder verkompliziert.

**Saubere Lösung: Custom Inline-Modul**
Wir registrieren bei Docxtemplater ein einfaches Modul, das beim Parsing den Tag `{dot}` durch ein `<w:r>` mit Farbe ersetzt (Inline-Run statt Absatz). Das umgeht die Paragraph-Beschränkung komplett, weil wir nicht über raw-xml gehen, sondern direkt das XML-AST manipulieren.

Implementierung in `tagTemplate.ts`:
- Custom `parser`-Funktion für Tag `dot`, die ein `{ raw: '<w:r>…</w:r>' }` zurückgibt → docxtemplater bietet dafür `inspect-module`/`{@inline}` nicht direkt; daher nehmen wir den **pragmatischen Weg**:

**Pragmatischer finaler Weg:**
1. Vorlage enthält den Tag `{anhaenger}` mit beliebigem Whitespace davor (für Positionierung).
2. **Vor** dem Docxtemplater-Render machen wir einen direkten String-Replace im document.xml: Wir suchen `{anhaenger}` im XML und ersetzen den umschließenden `<w:r>…<w:t>…{anhaenger}…</w:t>…</w:r>` durch unsere mehreren `<w:r>`-Runs (farbiger Punkt + Text). Die Leerzeichen/Tabs davor bleiben unberührt, weil sie in einem **separaten** `<w:r>` stehen (Word splittet Runs nach Formatierung).

Diese Lösung:
- ✅ Erlaubt Leerzeichen/Tabs/Text vor `{anhaenger}` in derselben Zeile
- ✅ Farbiger Punkt aus `key_types.color_hex`
- ✅ Kein Multi-Error mehr
- ✅ Kein extra User-Setup nötig

### Änderungen
- `src/components/buildings/keys/tagTemplate.ts`: raw-xml-Replace ersetzen durch direkten XML-String-Replace auf `word/document.xml` (via PizZip), Tag wieder `{anhaenger}` (ohne `@`).
- `src/components/buildings/keys/BuildingKeysTab.tsx`: Hinweistext aktualisieren — „In der Vorlage `{anhaenger}` schreiben, beliebig eingerückt mit Leerzeichen oder Tabs."

Keine DB-Änderung, keine neuen Dependencies.
