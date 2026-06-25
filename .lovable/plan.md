## Plan

1. **Ursache im E-Mail-Import beheben**
   - Die E-Mail-Body-Decodierung in `supabase/functions/fetch-emails/index.ts` wird angepasst.
   - Besonders der typische Fall aus dem Screenshot (`GÃ¶ttinger`, `fÃ¼r`, `AnwÃ¤ltin`) wird serverseitig zuverlässig zu UTF-8 repariert.

2. **Robustere Charset-Erkennung ergänzen**
   - Wenn der IMAP-Body bereits als falsch interpretierter Latin-1/Windows-1252-String ankommt, wird er gezielt als UTF-8-Bytefolge zurückgewandelt.
   - Dabei wird nur repariert, wenn das Ergebnis eindeutig weniger Mojibake enthält, damit korrekte Texte nicht beschädigt werden.

3. **Bestehende Anzeige unangetastet lassen**
   - Die Darstellung in `EmailHtmlBody` und der Postfach-Ansicht bleibt gleich; der Fix setzt an der Daten-Decodierung an.

4. **Validierung**
   - Build/Typecheck ausführen.
   - Optional: eine betroffene E-Mail kann danach über die vorhandene Reparse-Funktion neu eingelesen werden, damit bereits falsch gespeicherte Inhalte korrigiert werden.