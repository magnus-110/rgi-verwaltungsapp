## Ziel

Statt einer ZIP mit N Einzel-DOCX soll **eine einzige DOCX-Datei** erzeugt werden, in der alle personalisierten Briefe hintereinander stehen — jeder Brief beginnt auf einer neuen Seite.

## Komplexität

**Einfach.** Es gibt zwei saubere Wege; wir nehmen den robusten:

### Ansatz: Template wiederholt rendern + Seitenumbrüche zwischen den Briefen

Pro Empfänger wird die bestehende Word-Vorlage gerendert (genau wie heute). Statt die Ergebnisse einzeln in eine ZIP zu packen, fügen wir die `<w:body>`-Inhalte aller gerenderten Dokumente nacheinander in **ein** DOCX zusammen und setzen zwischen den Briefen einen harten Seitenumbruch (`<w:br w:type="page"/>`).

Vorteile:
- Vorlage, Platzhalter, Header/Footer, Logos, Schriftarten bleiben **unverändert**
- Kein zweites Template nötig
- Funktioniert mit der vorhandenen `docxtemplater` + `pizzip` Pipeline
- Reihenfolge ist deterministisch (gleiche Sortierung wie heute)

Nachteil: Wenn die Vorlage einen abweichenden „Section/Header/Footer pro Brief" bräuchte, müsste man Section-Properties mitkopieren. Für unsere einheitliche Vorlage ist das nicht nötig — alle Briefe nutzen denselben Header/Footer.

## Umsetzung

### `supabase/functions/generate-welcome-letters/index.ts`

1. Pro Empfänger wie bisher rendern → Ergebnis-DOCX als `Uint8Array`.
2. Ersten gerenderten Brief als **Basis-Dokument** behalten (enthält bereits Styles, Header/Footer, Relationships).
3. Aus jedem weiteren Brief nur den Inhalt des `<w:body>` extrahieren (alles außer dem abschließenden `<w:sectPr>`), einen Seitenumbruch davor setzen und an den Body des Basis-Dokuments anhängen.
4. Das `<w:sectPr>` des Basisdokuments bleibt am Ende stehen.
5. Ergebnis als **eine** DOCX-Datei speichern statt ZIP.

Konkrete Helper-Funktion (in derselben Datei):

```ts
function mergeDocxBodies(docs: Uint8Array[]): Uint8Array {
  const baseZip = new PizZip(docs[0]);
  let baseXml = baseZip.file("word/document.xml")!.asText();

  // Split base body into "before sectPr" and "sectPr+after"
  const sectPrMatch = baseXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  const insertionPoint = sectPrMatch ? baseXml.indexOf(sectPrMatch[0]) : baseXml.indexOf("</w:body>");

  const additions: string[] = [];
  for (let i = 1; i < docs.length; i++) {
    const xml = new PizZip(docs[i]).file("word/document.xml")!.asText();
    const bodyInner = xml.match(/<w:body[^>]*>([\s\S]*?)(?:<w:sectPr[\s\S]*?<\/w:sectPr>)?<\/w:body>/)?.[1] ?? "";
    additions.push(
      `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` + bodyInner
    );
  }

  baseXml = baseXml.slice(0, insertionPoint) + additions.join("") + baseXml.slice(insertionPoint);
  baseZip.file("word/document.xml", baseXml);
  return baseZip.generate({ type: "uint8array" });
}
```

6. Upload-Pfad und DMS-Eintrag bleiben gleich, nur:
   - Dateiname: `Willkommensbriefe_<Gebäude>_<Datum>.docx`
   - `contentType`: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - DMS-Tags weiterhin `["willkommensbrief", ...]`

7. Response des Edge-Functions liefert weiterhin `ok`, `failed`, `created_accounts`, plus `combined_doc_path` statt `zip_path`.

### `src/components/buildings/BuildingOnboardingTab.tsx`

- Button-Text und Toast: „Willkommensbrief-Dokument erstellen" / „Sammeldokument erstellt".
- Download-Link öffnet die einzelne DOCX (signierte URL aus Storage).

## Edge-Cases

- **Nur 1 Empfänger:** Keine Merge-Logik nötig — Basis-DOCX direkt zurückgeben.
- **Fehlerhafte Empfänger:** Werden wie heute übersprungen, in `comm_recipients`/Logs als `failed` vermerkt; im Sammeldokument nur die erfolgreichen.
- **Bilder/Logos in der Vorlage:** Liegen in den `word/media/`-Dateien des Basis-DOCX und werden vom Word-Viewer für alle Briefe wiederverwendet — kein zusätzliches Kopieren nötig, da alle Briefe aus derselben Vorlage stammen und auf dieselben `rId`s zeigen.
- **Header/Footer:** Erscheinen automatisch auf jeder Seite (ungeändert).

## Aufwand

Eine Edge-Function-Datei + ein kleines Frontend-Update. Realistisch ~15 Minuten Implementierung + Test.
