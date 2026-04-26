Plan zur Behebung des Onboarding-FAB-Problems

Analyse-Ergebnis
- In der Datenbank ist der betroffene Fortschritt eindeutig bei `4 von 5`: `step1_completed_at` bis `step4_completed_at` sind gesetzt, aber `step5_completed_at` und `fully_completed_at` sind weiterhin `NULL`.
- Gleichzeitig existieren bereits mehrere `bewertung`-Submissions für Schritt 5. Das heißt: Schritt 5 wurde inhaltlich gespeichert, aber der Fortschrittsdatensatz wurde danach nicht zuverlässig als abgeschlossen markiert.
- Ursache ist sehr wahrscheinlich die Reihenfolge in der Edge Function `submit-onboarding-step`: Bei Schritt 5 wird erst eine Submission angelegt und danach `onboarding_progress` aktualisiert. Wenn der zweite Teil fehlschlägt oder eine ältere deployte Function-Version noch läuft, entsteht genau dieser Zustand: Admin-Dashboard sieht Schritt-5-Daten, aber das FAB zählt weiter nur 4 erledigte Schritte.

Umsetzung
1. `submit-onboarding-step` robust machen
   - Schritt-5-Abschluss idempotent behandeln: Wenn bereits eine Schritt-5-Submission existiert, darf ein erneuter Abschluss keine Duplikat-/Zwischenzustandsprobleme verursachen.
   - Nach dem Speichern von Schritt 5 zwingend `step5_completed_at` und `fully_completed_at` auf `onboarding_progress` setzen.
   - Den Rückgabewert der Progress-Update-Operation prüfen und bei 0 aktualisierten Zeilen einen klaren Fehler zurückgeben.
   - Für Schritt 5 die Progress-Aktualisierung so priorisieren, dass kein Zustand „Submission vorhanden, Progress nicht abgeschlossen“ zurückbleibt.

2. Frontend nach erfolgreichem Abschluss synchronisieren
   - `OnboardingWizardModal` soll nach erfolgreichem Step-5-Submit den aktualisierten Progress direkt aus der Function-Antwort bzw. per Refresh übernehmen.
   - Beim Schließen des Danke-Dialogs wird der Kontext sicher neu geladen, sodass das FAB verschwindet.
   - Optionaler Schutz: Wenn `step5_completed_at` gesetzt ist, wird das Onboarding im UI als abgeschlossen behandelt, auch falls `fully_completed_at` durch ältere Daten noch fehlt.

3. Bestehende fehlerhafte Daten reparieren
   - Eine Migration oder sichere SQL-Korrektur ergänzt für bestehende Progress-Zeilen `step5_completed_at`/`fully_completed_at`, wenn bereits eine `bewertung`-Submission für denselben `user_id` + `building_id` existiert.
   - Dadurch wird der aktuelle Nutzerzustand sofort korrigiert, ohne dass der Eigentümer Schritt 5 erneut ausfüllen muss.

4. Verifikation
   - Edge Function gezielt prüfen/deployen.
   - Datenbank prüfen: Der betroffene Datensatz muss danach `step5_completed_at` und `fully_completed_at` gesetzt haben.
   - UI-Logik prüfen: Bei abgeschlossenem Onboarding rendert `OnboardingFAB` nicht mehr.

Technische Details
- Betroffene Dateien:
  - `supabase/functions/submit-onboarding-step/index.ts`
  - `src/components/onboarding/OnboardingWizardModal.tsx`
  - `src/components/onboarding/OnboardingFAB.tsx` bzw. `useOnboardingContext.ts` für defensive Completion-Logik
  - neue Supabase-Migration zur Reparatur vorhandener inkonsistenter Onboarding-Daten
- Keine neue Tabelle notwendig.
- Keine Änderung an Rollen-/Berechtigungsmodell notwendig.