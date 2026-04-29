## Ziel

Das Notfallkontakte-Widget am Schwarzen Brett bekommt ein pillen-basiertes Design mit RGI-Orange-Akzenten. Jede Firma sowie jeder öffentliche Notruf wird als kompakte, klickbare Pille dargestellt. Per Klick fährt darunter ein Detailbereich mit Telefonnummer, E-Mail und – bei Handwerksbetrieben – einem kurzen Erklärtext aus.

## Änderungen

### 1. `src/components/forum/EmergencyContactsWidget.tsx`

**Hausverwaltung** (bleibt prominent oben):
- Karte mit dezentem Orange-Akzent (linker Border in `rgi-orange`, leichter Orange-Tint im Hintergrund)
- Telefon + E-Mail als kompakte Buttons darunter

**Handwerksbetriebe** (Kernumbau):
- Pro Kategorie (z. B. „Heizung/Sanitär", „Hausmeister") eine Sektion mit:
  - Kategorie-Titel
  - Kurzer Erklärtext (`getCategoryHint`) — generelle Erklärung wann die Kategorie kontaktiert wird
  - Darunter ein Flex-Wrap aller Firmen als **orangene Pillen** (rounded-full, weicher Orange-Hintergrund, Orange-Border, Phone-Icon links, Firmenname rechts)
- Klick auf eine Pille → expandiert direkt darunter (innerhalb der Sektion) ein Detailpanel mit:
  - Telefonnummer als großer Tel-Link (mit Phone-Icon)
  - E-Mail als kleiner sekundärer Link (optional, dezent)
  - `emergency_note` der Firma als zusätzlicher Kontext-Text
- Nur eine Pille gleichzeitig geöffnet (lokaler State `expandedId`)

**Öffentliche Notrufe** (gleiche Pillen-Optik):
- Statt Grid-Karten ebenfalls Pillen (Feuerwehr, Rettungsdienst, Polizei)
- Notruf-Pillen in dezentem Rot-Akzent zur visuellen Unterscheidung von Handwerker-Orange
- Klick → fährt darunter aus mit Nummer (groß, tap-to-call) und Hinweis wann anrufen

### 2. Farbgebung (RGI-Orange Integration)

- Header-Icon-Box (`ShieldAlert`) bekommt Orange-Tint statt neutralem Grau
- Sektionsüberschriften mit kleinem Orange-Akzent-Strich links
- Pillen Handwerker: `bg-orange-50/80` + `border-orange-200` + `text-orange-900` (dark mode entsprechend)
- Pillen Notruf: dezenter Rot-Tint
- Aktive/expandierte Pille: kräftigeres Orange + Schatten
- Hover-States mit sanftem Übergang

### 3. Texte (`src/lib/emergencyContactInfo.ts`)

Kleine Anpassung: Generelle Einleitung für die Handwerker-Sektion ergänzen:
```
HANDWERKER_INTRO = "Bitte nur kontaktieren, wenn die Hausverwaltung nicht erreichbar ist. Wählen Sie das passende Gewerk:"
```
Die `EMERGENCY_CATEGORY_INFO` bleiben als Kategorie-Erklärtexte. Pro Firma wird zusätzlich `emergency_note` (firmenspezifisch) im ausgefahrenen Bereich angezeigt.

### 4. Default-Zustand

Bleibt geschlossen (wie zuletzt vereinbart). Innerhalb des geöffneten Widgets sind alle Firmen-Pillen ebenfalls eingeklappt — Nutzer klickt gezielt eine Firma an.

## Technisches

- Lokaler State: `const [expandedId, setExpandedId] = useState<string | null>(null)` — eine ID umfasst sowohl Assignment-IDs als auch Notruf-Indizes (Prefix `notruf-`)
- Pillen sind `<button>` Elemente (nicht `<a>`), Tel/Mail-Links erst im ausgefahrenen Bereich → klares Zwei-Schritt-Verhalten
- Animation: `data-state` getriebenes `max-height` Transition oder einfach Conditional Render mit `animate-accordion-down` falls vorhanden
- Tailwind-Klassen via direkter HSL-Tokens (kein `text-orange-*` Hardcoding wenn möglich) — nutze ggf. existierende `rgi-orange` Tokens aus `tailwind.config.ts`. Falls nicht vorhanden, verwende sparsam `bg-[hsl(var(--primary)/0.1)]` Pattern.

## Out of Scope

- DB-Schema bleibt unverändert
- BuildingServiceProvidersTab (Admin-Seite) wird nicht angefasst
- Keine neuen Migrations
