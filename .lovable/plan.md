## Plan

Ich werde den E-Mail-Editor so umbauen, dass die Eingabe nicht mehr aus zwei unterschiedlich gerenderten Text-Layern besteht. Das aktuelle Overlay-Prinzip ist zu fragil: sobald Schrift, Zeilenhöhe, Resize, Browser-Zoom oder Padding minimal abweichen, sieht der Text überlagert aus und Klickpositionen wirken versetzt.

## Änderungen

1. **`LinkHighlightTextarea` vereinfachen**
   - Die echte `<textarea>` rendert wieder normal sichtbaren Text.
   - Das darunterliegende Link-Highlight-Backdrop wird entfernt bzw. nicht mehr über den Text gelegt.
   - Dadurch stimmen Cursor, Mausklicks und sichtbarer Text immer nativ überein.

2. **Link-Erkennung sicher erhalten, aber nicht als Live-Overlay**
   - Die URL-Erkennung für den Versand bleibt unverändert über `textToHtmlWithLinks` bestehen.
   - Links werden beim Senden weiterhin als klickbare HTML-Links erzeugt.
   - Nur die visuelle Live-Blaufärbung während des Tippens fällt weg, weil sie die Ursache der Verschiebung ist.

3. **Composer-Einbindungen unverändert lassen**
   - `FloatingComposeWindow` und `ComposeEmailDialog` können weiterhin `LinkHighlightTextarea` verwenden.
   - Dadurch bleibt der Eingabe-API gleich und es sind keine großen Folgeänderungen nötig.

4. **Saubere Textarea-Metrik setzen**
   - Einheitliche Klassen wie `font-sans`, `tracking-normal`, `whitespace-pre-wrap`, normale Textfarbe und sichtbarer Caret.
   - Kein `text-transparent`, kein absolut positionierter Text-Layer, kein Scroll-Sync mehr.

## Ergebnis

Der Editor verhält sich wie eine normale, stabile Textarea: kein überlagerter Text, keine um Leerzeichen verschobenen Klickpositionen, keine Abweichungen durch Browser-Zoom oder Font-Metriken.