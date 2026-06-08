## Ziel
Konsistente Typografie (Century Gothic Headings, Work Sans Body) und das Notfall-Nummern-Widget so umbauen, dass es zum klaren, edlen Look der WEG-Owner-Startseite passt.

## 1. Typografie konsistent verankern

In `src/index.css`:
- `body` bekommt explizit `font-family: 'Work Sans', system-ui, sans-serif` (aktuell nur über Tailwind `font-sans`, mancher Code überschreibt das).
- Utility-Klassen `.heading-display` / `.heading-primary` werden auf Century Gothic gesetzt (aktuell stehen sie auf `font-sans`/`font-manrope` = Work Sans, was inkonsistent ist).
- `.body-text`, `.body-secondary`, `.label-text` bleiben Work Sans (nur Klassennamen aufräumen).

Im `WegOwnerLayout` / `Dashboard`:
- Begrüßungs-H1 und alle `SectionLabel`-Überschriften erhalten explizit `font-display` (= Century Gothic), damit auch in Edge-Cases die richtige Schrift greift.
- `font-medium`/`font-semibold` an Card-Titeln im Jahreszyklus, Stat-Tiles, Schnellzugriff und Kontakt werden auf `font-display tracking-tight` umgestellt, wo es sich um Überschriften handelt (nicht bei reinen Werten/Fließtext).

## 2. Notfall-Nummern-Widget Redesign

Neues Look & Feel im Stil der bestehenden Dashboard-Karten (rounded-[14px], `border-border/60`, `bg-card`, `shadow-sm`, ListRow-Pattern mit 44 px Icon-Squares, Hairline-Divider `bg-foreground/[0.055]`).

### Struktur
1. **Kollabierte Karte (Default)**
   - Eine ruhige Card mit `rounded-[14px] border border-border/60 bg-card shadow-sm`.
   - Header-Row als 64 px-Tap-Zeile: links 44 px Icon-Square `bg-orange-500/10` mit `ShieldAlert`, mittig „Notfall-Nummern" (`font-display text-[15px]`) + Untertitel „Verwaltung, Technik & öffentliche Notrufe" (`text-[13px] text-muted-foreground`), rechts Chevron.
   - Kein farbiger Balken oben mehr (zu „App"-haft), stattdessen feine 1 px Akzentlinie nur unter dem Header, wenn geöffnet.

2. **Geöffneter Zustand**
   - Hairline-Divider, dann ein „Hinweis"-Bereich: kompakte Zeile mit kleinem `AlertTriangle` in `text-orange-600`, Text in Work Sans, KEIN buntes Kasten-Highlight mehr. Der Text wird kürzer: „Bitte immer zuerst die Hausverwaltung kontaktieren. Externe Handwerker nur, wenn diese nicht erreichbar ist."
   - Darunter 3 Sektionen (Verwaltung, Technik, öffentliche Notrufe). Jede Sektion ist eine `ListRow`-Gruppe — keine eigene Karte mehr, sondern Trennung über Section-Labels (`text-[11px] uppercase tracking-[0.6px] text-muted-foreground/80`) plus Hairline.
   - Jede Kontakt-Zeile = `ListRow`:
     - Icon-Square 44 px (`bg-orange-500/10 text-orange-600`, bei öffentlichen Notrufen `bg-red-500/10 text-red-600`).
     - Title in `font-display text-[15px]` (z. B. „Hausverwaltung", „Feuerwehr").
     - Subtitle in `text-[13px] text-muted-foreground` — Telefonnummer in `tabular-nums`, danach optional kategoriespezifischer Hinweis als ein-zeiliger Satz.
     - Komplette Zeile ist `tel:`-Link, Right-Chevron für visuelle Klickbarkeit.
   - „Technische Betreuung": wenn leer, einzelne ruhige Zeile mit grauem Icon und Text „Keine Handwerksbetriebe als Notfallkontakt freigeschaltet" — kein kursiver Italic mehr.

3. **Footer-Bar entfällt** (Telefon/Mail wären doppelt zur Kontakt-Sektion oben).

### Hochwertige Details
- Konsistente Icon-Squares mit `rounded-xl` (12 px) wie bei den anderen Dashboard-Komponenten — statt der bisherigen `size-9 rounded-full` und `size-9 rounded-md`-Mischung.
- Innenabstand `px-4 py-3.5`, `min-h-[64px]` für gute Tappbarkeit (40+ Nutzer).
- Subtile Hover-Stufe: `hover:bg-muted/40 active:bg-muted/60`, kein Akzentbalken, keine farbigen Hintergrundkästen.
- Wegfall der zwei roten/orangenen `accentBar`-Streifen, des `rgi-orange/[0.06]`-Hinweiskastens und des `border-rgi-orange/20` — diese „Achtung-Optik" wirkt aktuell wie eine andere App.
- Öffentliche Notrufe: rote Icon-Tönung, aber Text bleibt neutral — Hochwertigkeit kommt aus Ruhe, nicht aus Farbflächen.
- Akzent-Strich (1 px) in `bg-foreground/[0.055]` zwischen Gruppen — identisch zum Jahreszyklus.

## 3. Out of scope
- Datenquellen, Edge Functions, Datenbankschema bleiben unverändert.
- Admin-Seite und Tenant-Dashboard bleiben unverändert.
- Keine neuen Routen.

## Dateien
- `src/index.css` — Utility-Klassen + body-Font verankern.
- `src/components/forum/EmergencyContactsWidget.tsx` — komplette UI-Überarbeitung, Daten-/Loader-Logik unangetastet, `ListRow` aus `src/components/dashboard/owner/ListRow.tsx` wiederverwenden.
- `src/components/WegOwnerLayout.tsx` und `src/pages/weg-owner/Dashboard.tsx` — Überschriften gezielt mit `font-display` annotieren (nur wenige Stellen).