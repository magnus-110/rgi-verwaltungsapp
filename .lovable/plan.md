## Ziel

Den bestehenden `CashAuditIntroDialog` in einen **mehrstufigen, ruhig gestalteten Wizard** umbauen — visuell angelehnt an den Onboarding-Flow (`WelcomeScreen` / `OnboardingWizardModal`): viel Whitespace, große Cards mit dünner Primary-Linie oben, wenig Text pro Schritt, klare Buttons.

## Inhalt der 5 Schritte

1. **Willkommen** – Begrüßung, Liegenschaft + Wirtschaftsjahr, Übersicht „Was Sie erwartet" (Liste der folgenden Schritte). Button: „Jetzt starten".
2. **Die vier Tabs** – Kompakte Liste der Tabs (Kontenblätter, Buchungsjournal, Dokumente, Hinweise) je mit einem Satz. Icon + Titel + 1 Zeile.
3. **Buchungen prüfen** – Erklärt den Klick auf eine Buchung, das Aufpoppen der Detailansicht mit Beleg/Vorlage, und das Markieren mit „✓ Geprüft" / „⚠ Auffällig".
4. **Vorlagen** – „Eine Buchungsvorlage steht für eine wiederkehrende Zahlung wie **Hausgeld**, **Verwaltergebühr** oder **Abschlagszahlungen** (Strom, Wasser, Heizung). Sie ersetzt die monatliche Einzelrechnung."
5. **Interne Buchungen** – „Manche Buchungen brauchen keinen externen Beleg, z. B. Umbuchungen zwischen Konten, Heizkostenumlagen, Abgrenzungen oder Eröffnungs-/Schlussbuchungen." Button: „Verstanden, los geht's" + Checkbox „Nicht mehr automatisch anzeigen".

→ **Faustregel-Absatz entfällt.**

## Design

- Modal-Container schmal (`max-w-md`), zentriert, viel vertikales Padding.
- Jede Seite = eine Karte im Stil `rounded-[16px] border border-border/50` mit 1 px Primary-Bar oben (wie WelcomeScreen).
- Headline `font-display`, leichte Spacing, kurzer Lead-Satz, dann Inhalt.
- Step-Indicator unten als kleine Punkte (5 Dots, aktiver Punkt = Primary, andere = `bg-muted`).
- Footer: links „Zurück" (ghost, ab Schritt 2 sichtbar), rechts „Weiter" / am Ende „Verstanden, los geht's" (Primary, full-width-Akzent wie im Onboarding).
- Auf Schritt 5 zusätzlich Checkbox „Nicht mehr automatisch anzeigen" (Default an).
- Nur semantische Tailwind-Tokens, keine harten Farben.

## Datei-Änderungen

- **Edit:** `src/components/finance/CashAuditIntroDialog.tsx` — komplettes Re-Design als interner State-Wizard (Step 1…5). Selbe Props (`open`, `onClose(dontShow)`, `buildingName`, `fiscalYear`). Keine Änderung an `CashAuditWizard.tsx` nötig.

Keine DB-, Routing- oder Logik-Änderungen.
