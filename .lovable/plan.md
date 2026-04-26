
# Onboarding-Wizard: Welcome-Screen + neuer Header + neuer Fortschrittsbalken

Basierend auf den Screenshots passe ich den Wizard so an:

## 1. Echtes RGI-Logo statt SVG-Wordmark
- `RgiWordmark.tsx` wird ersetzt: statt des handgezeichneten Haus-SVG + Text wird das offizielle Logo `/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png` eingebunden (Höhe ~28 px, `object-contain`, links ausgerichtet).
- Verwendet im Top-Bar des Modals.

## 2. Neuer Fortschrittsbalken (Linien-Style statt Kreise)
- Der bisherige `StepSlider` (Kreise mit Verbindungslinien) wird durch eine **Linien-Variante** ersetzt, die zum Screenshot passt:
  - 5 gleichbreite, abgerundete Balken nebeneinander (`flex-1`, `h-1`, `rounded-full`, `gap-2`).
  - Erledigte/aktive Schritte: vollflächig **Primary Orange** (`bg-primary`).
  - Noch offene Schritte: hellgrau (`bg-muted`).
  - Rechts daneben Text „1 / 5", „2 / 5" usw. in `text-muted-foreground`, `text-xs`.
  - Schritt-Labels darunter werden entfernt (Screenshot zeigt sie nicht). Die Schrittübersicht steht im Welcome-Screen als „Was Sie erwartet"-Liste.
- Klickbarkeit bleibt erhalten (Locking nach bisheriger Logik).

## 3. NEU: Welcome-Screen (Schritt 0)
Vor dem eigentlichen Schritt 1 erscheint ein Begrüßungs-Screen, exakt wie im Screenshot:

**Inhalt:**
- Überschrift in Century Gothic: „Herzlich willkommen bei **RGI Immobilien**!" (zweiter Teil in Primary Orange).
- Zwei Begrüßungsabsätze:
  1. „Wir freuen uns sehr, Sie als Eigentümer begrüßen zu dürfen, und danken Ihnen herzlich für das Vertrauen, das Sie uns mit der Verwaltung Ihrer WEG entgegenbringen."
  2. „Bitte vervollständigen Sie in den folgenden Schritten Ihre persönlichen Stammdaten. Der Vorgang dauert nur wenige Minuten und kann jederzeit unterbrochen werden."
- **„Was Sie erwartet"-Card** (weiße `SectionCard`, Label `WAS SIE ERWARTET` 10px uppercase):
  - Eine Zeile pro Schritt mit:
    - Nummer-Badge (28×28 Kreis): Schritt 1 = oranger Vollkreis mit weißer „1", Schritte 2–5 = grauer Outline-Kreis mit grauer Nummer.
    - Step-Name (14px, `font-medium`).
    - Pill rechts: „Pflicht" (Schritt 1, Primary-Orange-Hintergrund, weiß) bzw. „Optional" (Schritte 2–5, `bg-muted text-muted-foreground`).
  - Trennlinien zwischen den Zeilen (`h-px bg-foreground/[0.055]`).
- **Primary-Button** „Jetzt starten" (volle Breite).
- **Subtext** darunter mittig: „Ihre Daten werden sicher gespeichert" (`text-xs text-muted-foreground`).

**Verhalten:**
- Welcome-Screen erscheint nur, wenn weder Schritt 1 begonnen wurde noch `is_repeat_owner` gesetzt ist (also bei `progress.current_step === 1 && !progress.step1_completed_at && Object.keys(progress.step_data?.step1 ?? {}).length === 0`).
- Beim Klick auf „Jetzt starten" wird der Welcome-State auf `false` gesetzt und der eigentliche Wizard angezeigt.
- Im Welcome-State:
  - Fortschrittsbalken: alle 5 Balken grau, Anzeige „0 / 5".
  - Footer (Zurück/Weiter/Skip) ausgeblendet.
  - Modal bleibt hard-locked (Schließen verhindert).

## 4. Top-Bar-Anpassung
- Top-Bar weiterhin sticky, weiß, mit `border-b`.
- Links: neues Logo-`<img>`.
- Rechts: bisheriger „X / 5 erledigt"-Text entfällt — wird durch das „1 / 5" am Fortschrittsbalken ersetzt.
- Höhe leicht erhöht auf ~52px für bessere Logo-Darstellung.

## 5. Kohärenz mit bestehenden Schritten
- Keine Änderung an den Step-Komponenten 1–5 selbst — nur Modal-Shell, Header, Fortschrittsbalken und neuer Welcome-Screen.
- Auto-Save (`useStepAutoSave`) und Submit-Logik bleiben unverändert.

## Geänderte / neue Dateien
- `src/components/onboarding/ui/RgiWordmark.tsx` — wird zu echtem Logo (`<img>`).
- `src/components/onboarding/ui/StepSlider.tsx` — komplett neu als Linien-Variante mit „n / 5"-Anzeige.
- `src/components/onboarding/ui/WelcomeScreen.tsx` — **NEU**: Welcome-Screen-Komponente inkl. „Was Sie erwartet"-Liste und „Jetzt starten"-Button.
- `src/components/onboarding/OnboardingWizardModal.tsx` — Welcome-State integriert, Top-Bar/Slider-Layout angepasst.
