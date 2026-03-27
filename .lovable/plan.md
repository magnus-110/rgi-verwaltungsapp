

# Plan: A4-Layout & Logo-Fix für Einladung

## Probleme
1. **Logo wird im PDF nicht angezeigt** — `html2canvas` kann Cross-Origin-Bilder nicht rendern. Das Logo muss vor dem Rendering als Base64-DataURL vorgeladen werden.
2. **PDF weicht von Vorschau ab** — Der Preview-Container (794px) wird im Dialog abgeschnitten/gescrollt. `html2canvas` rendert nur den sichtbaren/geclippten Teil.
3. **Kein A4-Seitenverhältnis in der Vorschau** — Der Container hat zwar 794px Breite, aber keine feste Höhe. Die Vorschau soll ein echtes A4-Blatt darstellen (794×1123px).

## Lösung in `MeetingInvitationPdf.tsx`

### 1. Logo als Base64 vorladen
- `useEffect` + Canvas-Trick: Logo-Bild laden, auf ein unsichtbares `<canvas>` zeichnen, `toDataURL()` speichern
- Im Preview-`<img>` das Base64-DataURL verwenden statt der externen URL
- Damit kann `html2canvas` das Logo problemlos erfassen

### 2. Preview als A4-Blatt mit Scale-Wrapper
- Preview-Container: exakt `794px × 1123px` (A4 bei 96dpi), `min-height: 1123px`
- Äußerer Wrapper mit `transform: scale(0.55)` + `transformOrigin: top center`, damit das A4-Blatt komplett in den Dialog passt
- `html2canvas` greift auf den unskalierten 794px-Container zu → volle Auflösung

### 3. html2canvas-Aufruf optimieren
- Explizit `width: 794`, `windowWidth: 794` setzen
- `scrollX: 0, scrollY: 0` um Scroll-Offset-Probleme zu vermeiden

| Datei | Änderung |
|---|---|
| `MeetingInvitationPdf.tsx` | Logo via Base64 vorladen; Preview-Container auf 794×1123px (A4) mit Scale-Wrapper; html2canvas-Optionen für korrektes Rendering |

