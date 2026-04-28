## Echte Fehlerursache (gefunden)

Der bisherige Fix (Tailwind-Arbitrary-Klassen ersetzen) war ein Trugschluss. Der Caret im SWC-Fehler zeigt zwar auf Zeile 54, aber der echte Auslöser liegt auf **Zeile 120**:

```tsx
<MultiEntryList<SecondaryUnitDraft>
  items={secondaryUnits}
  ...
```

Das ist eine **Generic-Type-Argument-Syntax in JSX** (`<Component<Type>`). Der Vite/SWC-Parser interpretiert `<SecondaryUnitDraft>` als verschachteltes JSX-Element, kommt mit dem Schließen durcheinander und meldet den Folgefehler "Expected jsx identifier" zurück bis zur ersten Top-Level-`<div>` (Zeile 54).

## Fix

In `src/components/onboarding/steps/Step2Wohnungsdaten.tsx` Zeile 120 das explizite Generic-Argument entfernen — TypeScript leitet `T` aus den Props (`items`, `newItem`, `renderItem`) eindeutig ab:

```diff
-        <MultiEntryList<SecondaryUnitDraft>
+        <MultiEntryList
```

Keine weiteren Änderungen nötig. Tailwind-Arbitrary-Klassen wie `text-[12px]` oder `space-y-2.5` sind harmlos und funktionieren projektweit problemlos.