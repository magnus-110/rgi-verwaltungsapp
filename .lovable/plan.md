

## Visual Redesign der Meldungsseite (Admin)

### Ziel
Die Seite `/reports` optisch an das restliche App-Design anpassen (wie Dashboard, Transfers, Inbox) — moderner, ruhiger, konsistenter. **Keine** funktionalen Änderungen.

### Aktuelle Schwächen
- Header generisch (`text-2xl font-bold`) statt einheitlicher `heading-primary`-Stil
- Summary-Cards flach, ohne Icon-Akzente und Farbcodierung
- Section-Überschriften nutzen knallrot/gelb (`text-red-600`, `text-yellow-600`) → bricht Brand (RGI Orange)
- Cards nutzen `border-0 shadow-sm bg-white` → inkonsistent mit `rgi-card`-System
- Notiz-Boxen (grün/grau) wirken wie Bootstrap-Snippets
- Keine visuelle Trennung Avatar/Identität → flache Wand aus Text
- Anhänge-Bereich nutzt `bg-muted` Boxen statt eleganter Badges/Chips

### Redesign-Konzept

**1. Header-Bereich**
- `heading-primary` Klasse, Icon links neben Titel (Inbox/MessageSquare), kleiner Untertitel
- Toolbar: Tabs links (Underline-Variante bleibt), rechts kompakter Actionbar mit Zeitraum-Select + Export-Button

**2. Summary-Cards (Offen / Bearbeitet)**
- Farbiger linker Akzentstreifen: Offen = `border-l-4 border-l-destructive`, Bearbeitet = `border-l-4 border-l-warning`
- Icon in farblich getöntem Kreis (`bg-destructive/10`), nicht grau
- Große Zahl `text-3xl font-semibold tracking-tight`
- Zusätzlich Mini-Trend-Text ("aktueller Zeitraum")

**3. Filterleiste**
- Suche in `Input` mit `Search`-Icon (nicht Filter-Icon) links
- Filter-Button mit Badge-Counter behält Logik
- Collapsible-Panel: gleiches Look wie Calendar/Todos (`bg-muted/30 rounded-lg border p-3`) — bleibt strukturell erhalten

**4. Section-Überschriften**
- Statt knallroter/gelber Schrift: dezenter Header mit farbigem Dot + neutralem Text
  - `● Offene Meldungen` (Dot in `bg-destructive`)
  - `● Bearbeitete Meldungen` (Dot in `bg-warning`)
- Counter als Badge (`variant="secondary"`)

**5. Report-Card Redesign**
- `rgi-card` Klasse (border, hover-shadow, leichte Skalierung)
- Linker farbiger Statusstreifen (matching status)
- Header-Zeile: Avatar-Kreis mit Initialen des Kontakts → Name + Erstelldatum (relativ: "vor 2h")
- Titel als `text-base font-semibold`
- Beschreibung mit `line-clamp-2`, Klick expandiert
- Meta-Infos in 2-Spalten-Grid mit Icons (Phone, Mail, Building2, User) statt fettem Text
- Action-Buttons rechts oben in dezenter Toolbar (`opacity-60 hover:opacity-100`)
- Notiz-Boxen: dezente Hintergründe (`bg-success/5 border-success/20` statt `bg-green-50 border-green-400`), Icon (StickyNote/Lock) links
- Anhänge als kompakte Chip-Badges mit Paperclip-Icon, hover mit Primary-Tint

**6. Empty States**
- Statt Card mit Text → zentriertes Icon + Text in `border-dashed border-muted-foreground/20 rounded-lg`

**7. Tokens & Konsistenz**
- Alle hardcoded Farben (`text-red-600`, `bg-green-50`, `text-blue-600`) ersetzen durch semantische Tokens (`text-destructive`, `bg-success/10`, `text-primary`)
- Spacing einheitlich `space-y-6`
- Typographie: `font-manrope` für Body, `heading-primary` für Headings

### Geänderte Dateien
- `src/pages/Reports.tsx` — komplettes JSX-Markup neu (Logik 1:1 erhalten: State, Filter, Fetch, Realtime, Export, Case-Linking)

### Was unverändert bleibt
- Alle Hooks, Queries, State-Management
- Realtime-Subscription
- Excel-Export inkl. Filter-Dialog
- Case-Verknüpfung (FolderPlus / Link2 Buttons)
- EditReportDialog, ReportTemplatesManager, CreateCaseDialog, LinkReportToCaseDialog
- Tabs Meldungen/Vorlagen, Collapsible für bearbeitete Meldungen
- attachmentUrls signed URL Logik

