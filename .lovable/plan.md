## Ziel
Die Sektion „Weitere Einheiten" in `Step2Wohnungsdaten.tsx` wird von einer freien Eingabeliste (MultiEntryList) zu einem geführten Frage-Flow umgebaut – analog zur bestehenden „Hauptansprechpartner"-Logik mit `YesNoChoice` / `BigChoiceCard`.

## Neuer Frage-Flow

**Frage 1 – Ja/Nein:** „Haben Sie zusätzliche Einheiten, die zu Ihrer Wohnung gehören (z. B. Tiefgaragen-Stellplatz, Außenstellplatz, Keller, …)?"
- UI: `YesNoChoice`
- Bei „Nein" → Sektion endet, keine Nebeneinheiten.

**Frage 2 – Mehrfachauswahl (nur bei Ja):** „Um was handelt es sich?"
- UI: Grid aus `BigChoiceCard`-Buttons, einer je `UNIT_KIND_OPTIONS`-Eintrag (außer `apartment`).
- Toggle-Verhalten: Klick aktiviert/deaktiviert den Eintrag (Checkmark wie bei Auswahl).
- Auswahl wird intern in einem `Set<UnitKind>` gehalten.

**Frage 3 – Ja/Nein (nur wenn ≥1 Einheit gewählt):** „Gibt es hierfür eine eigene Abrechnung?"
- UI: `YesNoChoice`
- Antwort wird gespeichert, beeinflusst nur die Sichtbarkeit von Frage 4 sowie die Default-Werte beim Persistieren (Hausgeld/MEA bleiben leer bei „Nein").

**Frage 4 – Detail-Felder (nur wenn Frage 3 = Ja):** Für jede in Frage 2 ausgewählte Einheit erscheint ein kleiner Block mit:
- Label = `UNIT_KIND_LABELS[kind]`
- Textfeld „Hausgeld (€/Monat)"
- Textfeld „Miteigentumsanteile"
- Optional Textfeld „Nr./Bez." (z. B. „TG-04") – damit weiterhin identifizierbar (gleiche Felder wie heute).

## Datenmodell (kompatibel zu bestehendem Code)

`SecondaryUnitDraft[]` bleibt als persistiertes Format erhalten (downstream-Code in `OnboardingWizardModal` / Persist-Logik bleibt unverändert). Pro ausgewähltem `unit_kind` wird ein Eintrag erzeugt:

```ts
{
  unit_kind,
  unit_number: "",
  mea_share: hatEigeneAbrechnung ? userInput : "",
  monthly_fee: hatEigeneAbrechnung ? userInput : "",
  billing_mode: "own_billing", // bleibt fix wie zuletzt vereinbart
}
```

Zusätzlich werden zwei UI-State-Felder im `Step2Data` ergänzt (rein für den Wizard-Zustand, müssen nicht in DB landen):
- `has_secondary_units?: boolean | null`
- `secondary_units_have_own_billing?: boolean | null`

Die Liste `secondary_units` wird aus diesen Flags + ausgewählten Kinds derived/synchronisiert (kontrollierte Updates beim Toggle).

## Technische Änderungen

**Nur eine Datei:** `src/components/onboarding/steps/Step2Wohnungsdaten.tsx`

1. Imports ersetzen: `MultiEntryList`, `Select*`, `RadioGroup*`, `Label` raus; `YesNoChoice`, `BigChoiceCard` rein.
2. `Step2Data` erweitern um `has_secondary_units` und `secondary_units_have_own_billing`.
3. Sektion „WEITERE EINHEITEN" neu rendern:
   - `SectionCard` mit Frage 1 (`YesNoChoice`).
   - Bei Ja: zweite `SectionCard` „ART DER EINHEIT" mit Grid (`grid-cols-1 sm:grid-cols-2`) aus `BigChoiceCard`s über `UNIT_KIND_OPTIONS.filter(o => o.value !== "apartment")`.
   - Toggle-Handler aktualisiert `secondary_units` (Eintrag hinzufügen/entfernen, Default-Werte erzeugen).
   - Bei ≥1 Auswahl: `SectionCard` mit Frage 3 (`YesNoChoice`).
   - Bei Frage 3 = Ja: `SectionCard` „DETAILS" mit pro Einheit einem kleinen Block (Label + 3 `EmbeddedInput`s: Nr./Bez., Hausgeld, MEA).
4. Bei Frage 1 = Nein → `secondary_units = []`, abhängige Flags zurücksetzen.
5. Bei Frage 3 = Nein → MEA/Hausgeld in allen Einträgen leeren (Anzeige verschwindet ohnehin).

## Out of Scope
- Keine Änderungen an Persistenz, Edge Functions, AssignContactDialog oder Datenmodell.
- Kein Migrationsbedarf – `secondary_units` bleibt formatkompatibel.