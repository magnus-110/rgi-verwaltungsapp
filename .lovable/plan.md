# Fix: Leere Platzhalter in RGI-Rechnungen

## Problem
Microsoft Word fügt `<w:proofErr w:type="spellStart"/>` / `<w:proofErr w:type="gramStart"/>` (und Ende-Pendants) mitten in Platzhalter wie `{firma.adresse}`, `{rechnung.nummer}`, `{kunde.kundennr}` ein. Dadurch wird der Platzhalter in mehrere `<w:r>`-Runs zerlegt, Docxtemplater erkennt ihn nicht mehr und ersetzt ihn durch einen leeren String. Die Loop-Felder (`{nr}`, `{menge}` …) funktionieren, weil sie keine Punkte/Wörter enthalten und nicht markiert werden.

## Lösung
In `supabase/functions/rgi-render-invoice/index.ts` direkt nach dem Entpacken der `.docx` (vor `new Docxtemplater(...)`) folgende XML-Dateien bereinigen:

- `word/document.xml`
- `word/header*.xml`
- `word/footer*.xml`

Zu entfernen:
- Selbst-schließende Spell-/Grammar-Marker: `<w:proofErr ... />`
- Optional: leere Bookmark-Marker (`<w:bookmarkStart .../>` / `<w:bookmarkEnd .../>`), falls sie auch Platzhalter zerschneiden — wird in einem zweiten Pass nur ergänzt, falls nach dem proofErr-Fix noch Felder leer bleiben.

Zusätzlich angrenzende `<w:r>`-Runs mit identischen `<w:rPr>` werden von Docxtemplater bereits gemergt – nach Entfernen der `<w:proofErr>`-Tags greifen die Platzhalter wieder.

## Technisches Detail
```ts
const PROOFERR_RE = /<w:proofErr[^>]*\/>/g;
for (const name of Object.keys(zip.files)) {
  if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) {
    const file = zip.file(name);
    if (!file) continue;
    const cleaned = file.asText().replace(PROOFERR_RE, "");
    zip.file(name, cleaned);
  }
}
```

Danach wie bisher `new Docxtemplater(zip, { ... })`.

## Verifikation
1. Bestehende Rechnung „Achweg 3-5" erneut rendern.
2. Erwartung im DOCX/PDF:
   - Absenderzeile: „RGI Immobilien GmbH & Co. KG · Vilstalstr. 4 · 87459 Pfronten"
   - Kundenadresse, Rechnungsdatum (03.06.2026), Fällig (17.06.2026)
   - Summenzeile: Nettobetrag 250,00 €, USt 19 % 47,50 €, Gesamt 297,50 €
   - Fußzeile: IBAN DE81 …, BIC GENODEF1AUB, Geschäftsführer, HRB, USt-IdNr.

## Nicht im Scope
- Änderungen an der Word-Vorlage selbst (nicht nötig).
- Änderungen am Payload-Schema oder den verfügbaren Tags.
- Frontend-Änderungen.
