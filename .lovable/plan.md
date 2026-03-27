

# Plan: Logo-Fix & Text-Positionierung im PDF

## Problem
1. Logo wird im PDF nicht korrekt dargestellt (möglicherweise Ladeproblem oder falsche Skalierung)
2. Titel und Text starten auf gleicher Höhe wie das Logo — sollen erst darunter beginnen

## Änderungen in `MeetingInvitationPdf.tsx`

### PDF-Generierung (`handleDownloadPdf`)
- Logo oben rechts platzieren (Höhe ~15mm für bessere Sichtbarkeit)
- **Nach** dem Logo: `y`-Position unter das Logo setzen (z.B. `y += logoH + 5`), sodass der Titel erst darunter beginnt
- Falls der User ein neues Logo hochlädt, den Pfad aktualisieren

### Live-Vorschau (HTML im Dialog)
- Gleiches Layout anpassen: Logo oben rechts, Titel/Text erst darunter
- `margin-top` unter dem Logo-Bereich einfügen

### Technische Details

| Datei | Änderung |
|---|---|
| `MeetingInvitationPdf.tsx` | PDF: Logo laden, `y` nach Logo-Höhe verschieben, dann erst Titel. Vorschau: gleiche Anpassung im HTML. Logo-Pfad ggf. auf neues Upload aktualisieren. |

**Warte auf Logo-Upload vom User, dann Logo-Pfad und Dimensionen entsprechend anpassen.**

