

# Plan: PDF-Generierung an Vorschau angleichen + Footer-Text ändern

## Probleme
1. **Logo im PDF fehlerhaft** — jsPDF `addImage` mit HTMLImageElement kann bei Cross-Origin-Bildern in der Sandbox fehlschlagen. Lösung: Logo als Canvas-basiertes DataURL laden, bevor es an jsPDF übergeben wird.
2. **PDF sieht anders aus als Vorschau** — jsPDF nutzt nur Helvetica, die Abstände und Schriftgrößen stimmen nicht mit der HTML-Vorschau überein. Lösung: Abstände, Schriftgrößen und Zeilenabstände im PDF-Code exakt an die Vorschau anpassen.
3. **Footer-Text falsch** — Statt "Erstellt am ... | Hausverwaltung" soll nur "RGI Immobilien GmbH & Co. KG" stehen — sowohl im PDF als auch in der Vorschau.

## Änderungen in `MeetingInvitationPdf.tsx`

### Logo-Fix
- Logo über Canvas zu DataURL konvertieren, dann als DataURL an `pdf.addImage()` übergeben
- Fallback: wenn Logo nicht lädt, einfach ohne Logo weitermachen

### PDF-Abstände angleichen
- Titel-Abstand nach Logo: `y += logoH + 12` (mehr Luft wie in Vorschau)
- Building-Name direkt unter Titel mit kleinerem Abstand
- Orange Linie: Abstand reduzieren auf `y += 12` statt `y += 20`
- Meta-Block: Zeilenabstand auf 6mm
- Greeting: Zeilenabstand 5.5mm
- Agenda-Items: Padding und Abstände an Vorschau anpassen
- Closing: Konsistenter Abstand

### Footer ändern
- PDF Zeile 237: `"RGI Immobilien GmbH & Co. KG"` statt `Erstellt am ... | ...`
- Vorschau Zeile 399: Gleiches — nur "RGI Immobilien GmbH & Co. KG"

### Technische Details

| Datei | Änderung |
|---|---|
| `MeetingInvitationPdf.tsx` | Logo via Canvas→DataURL laden; PDF-Abstände an HTML-Vorschau angleichen; Footer-Text in PDF und Vorschau auf "RGI Immobilien GmbH & Co. KG" ändern |

