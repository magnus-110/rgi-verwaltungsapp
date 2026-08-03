# Umfrage: Antworten abwählbar machen, keine Vorauswahl

## Ziel
Eigentümer sollen eine bereits gewählte Antwort (Ja / Neutral / Nein) durch erneutes Tippen wieder abwählen können. Es darf beim Öffnen einer Frage nie eine Antwort vorbelegt sein.

## Änderungen (nur Frontend, `src/components/survey/SurveyRunner.tsx`)

1. **Toggle-Verhalten Ampel-Buttons**
   Klick auf den bereits aktiven Button setzt die Auswahl auf „keine Antwort“ zurück (`choice: null`). Klick auf einen anderen Button wechselt wie bisher.

2. **Folgefrage ebenfalls abwählbar**
   Beim Zurücksetzen von „Ja“ wird die Folgeantwort (`followup_choice`) mit geleert; ein erneuter Klick auf die bereits gewählte Folgeoption hebt diese auf.

3. **Speichern des leeren Zustands**
   Bisher wird nur beim „Weiter“ gespeichert und nie geleert. Künftig wird der zurückgesetzte Zustand ebenfalls gespeichert, damit die Abwahl nach dem Neuladen erhalten bleibt. Die Spalte `choice` erlaubt bereits `NULL`, es ist keine Datenbankänderung nötig.

4. **Keine Vorauswahl**
   Bereits gespeicherte eigene Antworten werden weiter angezeigt (das ist gewollt, damit man seinen Stand sieht) — aber es wird nichts implizit vorbelegt. Die Frage startet ohne aktiven Button, solange keine eigene Antwort existiert.

5. **„Weiter“-Button**
   Bleibt deaktiviert, solange keine Antwort gewählt ist (wie bisher), damit die Umfrage vollständig beantwortet wird. In der Übersicht erscheint eine nicht beantwortete Frage weiterhin als „—“.

## Technischer Hinweis
Betroffen ist ausschließlich die Klick-Logik der Buttons in `SurveyRunner.tsx` (`setAnswer`) plus ein Aufruf von `save.mutate` beim Zurücksetzen. Keine Migration, keine Änderung an `useSurvey.ts`-Auswertung nötig (die Ergebnis-View zählt `NULL`-Antworten ohnehin nicht mit).
