
# Eigentümer-Dashboard übersichtlicher (Onboarding-Stil)

## Was am Screenshot heute nicht funktioniert
- **Jahreszyklus**: 6 Stationen horizontal auf 411 px ⇒ Kreise gequetscht, Labels überlappen („Jahresabrechnung" abgeschnitten, „Wirtschaftsplan" kollidiert mit „ETV"), Status nicht erkennbar.
- **4 Schnellaktions-Kacheln** in einer Reihe ⇒ „Versammlungen" bricht zweizeilig, Icons winzig (h-5), Tap-Targets zu klein für 40 +.
- **Stat-Tiles** funktional, aber zu kleine Zahl/Icon, kein klarer Aktionscharakter.
- **Kontakt-Karte** dichte Textwand, kein klarer Aktions-Hinweis (Anrufen/Mailen).
- Generell viele unterschiedliche Border-Radien/Schatten ⇒ unruhig.

## Designsprache (übernommen vom Onboarding-Wizard)
- **Karten**: `bg-card rounded-[14px] border border-border/60`, sanfter Schatten, Hairline-Divider `bg-foreground/[0.055]` zwischen Listenzeilen.
- **Zeilen-Pattern** wie `BigChoiceCard`: links Icon-Quadrat 44–48 px in `bg-primary/10` / `bg-muted`, Titel `font-medium text-base`, Untertitel `text-sm text-muted-foreground`, rechts Chevron oder Zahl.
- **Section-Header**: kleines Uppercase-Label (`text-[11px] tracking-[0.6px] text-muted-foreground/80`) wie `SectionCard label`.
- **Mindest-Tap-Target 56 px**, Schriftgrößen tendenziell eine Stufe größer (Body 15–16 px).
- Farben: Primary-Orange behalten, Status-Grün (`emerald-500`) für erledigt, Orange für laufend, neutrales Grau für offen.

## Neuaufbau (von oben nach unten)

### 1. Begrüßung — kompakter
- `text-2xl font-semibold` (statt 4xl light), eine Zeile.
- Darunter Gebäudename als kleiner Chip (`rounded-full bg-muted px-3 py-1 text-xs`).
- Reduziert vertikalen Platz und wirkt fokussierter.

### 2. Zwei Status-Karten (Offene Meldungen / Offene Beschlüsse) — neuer Stil
- Jede Karte = ganze Breite **einer** Spalte im 2-Spalten-Grid, aber im neuen Stil:
  - Icon-Quadrat 44 px in `bg-orange-500/10` (Meldungen) bzw. `bg-primary/10` (Beschlüsse).
  - Große Zahl `text-3xl font-bold` rechts oben.
  - Label unten `text-sm font-medium`.
  - Ist Wert = 0 ⇒ kleines „Alles erledigt"-Häkchen statt Zahl, neutrale Farbe.
  - Vollflächig klickbar, gleicher Rahmenradius wie SectionCard.

### 3. Jahreszyklus — vertikale Schritt-Liste statt horizontaler Kreise
Das ist die Kernverbesserung. Eine vertikale Liste in einem SectionCard, ein Eintrag pro Meilenstein:

```
┌─────────────────────────────────────────┐
│ JAHRESZYKLUS 2026             [Gebäude ▾]│
├─────────────────────────────────────────┤
│ ✅  Jahresabrechnung erstellt           │
│     erledigt am 12.03.2026              │
├─────────────────────────────────────────┤
│ ✅  Wirtschaftsplan erstellt            │
│     erledigt am 20.03.2026              │
├─────────────────────────────────────────┤
│ 🟠  ETV einberufen                      │
│     in Bearbeitung                      │
├─────────────────────────────────────────┤
│ ⚪  ETV-Protokoll fertig                │
│     offen                               │
├─────────────────────────────────────────┤
│ ⚪  §35a-Bescheinigung versendet        │
│     offen                               │
├─────────────────────────────────────────┤
│ ⚪  Hausgeldanpassung umgesetzt         │
│     offen                               │
└─────────────────────────────────────────┘
```

- Jeder Eintrag: links 32-px-Status-Kreis (grün+✓ / orange-Punkt / grauer Ring), daneben Label `text-[15px] font-medium` + Status/Datum `text-xs text-muted-foreground`.
- Keine Labels mehr unter Mini-Kreisen, keine Überlappung mehr.
- Oben rechts Jahres- und (bei >1 Gebäude) Gebäude-Selector im flachen Stil.
- Auf Tablet/Desktop bleibt dieselbe Liste — eine Spalte ist auch hier gut lesbar.

### 4. Schnellaktionen — 2 × 2 Grid mit großen Kacheln
- Statt 4 × 1 ⇒ **2 × 2** (mobil) bzw. 4 × 1 (Tablet/Desktop ab `sm:`).
- Jede Kachel: 
  - Icon-Quadrat 48 px in `bg-primary/10`, Icon `h-6 w-6 text-primary`.
  - Label `text-sm font-medium` einzeilig (keine Wrap-Probleme mehr).
  - Mindesthöhe 96 px, `rounded-[14px]`, klarer Tap-Hover.
- Wenn „Dokumente" fehlt (kein `hasVisibleFiles`), füllt sich 2 × 2 mit den verbleibenden 3 ⇒ Layout fällt auf 3-Spalten-Reihe zurück.

### 5. Kontakt & Notfall — Listen-Pattern
- Section-Header „KONTAKT & NOTFALL" (uppercase, klein).
- **RGI-Hausverwaltung als SectionCard** mit drei tap-baren Zeilen (alle nach BigChoiceCard-Logik):
  1. 📞 **Anrufen** · `08363 960656` · Untertitel „Mo–Fr 10:00–15:00"
  2. ✉️ **E-Mail schreiben** · `info@rgi-immobilien.de`
  3. 📍 **Adresse / Route** · „Vilstalstr. 4, 87459 Pfronten"
- Jede Zeile öffnet `tel:` / `mailto:` / Google Maps. Großer Touch-Bereich, Chevron rechts.
- Darunter `EmergencyContactsWidget` (Handwerker/Notfall) — bleibt wie bisher, aber Header in gleicher Uppercase-Optik.

### 6. Vertikaler Rhythmus
- Padding zwischen Sektionen `space-y-5` (statt 6) für ruhigeres Bild.
- Max-Breite `max-w-xl` mobil, `max-w-2xl` ab `md:`.

## Was NICHT geändert wird
- Daten/Queries (`weg_owner_buildings`, `weg_reports`, `etv_resolutions`, `annual_cycle_tasks`).
- Routen / Navigation.
- Logik in `OwnerAnnualCycleWidget` (nur Render wird ersetzt; Query bleibt).
- Tenant- und Admin-Dashboard.

## Betroffene Dateien
- `src/pages/weg-owner/Dashboard.tsx` — Layout & neue Stat-/Action-/Kontakt-Kacheln.
- `src/components/dashboard/OwnerAnnualCycleWidget.tsx` — horizontale Timeline ⇒ vertikale Liste.
- Neue kleine Helper-Komponente `src/components/dashboard/owner/ListRow.tsx` (Icon-Square + Titel + Untertitel + optional rechtsbündiges Element) — wird in Stat-Karten, Jahreszyklus-Zeilen und Kontaktblock wiederverwendet, damit überall dasselbe Pattern gilt.

## Out of Scope
- Keine neuen Features (nur visuelle Re-Komposition vorhandener Daten).
- Onboarding-Wizard selbst bleibt unverändert.
- Dark-Mode-Tuning später, falls nötig.
