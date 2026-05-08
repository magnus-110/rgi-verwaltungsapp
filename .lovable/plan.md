## Ziel
Die gedruckte E-Mail (sowohl als PDF-Download als auch als Browser-Druck) soll deutlich mehr Abstand zum Seitenrand erhalten — besonders oben und an den Seiten — damit das Layout luftiger und professioneller wirkt.

## Änderungen in `src/components/email/PrintEmailDialog.tsx`

1. **PDF-Download (`handleDownload`)**
   - Aktuell wird das gerenderte Bild randlos auf die A4-Seite gelegt (`pdf.addImage(..., 0, position, pageW, imgH)`).
   - Neu: Linker/rechter Rand je 18 mm, oberer/unterer Rand je 20 mm.
   - Die Bildbreite wird auf `pageW - 36 mm` reduziert; X-Position = 18 mm; Start-Y = 20 mm.
   - Mehrseitenlogik (`heightLeft`/`position`) wird entsprechend an den nutzbaren Bereich (`pageH - 40 mm`) angepasst, damit Folgeseiten ebenfalls oben/unten Rand haben.

2. **Browser-Druck (`handlePrint`)**
   - `@page { margin: 15mm }` wird auf `@page { margin: 20mm 18mm }` erhöht (oben/unten 20 mm, links/rechts 18 mm).

3. **Innen-Padding des Render-Containers**
   - In `buildPrintHtml` wird das aktuelle `padding:24px` auf den Inhalts-Wrapper reduziert (z. B. `padding:8px`), da der Außenabstand jetzt durch die Seitenränder im PDF/Print-Stylesheet gewährleistet wird. Verhindert doppelte Polsterung.

## Nicht betroffen
- Inhalt, Header (RGI Logo, Datum), KI-Zusammenfassungs-Box, Thread-Logik und Inline-Bild-Auflösung bleiben unverändert.
- Keine Backend- oder DB-Änderungen.
