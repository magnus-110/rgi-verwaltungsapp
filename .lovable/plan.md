## Problem

Beim Klick auf „Weiter" ohne SEPA-Häkchen erscheint nur ein dunkler Overlay — der eigentliche Warn-Dialog (Text + Buttons) ist unsichtbar.

**Ursache:** Der `AlertDialog` (Radix) wird parallel zum bereits geöffneten `Dialog` (Wizard) geöffnet. Beide nutzen Portale auf `document.body` mit `z-50`. Radix setzt beim Öffnen des AlertDialogs `aria-hidden`/`pointer-events: none` auf alle Geschwister des aktiven Dialogs. Da der Wizard-Dialog zuerst gemountet war, „gewinnt" er den Focus-Trap, und der AlertDialog-Inhalt wird unsichtbar bzw. vom Wizard-Overlay überdeckt — nur der dunkle AlertDialog-Overlay bleibt sichtbar.

Der vorherige Versuch, den AlertDialog außerhalb des `DialogContent` zu rendern, reicht nicht — Radix' verschachtelte Modals verhalten sich grundsätzlich problematisch, wenn der äußere Dialog aktiv bleibt.

## Lösung

Den `AlertDialog` durch ein **normales `Dialog`** ersetzen, das innerhalb des Wizard-`DialogContent` als ein zweiter, überlagernder Layer gerendert wird — aber mit explizit höherem `z-index` (z. B. `z-[70]` für Overlay und Content) und ohne Focus-Trap-Konflikt. Alternativ: Den Warn-Dialog als **Inline-Card** im Wizard selbst anzeigen (kein zweites Dialog-Element nötig).

**Bevorzugte Variante: Inline-Confirmation im Wizard**

Statt eines zweiten Modal-Layers zeigt der Wizard bei `pendingSepaWarning === true` eine Card direkt im Scroll-Bereich (statt der Step-Inhalte). Vorteile:
- Kein Dialog-Nesting → kein Focus-/z-index-Konflikt
- Funktioniert garantiert auf allen Geräten
- Nutzt bereits vorhandene SectionCard-Pattern

## Änderungen

**`src/components/onboarding/OnboardingWizardModal.tsx`**
- `AlertDialog`-Block komplett entfernen (inkl. Imports `AlertDialog*`, `X`)
- Im Scroll-Bereich-Conditional ergänzen: wenn `pendingSepaWarning`, dann statt `renderStep()` eine Warn-Card rendern mit:
  - Titel „Sind Sie sicher?"
  - Beschreibungstext (5 €/Monat Mehraufwand)
  - Zwei Buttons: „Nein, ohne Mandat fortfahren" (`continueWithoutMandate`) und „Ja, Mandat jetzt erteilen" (`acceptMandateAndContinue`)
  - „X"-Schließen-Button oben rechts (`dismissSepaWarning`)
- Footer (Zurück/Weiter) bei `pendingSepaWarning` ausblenden
- Audit-Log-Aufrufe bleiben unverändert (warning_shown, dismissed, declined, changed_after_warning)

## Tech-Detail

Conditional Rendering im Scroll-Bereich (vereinfacht):
```tsx
{pendingSepaWarning ? (
  <SepaWarningCard
    onConfirmMandate={acceptMandateAndContinue}
    onContinueWithout={continueWithoutMandate}
    onDismiss={dismissSepaWarning}
  />
) : allDone ? (
  <CompletionScreen ... />
) : showWelcome ? (
  <WelcomeScreen ... />
) : (
  <>{Step-Header + renderStep()}</>
)}
```

Bestätigung zur Umsetzung?