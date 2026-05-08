## Problem

Aktuell wird die gesamte E-Mail in ein einziges großes Bild gerendert und über mehrere Seiten verteilt, indem das Bild jeweils mit negativem Y-Offset positioniert wird. Das Bild ragt dabei aber unten **über die Seite hinaus** und überdeckt den unteren Seitenrand — deshalb wirkt der Bottom-Rand wie nicht vorhanden, obwohl er rechnerisch eingeplant ist.

## Lösung

Statt eines durchgehenden Bildes mit Offset-Trick: Das gerenderte Canvas in **echte Seiten-Stücke schneiden** und jedes Stück einzeln auf eine Seite legen. Damit endet jedes Bild sauber an der Unterkante des nutzbaren Bereichs, und der Bottom-Rand bleibt garantiert frei.

## Änderungen in `src/components/email/PrintEmailDialog.tsx` → `handleDownload`

1. Nach `html2canvas(...)` einen Hilfs-Canvas anlegen
2. Pixel pro mm berechnen: `pxPerMm = canvas.width / imgW`
3. Erste Seite:
   - Source-Höhe in px = `(pageH - marginFirstTop - marginRest) * pxPerMm`
   - Stück aus dem Original-Canvas in Hilfs-Canvas kopieren (`drawImage` mit Source-/Destination-Rechteck)
   - Mit `pdf.addImage(slice, "JPEG", marginX, marginFirstTop, imgW, sliceMm)` einfügen
4. Folgeseiten in Schleife:
   - Source-Höhe = `(pageH - marginRest * 2) * pxPerMm`
   - `pdf.addPage()` → Stück kopieren → bei `marginRest` einfügen
   - Letzte Seite ist evtl. kürzer (Höhe = Restpixel)

## Browser-Druck

`@page` mit `:first` Selector bleibt unverändert — das funktioniert dort bereits korrekt, weil der Browser den Inhalt selbst paginiert.

## Was nicht geändert wird

- Layout, Header, KI-Zusammenfassung, Inline-Bilder, Thread-Logik, Settings — alles unverändert
- Browser-Druck-Pfad (`handlePrint`) bleibt wie er ist
