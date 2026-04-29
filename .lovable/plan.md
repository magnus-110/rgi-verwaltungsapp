## Problem

The new "Stammdaten gleich oder unterschiedlich?"-Frage erscheint nie, weil das Feld `onboarding_progress.applies_to_all_assignments` bei allen Test-Nutzern bereits auf `false` gesetzt ist (vermutlich aus früheren Versuchen / Default). Die UI-Bedingung `appliesToAll === null` ist damit `false` und der Screen wird übersprungen.

DB-Befund für Building `44899d2f-…`:
- 2 Kontakte mit jeweils 2 Top-Level-Einheiten und 1 Kontakt mit 3 Top-Level-Einheiten — Multi-Unit ist also real vorhanden.
- Alle 4 `onboarding_progress`-Zeilen haben bereits `applies_to_all_assignments = false`.

## Fix

Die Frage soll **immer** erscheinen, wenn: Welcome durch ist, Multi-Unit, Step 1 noch nicht abgeschlossen, und die Frage nicht in dieser Session schon beantwortet wurde — unabhängig vom alten DB-Wert. Der bisher gespeicherte Wert wird als Vor-Auswahl angezeigt, der Nutzer kann ihn aber bestätigen oder ändern.

### Änderungen in `src/components/onboarding/OnboardingWizardModal.tsx`

1. **Bedingung anpassen** (Zeilen 94–99):
   ```ts
   const showStammdatenModeQuestion =
     !showWelcome &&
     multiUnit &&
     !progress.step1_completed_at &&
     !stammdatenModeDismissed;
   ```
   `appliesToAll === null` raus — sonst überspringen wir die Frage für alle, die das Feld schon gesetzt haben.

2. **Vor-Auswahl an `StammdatenModeQuestionCard` reichen** — `selected={appliesToAll}`, damit der User sieht, was zuletzt gewählt war. (Nur kosmetisch, falls die Karte das schon visualisiert; sonst keine Änderung.)

3. **Beim Choose-Handler** (Zeilen 441–453): bleibt wie heute — `setAppliesToAll(allSame)`, `setStammdatenModeDismissed(true)`, persistiert in `onboarding_progress`.

### Akzeptanz

- Nutzer mit ≥2 Top-Level-Einheiten und Step 1 noch offen sieht nach „Welcome" zwingend die Stammdaten-Modus-Frage, auch wenn `applies_to_all_assignments` schon einen Wert hat.
- Single-Unit-Nutzer sehen die Frage weiterhin nicht.
- Wenn Step 1 schon abgeschlossen ist (User kommt zurück um Step 2/3/… zu erledigen), wird die Frage nicht mehr gezeigt — die Stammdaten sind ja bereits gespeichert.

Kein DB-Migration nötig, kein Edge-Function-Change.
