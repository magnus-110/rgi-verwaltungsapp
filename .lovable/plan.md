

# Plan: PDF via html2canvas — Vorschau = PDF

## Problem
jsPDF zeichnet alles manuell mit Helvetica. Die Vorschau nutzt Century Gothic / Work Sans via CSS. Diese Diskrepanz ist mit jsPDF nicht lösbar — die Schriftarten können nicht eingebettet werden.

## Lösung: html2canvas + jsPDF
Die HTML-Vorschau wird **direkt als Bild** gerendert und in ein PDF eingefügt. Das garantiert: Was in der Vorschau steht, landet 1:1 im PDF — mit korrekten Schriftarten, Abständen und Farben.

**Ablauf:**
1. `html2canvas` rendert den Preview-Container (`previewRef`) als Canvas
2. Canvas wird als Bild in ein A4-PDF via `jsPDF` eingefügt
3. Skalierung auf A4-Breite mit korrektem Seitenverhältnis
4. Bei langen Inhalten: automatischer Seitenumbruch

## Änderungen

### `MeetingInvitationPdf.tsx`
1. **Import `html2canvas`** (muss als Dependency installiert werden)
2. **`handleDownloadPdf` komplett ersetzen**: Statt manueller jsPDF-Zeichnung → `html2canvas(previewRef.current)` aufrufen, Canvas zu PNG konvertieren, in A4-PDF einfügen
3. **Vorschau-Schriftarten korrigieren**: `fontFamily` auf `'Century Gothic', Arial, sans-serif` für Überschriften und `'Work Sans', sans-serif` für Fließtext setzen
4. **Preview-Container für PDF optimieren**: Feste Breite (z.B. 794px = A4 bei 96dpi) setzen, damit das Rendering konsistent ist

### Dependency
- `html2canvas` installieren (`npm install html2canvas`)

### Technische Details

| Datei | Änderung |
|---|---|
| `package.json` | `html2canvas` als Dependency hinzufügen |
| `MeetingInvitationPdf.tsx` | `handleDownloadPdf` durch html2canvas-basierte Generierung ersetzen; Preview-Schriftarten auf Century Gothic + Work Sans; Preview-Breite fixieren für konsistentes Rendering |

