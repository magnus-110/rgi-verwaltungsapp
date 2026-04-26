
# Onboarding-Wizard – Visuelles Redesign

Das bestehende Wizard-Verhalten (5 Schritte, Auto-Save, Hard-Lock Schritt 1, Skip 2–5, `is_repeat_owner`, Edge-Function `submit-onboarding-step`) bleibt **unverändert**. Es wird ausschließlich das **visuelle Layout** umgebaut – nahe am vorgelegten Claude-Plan, aber kohärent mit dem bereits existierenden RGI-Designsystem.

---

## 1. Farbabgleich mit bestehendem System (Kohärenz)

Das vorgelegte Orange `#E8761A` weicht minimal vom bereits etablierten **RGI-Orange `#ee7202`** (`hsl(25 94% 48%)`) ab. Damit die App konsistent bleibt, werden die **bestehenden Tokens verwendet**, nicht neue eingeführt:

| Plan-Vorgabe | Bestehender Token | Verwendung |
|---|---|---|
| Primary Orange `#E8761A` | `--primary` (`hsl(25 94% 48%)` = #ee7202) | Buttons, aktive States, Akzente |
| Orange dunkel | `--orange-hover` | Hover |
| Orange light `#FBF3EB` | `--accent` (`hsl(35 50% 92%)`) | Selected-Card-BG |
| Hintergrund App `#F5F0EB` | `--background` / `--input` | Wizard-BG, Input-BG |
| Card weiß | `--card` | Section Cards |
| Text primär `#2D2D2D` | `--foreground` | Standardtext |
| Text sekundär `#6B6660` | `--muted-foreground` | Labels |
| Text tertiär `#9A9490` | `--muted-foreground` (lighter via opacity) | Section-Labels uppercase |
| Border `rgba(0,0,0,0.07)` | `--border` | Card-Borders |
| Success `#1D9E75` | `--success` | „Übernommen"-Status |
| Century Gothic / Work Sans | `font-display` / `font-sans` | Bereits konfiguriert ✓ |

→ **Keine neuen CSS-Variablen nötig.** Alle Farben sind bereits HSL-gemappt.

---

## 2. Datei-Struktur (was wird angefasst)

**Bestehend bleiben (nur intern visuell überarbeitet):**
- `src/components/onboarding/OnboardingWizardModal.tsx` – Top-Bar, Step-Slider, Footer komplett neu
- `src/components/onboarding/steps/Step1Stammdaten.tsx` – Section-Card-Layout
- `src/components/onboarding/steps/Step2Wohnungsdaten.tsx` – Info-Banner + 2-Col-Grid
- `src/components/onboarding/steps/Step3Gebaeude.tsx` – Gut/Mittel/Schlecht Triple, 2×3 Bereiche-Grid
- `src/components/onboarding/steps/Step4Dienstleister.tsx` – Filter-Chips, Provider-Cards, Add-Card mit Inline-Form
- `src/components/onboarding/steps/Step5Einschaetzung.tsx` – Range-Slider statt StarScale, Card-Toggle für Kassenprüfung

**Neu erstellt (kleine, wiederverwendbare Bausteine):**
- `src/components/onboarding/ui/SectionCard.tsx` – weiße Card mit optional Section-Label, dünnen Trennlinien
- `src/components/onboarding/ui/InlineField.tsx` – Inline-Label + transparent Input (Layout wie im Plan)
- `src/components/onboarding/ui/StepSlider.tsx` – horizontale Stepper-Leiste mit Kreisen + Labels
- `src/components/onboarding/ui/MultiEntryList.tsx` – generische Liste für Telefon/E-Mail mit „+ hinzufügen"
- `src/components/onboarding/ui/RangeSlider.tsx` – 1–5 Slider mit Live-Wert + Beschreibung (ersetzt visuell `StarScale`)
- `src/components/onboarding/ui/ChoiceCardPair.tsx` – 2 Cards nebeneinander mit Radio-Dot (Hauptansprechpartner, Kassenprüfung)

`StarScale.tsx` und `BigChoiceCard.tsx` bleiben für andere Aufrufer erhalten, werden im Wizard aber nicht mehr verwendet.

---

## 3. Globales Layout (Modal)

```
DialogContent (max-w-2xl, p-0, bg-[hsl(var(--background))])
├─ Top Bar (sticky, bg-white, border-b)
│   └─ RGI-Logo links (SVG Hausumriss in primary + „RGI IMMOBILIEN" Wortmarke)
│      Höhe ~48px
├─ Step Slider (sticky, bg-white, border-b, py-3)
│   └─ 5 Kreise (28×28, rounded-full) + Labels darunter (text-[9px])
│      Verbindungslinie 2px zwischen den Kreisen
│      done = primary + Check ✓ + helle Linie
│      active = primary + box-shadow ring (ring-4 ring-primary/20)
│      pending = grauer Kreis
├─ Scroll Area (flex flex-col gap-2.5, px-4 py-3)
│   └─ Section Cards je nach Schritt
└─ Footer (sticky bottom, bg-white, border-t)
    └─ Zurück (ghost) | Überspringen (outline) | Weiter (primary)
```

Mobile (≤640px): Modal wird `fullscreen` (`max-w-full max-h-[100dvh] rounded-none`).

---

## 4. Section Card – Spezifikation

```tsx
<SectionCard label="WOHNANSCHRIFT">
  <InlineField label="Straße *">…</InlineField>
  <Divider />
  <TwoColField labels={["PLZ *", "Ort *"]}>…</TwoColField>
</SectionCard>
```

- Card: `bg-card rounded-[14px] border border-border/60 overflow-hidden`
- Section-Label: `text-[10px] uppercase tracking-[0.6px] text-muted-foreground/80 font-medium px-4 pt-3 pb-1`
- Field-Divider: `h-px bg-foreground/[0.055]`
- Pflichtfeld-Stern: `text-primary` (`*`)

**InlineField (Standard):**
- `min-h-[50px] flex items-center px-4 gap-3`
- Label: `w-[100px] text-[13px] text-muted-foreground shrink-0`
- Input: `flex-1 text-right bg-transparent border-0 outline-none text-[14px]`

**Embedded Input (2-Col-Grid für PLZ/Ort, Wohnungsdaten):**
- `bg-[hsl(var(--input))] rounded-lg px-3 py-2.5 focus:bg-[hsl(35_25%_92%)]`
- Kein Border im Ruhezustand

---

## 5. Schritt 1 – Stammdaten

Sections (jede in eigener `SectionCard`):

1. **Wohnanschrift** – InlineField „Straße", danach 2-Col-Grid (`grid-cols-[90px_1fr] gap-2`) für PLZ + Ort
2. **Telefon** (`MultiEntryList`):
   - Item: Input + Typ-Select rechts + ×-Button (22px, `bg-foreground/5`)
   - Erstes Item ohne ×-Button
   - Footer: `+ Weitere Nummer hinzufügen` Button (full-width, ghost, primary text, mit gestricheltem 22px-Plus-Kreis links)
3. **E-Mail** – analog `MultiEntryList`, Hinweistext `text-[11px] text-muted-foreground/80`
4. **Bankverbindung** – InlineField IBAN + Hinweistext darunter (font-mono uppercase)
5. **Hauptansprechpartner** – `ChoiceCardPair`: zwei Cards „Ich selbst" / „Andere Person", Radio-Dot oben links. Bei „Andere Person" klappt darunter ein Inline-Input für Namen auf.
6. **Wünsche & Erwartungen** – Textarea ohne Border, transparent, in eigener SectionCard

**Datenmodell-Anpassung:** `Step1Data.phone` (string) → `phones: { number: string; type: 'private'|'mobile'|'business' }[]`. `email` (string) → `emails: string[]`. Validator `validateStep1` entsprechend angepasst (mind. 1 Telefonnummer, IBAN ≥ 15 Zeichen, etc.). Bestehende Single-Werte bleiben in der DB als ersten Eintrag rückwärtskompatibel – Migration nicht nötig (Storage ist JSONB `step_data`).

---

## 6. Schritt 2 – Wohnungsdaten (Optional)

- **Info-Banner** oben: `bg-accent rounded-xl p-3 flex gap-3` mit Info-Icon-Kreis (`size-5 rounded-full bg-primary/15 text-primary`) + Text 12px
- **Wohnungs-Nr.** – InlineField, Input rechtsbündig, Breite 160px. Darunter optional: grüner 6px-Dot (`bg-success`) + „Stimmt mit unseren Unterlagen überein" 11px
- **Finanzielle Eckdaten** – 2-Col-Grid in einer Card, Trennlinie vertikal mittig:
  - Zelle: Label oben (11px) → embedded Input → Einheit unten (11px „€/Monat", „Anteile")
- **Wohnfläche** – InlineField mit „m²" Suffix außen rechts

Footer: zusätzlicher „Schritt überspringen"-Button (outline)

---

## 7. Schritt 3 – Gebäude (Optional)

- **Gesamteindruck** – 3 Buttons in `flex gap-2`, jeder `flex-1 rounded-[10px] border-[1.5px] py-3 flex flex-col items-center gap-1`
  - Icons (Emoji oder Lucide): 😊 / 😐 / 😟
  - Selected-States: Gut → `border-success bg-success/10`, Mittel → `border-warning bg-warning/10`, Schlecht → `border-destructive bg-destructive/10`
- **Bereiche mit Auffälligkeiten** – `grid-cols-2 gap-2` (2×3):
  - Zelle: `rounded-xl border-[1.5px] p-3 flex items-center gap-3`
  - Icon-Wrap: `size-[34px] rounded-[9px] bg-muted` (selected: `bg-primary/15`)
  - Name (14px, semibold) + Subtitle (11px muted)
  - Häkchen-Kreis rechts: leerer Kreis → bei selected `bg-primary text-white` mit Check
  - Bereiche: Dach (Home), Fassade (Building), Treppenhaus (Stairs), Keller (Archive), Eingang (DoorOpen), Sonstiges (MoreHorizontal)
- **Freitext** – Textarea Card

→ **Datenmodell-Erweiterung Step3:** `general_impression: 'gut'|'mittel'|'schlecht'`, `problem_areas: string[]`. Die alten Heizungs-/ETV-Felder werden in `building_id`-spezifischen Onboarding-Daten anders erhoben (Umstellung gemäß Claude-Plan).

---

## 8. Schritt 4 – Dienstleister (Optional)

- **Filter-Chips** – `flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none`
  - Chip: `px-3 py-1.5 rounded-full border-[1.5px] border-border/60 text-[13px] whitespace-nowrap`
  - Active: `bg-primary text-primary-foreground border-primary`
  - Kategorien aus `SERVICE_PROVIDER_CATEGORIES` (bestehend)
- **Provider Cards** – Liste:
  - `rounded-[14px] border-[1.5px] border-border/60 p-3.5 flex items-center gap-3`
  - Avatar: `size-10 rounded-[10px] bg-muted text-muted-foreground font-display text-[14px] flex items-center justify-center` (Initialen)
  - Info: Name 14px bold + Kategorie 11px muted
  - Select-Kreis rechts: 22px
  - Selected: `border-primary bg-accent`, Avatar `bg-primary text-white` mit Check
- **„Weiteren hinzufügen"-Card**:
  - `border-[1.5px] border-dashed border-primary/40` (gleiches Maß wie Provider-Card)
  - Avatar-Wrap als gestrichelter Plus-Kreis in primary
  - **Beim Klick**: Card-Radius oben bleibt 14px, unten 0 → direkt darunter Inline-Form (`rounded-b-[14px] border-[1.5px] border-t-0 border-primary/40 p-3 space-y-2`) mit Feldern Name + Gewerk + „Hinzufügen"-Button

---

## 9. Schritt 5 – Einschätzung (Optional)

- **Gebäudezustand – RangeSlider** (neue Komponente, ersetzt `StarScale` im Wizard):
  - Über dem Slider: `font-display text-[28px] text-primary` Wert + Beschreibungstext
  - Native `<input type="range" min=1 max=5 step=1>` – custom CSS:
    - Track: `appearance-none h-1 rounded-full` mit `background: linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) X%, hsl(35 25% 88%) X%, hsl(35 25% 88%) 100%)` wobei X = (value-1)/4 * 100
    - Thumb: `size-[26px] rounded-full bg-white border-[2.5px] border-primary`
  - Labels: „Schlecht" links, „Ausgezeichnet" rechts, 10px muted
  - Beschreibungen: `['Stark sanierungsbedürftig', 'Renovierungsbedarf', 'Zustand in Ordnung', 'Gut gepflegt', 'Ausgezeichneter Zustand']`
- **Kassenprüfung – ChoiceCardPair**:
  - 2 Cards `flex-1 p-3.5 rounded-xl border-[1.5px]`
  - Radio-Dot 18px oben → Titel 14px bold → Subtext 11px (2 Zeilen Erklärung)
  - „Ja" selected: `border-primary bg-accent` + Dot `bg-primary`
  - „Nein" selected: `border-muted-foreground/40 bg-muted` + Dot `bg-muted-foreground/60`
- **Hinweise** – Textarea Card

---

## 10. Top Bar / Logo

Da bisher kein extrahiertes RGI-Logo vorliegt, wird ein leichtgewichtiges Inline-SVG gebaut:
- Hausumriss (Dreieck-Dach + Rechteck) in `text-primary`, 22px
- Wortmarke „RGI" in `font-display font-bold text-foreground` + „IMMOBILIEN" in `text-muted-foreground tracking-wide text-[10px]`
- Komponente: `src/components/onboarding/ui/RgiWordmark.tsx`

---

## 11. Step Slider

`src/components/onboarding/ui/StepSlider.tsx`:

```
[●]──[●]──[◉]──[○]──[○]
done done active pend pend
Stamm Wohn Geb Diens Eins
```

- Container: `flex items-start justify-between px-2`
- Step: `flex flex-col items-center gap-1.5 flex-1`
- Kreis: `size-7 rounded-full grid place-items-center text-[11px] font-medium`
  - done: `bg-primary text-white` mit Check (size-3)
  - active: `bg-primary text-white ring-4 ring-primary/20`
  - pending: `bg-muted text-muted-foreground`
- Label: `text-[9px] text-muted-foreground` (active: `text-foreground font-medium`)
- Verbindungslinie: absolute zwischen Kreisen, 2px hoch, done-Hälfte primary, sonst `bg-border`

Klickbar wie bisher (außer Hard-Lock).

---

## 12. Abschluss-Screen (`allDone`)

- Checkmark-Icon: `size-16 rounded-full bg-primary grid place-items-center` mit weißem Lucide `Check` (size-8)
- Titel `font-display text-2xl`: „Onboarding abgeschlossen"
- Subtext 13px muted
- **Summary-Card** (`bg-card rounded-[14px] border p-4 space-y-2`):
  - 5 Zeilen, eine pro Schritt
  - `flex items-center gap-3`: 20px primary-Dot mit Check + Step-Name + Status rechts
  - Status: Stammdaten = `text-success` „Übernommen", andere = `text-muted-foreground` „In Prüfung"
- „Zur App"-Button primär (full-width auf Mobile)

Ersetzt den heutigen `PartyPopper`-Block.

---

## 13. Footer & Verhalten (unverändert in Logik)

- `bg-card border-t px-4 py-3 flex justify-between gap-2`
- Links: „Zurück" (ghost) – ausgeblendet bei Step 1 oder Hard-Lock
- Rechts: „Überspringen" (outline, nur 2–5) + „Weiter" / „Abschließen" (primary)
- Hard-Lock-Logik (`isStep1HardLocked`, `onPointerDownOutside`, `onEscapeKeyDown`) bleibt
- Auto-Save (`useStepAutoSave`) bleibt
- Submit über bestehende Edge-Function `submit-onboarding-step` bleibt

---

## 14. Reihenfolge der Umsetzung

1. UI-Bausteine erstellen (`SectionCard`, `InlineField`, `StepSlider`, `MultiEntryList`, `RangeSlider`, `ChoiceCardPair`, `RgiWordmark`)
2. `OnboardingWizardModal.tsx` umbauen (Top-Bar, Slider, Footer, Abschluss-Screen)
3. Steps 1–5 nacheinander auf neues Layout umstellen, jeweils mit angepasstem Datenmodell für Step 1 (phones[], emails[]) und Step 3 (general_impression, problem_areas)
4. Sichttest im Preview (Desktop 930px + Mobile-Breakpoint)

Keine DB-Migration, keine Edge-Function-Änderungen – `step_data` ist JSONB und nimmt das erweiterte Schema problemlos auf.
