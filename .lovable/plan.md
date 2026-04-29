## Ziel

Wenn ein Nutzer im selben Gebäude mehrere Einheiten besitzt (mehrere `contact_building_assignments` für denselben Contact + Building), soll der Onboarding-Wizard das richtig abbilden — ohne den Look & Feel zu ändern.

## Erkenntnisse aus dem Code

- `onboarding_progress` hat bereits ein Feld `applies_to_all_assignments`. Die Edge Function `submit-onboarding-step` schreibt Step-1-Overrides bei `true` in **alle** aktiven Assignments des Contacts → die Backend-Logik für „Stammdaten gelten für alle Einheiten" existiert bereits, im UI fehlt aber die Frage.
- Aktuell wird in `useOnboardingContext` nur **eine** Building-Aktivierung pro User gefunden — also wird der Wizard pro Gebäude nur einmal gezeigt. Das passt; wir bilden mehrere Einheiten **innerhalb desselben Wizards** ab.
- Step 2 (`Step2Wohnungsdaten.tsx`) erfasst aktuell nur eine Wohnung mit einem Block aus Nr./Beschreibung/Hausgeld/MEA/m² + „weitere Einheiten" (Stellplatz etc.). Diese wohnungs­spezifischen Felder müssen pro Assignment einmal erfasst werden.
- Step 1 (Stammdaten) ist nutzer-/kontaktbezogen, nicht einheitenbezogen. Hier reicht die Ja/Nein-Frage „für alle Einheiten gleich?".
- Step 3 (Gebäude), Step 4 (Dienstleister), Step 5 (Bewertung) bleiben unverändert — sie sind gebäudebezogen.

## Plan

### 1. Assignments laden

`useOnboardingContext` zusätzlich liefern:
- `assignments: { id, unit_label }[]` — alle aktiven Assignments des Contacts für `activeBuildingId` (gefiltert auf `is_active = true`).
- `unit_label` aus vorhandenen Override-/Stammfeldern (`unit_number_override` / `units.unit_number` falls verlinkt) oder Fallback „Einheit 1/2/…".

Wenn nur **eine** Einheit existiert, verhält sich der Wizard exakt wie heute (keine neue Frage, kein Mehrfach-Step 2).

### 2. Neuer Welcome-Folge-Schritt: „Stammdaten-Modus"

Nach dem `WelcomeScreen` und **vor** Step 1 wird — nur bei `assignments.length > 1` — eine neue Auswahl-Karte gezeigt:

> Sie besitzen mehrere Einheiten in diesem Gebäude. Sind Ihre Stammdaten (Adresse, Telefon, E-Mail, Bankverbindung, Hauptansprechpartner) für **alle Einheiten gleich** oder **getrennt zu erfassen**?

Zwei große Pill-Buttons im selben Stil wie „Hauptansprechpartner / Beirat" (`PillChoice`/`BigChoiceCard`-Optik):
- „Für alle Einheiten gleich" → `applies_to_all_assignments = true`
- „Getrennt je Einheit erfassen" → `applies_to_all_assignments = false`

Auswahl wird über die bereits vorhandene `save-onboarding-step`-Logik bzw. einen kleinen Direkt-Update-Call auf `onboarding_progress.applies_to_all_assignments` persistiert. Danach automatischer Wechsel zu Step 1.

### 3. Step 1 Verhalten

- `applies_to_all_assignments = true` → Step 1 wird **einmal** gezeigt (heutiges Verhalten). Beim Submit greift die bestehende Backend-Logik und schreibt die Overrides in **alle** Assignments.
- `applies_to_all_assignments = false` → Step 1 wird je Assignment einmal gerendert, klar getrennt durch eine kleine Header-Sektion „Einheit 1: …" / „Einheit 2: …" (gleicher SectionCard-Stil, kein Tab/Accordion — nur untereinander gestapelt). 
  - State pro Assignment: `step_data.step1_per_unit[assignmentId]: Step1Data`.
  - Beim Submit: pro Assignment ein Aufruf an `submit-onboarding-step` mit gezieltem `assignment_id` (neuer optionaler Parameter; Edge Function muss erweitert werden, um Override nur auf das übergebene Assignment zu schreiben statt auf alle).

### 4. Step 2 Verhalten (immer mehrfach bei >1 Einheit)

Step 2 wird **unabhängig** von der Stammdaten-Auswahl pro Assignment einmal gerendert. Alle bestehenden Sektionen aus `Step2Wohnungsdaten.tsx` (Wohnung, Finanzielle Eckdaten, Wohnfläche, Weitere Einheiten inkl. PillChoice-Workflow) bleiben unverändert; sie werden nur in einem `<UnitBlock>`-Wrapper pro Assignment wiederholt.

- State: `step_data.step2_per_unit[assignmentId]: Step2Data`.
- Visuelle Trennung: dezenter SectionCard-Header „Einheit 1 — Wohnung 0001" mit feiner Trennlinie/Spacing dazwischen. Kein Akkordeon, alles auf einer Seite (Scroll), damit auch wenig technikaffine Nutzer alle Felder sofort sehen.
- Submit von Step 2: ein Aufruf an `submit-onboarding-step` mit `payload = { per_unit: { [assignmentId]: Step2Data, … } }`. Edge Function legt ein Submission-Datensatz pro Assignment an (oder ein Sammeldatensatz mit Map — bevorzugt: pro Assignment, damit die Verwaltung einzeln approven kann).

### 5. Step 3, 4, 5

Unverändert — gebäudebezogen.

### 6. UI-Konsistenz

- Alle neuen Buttons nutzen die bestehende `PillChoice`-Komponente bzw. `BigChoiceCard` (gleicher Stil wie Kassenprüfung/Beirat/Hauptansprechpartner).
- Inputs nutzen weiterhin `EmbeddedInput` und `SectionCard`.
- Sprache bleibt einfach, deutsch, ohne Fachjargon. Beispiel-Header: „Einheit 1 von 2" als kleines Label oben in der Section.
- Auto-Scroll zur ersten leeren Sektion der nächsten Einheit nach Klick auf „Ja" o. Ä. (gleiche `scrollIntoView`-Mechanik wie heute in Step 2).

### 7. Backend-Anpassungen (Edge Function `submit-onboarding-step`)

- Step 1 mit neuem optionalen `assignment_id` → Override nur auf dieses Assignment (statt Schleife über alle).
- Step 2 mit `payload.per_unit` → pro Assignment eine Zeile in `onboarding_submissions` (Kategorie `wohnungsdaten`, mit `assignment_id` als zusätzlicher Spalte oder im Payload). Falls `payload.per_unit` fehlt, alter Pfad bleibt erhalten (Rückwärtskompatibilität).
- Migration: Spalte `assignment_id uuid null` in `onboarding_submissions` hinzufügen, damit die Verwaltung pro Einheit prüfen kann.

### 8. Akzeptanzkriterien

- Nutzer mit 1 Einheit sieht keinen Unterschied zu heute.
- Nutzer mit 2+ Einheiten sieht nach dem Welcome-Screen die neue Stammdaten-Frage.
- Step 2 erfasst jede Einheit klar getrennt im selben Schritt; Sub-Einheiten-Workflow (Stellplatz, Keller …) funktioniert pro Einheit unabhängig.
- Step 3/4/5 bleiben unverändert.
- Stil ist konsistent mit Hauptansprechpartner/Beirat/Heizungsart.

## Geänderte Dateien

- `src/components/onboarding/useOnboardingContext.ts` — Assignments mitladen.
- `src/components/onboarding/OnboardingWizardModal.tsx` — neuer Zwischenschritt nach Welcome, Multi-Einheiten-Routing für Step 1 & 2.
- `src/components/onboarding/steps/Step1Stammdaten.tsx` — optionaler Multi-Modus (Render pro Assignment) oder neuer Wrapper `Step1MultiUnit.tsx`.
- `src/components/onboarding/steps/Step2Wohnungsdaten.tsx` — extrahiere bestehende Inhalte in `<Step2UnitBlock>`, neuer Wrapper rendert Block pro Assignment.
- `supabase/functions/submit-onboarding-step/index.ts` — `assignment_id` und `payload.per_unit` unterstützen.
- Neue Migration: `onboarding_submissions.assignment_id` (nullable uuid).
