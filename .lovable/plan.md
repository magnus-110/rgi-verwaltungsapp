## Problem

Beim Schreiben von E-Mails „überlagert" der Text sich selbst und Mausklicks landen ein paar Zeichen neben der tatsächlichen Cursor-Position. Ursache liegt in `src/components/email/LinkHighlightTextarea.tsx`.

Diese Komponente legt ein Backdrop-`<div>` (mit blau eingefärbten Links) exakt unter eine transparente `<textarea>`. Damit das funktioniert, müssen beide Layer **pixelgenau** dieselben Textmetriken haben. Aktuell ist das nicht der Fall:

1. **`<textarea>` erbt Font nicht automatisch.** Browser-Default für Textareas ist meist eine Monospace-/System-Schrift, während das Backdrop-`<div>` die App-Font (Work Sans etc.) vom Elternteil erbt. Unterschiedliche Glyphenbreiten → jedes Wort driftet ein paar Pixel, sichtbar als „verschoben um Leerzeichen". Cursor-Position (nativ von der Textarea berechnet) passt dann nicht mehr zum sichtbar gerenderten Backdrop-Text.
2. **`line-height`, `letter-spacing`, `font-size`, `font-family` werden zwischen beiden Layern nicht explizit synchronisiert.**
3. **Border/Padding sind ungleich:** Backdrop hat `border-transparent`, Textarea hat `border-input` — beide 1px, das passt. Aber Backdrop hat kein `box-sizing`-Reset, wodurch bei bestimmten Zoomstufen 1px verrutscht.
4. **`text-transparent` versteckt zwar die Farbe, aber die Textarea nutzt trotzdem ihre eigene Schriftmetrik** für Caret- und Klick-Position — deshalb klickt man scheinbar „daneben".

## Fix (nur Presentation, keine Businesslogik)

In `src/components/email/LinkHighlightTextarea.tsx`:

- Ergänze im gemeinsamen `BASE_BOX` explizit `font-sans leading-6 tracking-normal` (oder passende Tailwind-Klassen, die zum Rest des Composers passen), damit Backdrop UND Textarea garantiert dieselbe Font/Line-Height/Letter-Spacing verwenden.
- Setze auf der Textarea zusätzlich inline `style={{ font: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit', caretColor: 'hsl(var(--foreground))' }}`, um Browser-Defaults für Textareas zu überschreiben.
- Stelle sicher, dass Backdrop und Textarea identische `padding` (px-3 py-2), `border`-Breite (beide 1px, transparent bzw. input), `box-sizing: border-box` (Tailwind-Default, aber explizit prüfen) und `whitespace-pre-wrap break-words` haben.
- Backdrop bekommt `overflow-hidden`, Textarea `overflow-auto` — Scroll-Sync bleibt wie gehabt.
- `word-break`/`overflow-wrap` auf beiden gleich setzen (`break-words` reicht).

## Verifikation

Nach dem Fix im Preview eine E-Mail öffnen, längeren Absatz mit Links tippen, an verschiedene Stellen klicken — Cursor muss exakt an der geklickten Stelle stehen, keine sichtbare Verschiebung des Backdrop-Textes.
