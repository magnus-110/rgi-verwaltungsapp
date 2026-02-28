

## Plan: Meldungsformular vereinfachen

Beide Formulare (Mieter und WEG-Eigentuemer) werden nach dem gleichen Prinzip ueberarbeitet.

### Aenderungen im Ueberblick

**1. Gebaeude automatisch auswaehlen (WEG-Eigentuemer)**
- Wenn nur 1 Gebaeude zugeordnet ist: automatisch auswaehlen, Feld wird nicht als Auswahl angezeigt, sondern nur als fester Text im Kontaktbereich
- Nur bei mehreren Gebaeuden wird das Select-Dropdown angezeigt

**2. Kontaktdaten als aufklappbarer Bereich**
- Oben wird nur der Name des Nutzers als fester Text angezeigt (kein Eingabefeld-Look)
- Daneben ein kleiner Pfeil (ChevronDown), der beim Klick die weiteren Daten aufklappt (E-Mail, Telefon, Gebaeude)
- Die Felder sehen aus wie normaler Text (kein Border, kein Input-Styling)
- Beim Klick auf einen Wert wird er zu einem editierbaren Input-Feld
- Collapsible-Komponente von Radix wird verwendet

**3. Formular-Reihenfolge vereinfacht**
- Oben: Kontaktbereich (Name + aufklappbar: E-Mail, Telefon, Gebaeude)
- Mitte: Titel und Beschreibung (die Hauptfelder, gut sichtbar)
- Unten: Anhaenge und Absende-Button

### Technische Umsetzung

**Dateien:**
- `src/pages/weg-owner/Reports.tsx` - Formular im Dialog ueberarbeiten
- `src/pages/tenant/Reports.tsx` - Formular im Dialog ueberarbeiten

**Kontaktbereich-Design:**
```text
+------------------------------------------+
| Max Mustermann              [v] Details   |
+------------------------------------------+
| (aufgeklappt:)                           |
|   E-Mail: max@example.com               |
|   Telefon: 0123 456789                   |
|   Gebaeude: Musterstr. 1                 |
+------------------------------------------+
```

- Text-Felder nutzen `cursor-pointer` und wechseln bei Klick zu einem Input
- Schriftgroesse bleibt gross genug fuer aeltere Nutzer (text-base)
- Klarer visueller Hinweis "Zum Bearbeiten antippen" als kleiner Hilfetext

**WEG-Eigentuemer: Auto-Select Logik:**
- In `useEffect` nach `fetchBuildings`: wenn `buildings.length === 1`, automatisch `building_id` und `contact_address` setzen
- Select nur rendern wenn `buildings.length > 1`

**Mieter:**
- Gebaeude ist bereits automatisch gesetzt (ueber `tenantInfo`)
- Adress-Feld wird in den aufklappbaren Bereich verschoben

### Barrierefreiheit (fuer aeltere Nutzer)
- Grosse Schrift (text-base / text-lg)
- Klare Beschriftungen
- Deutlicher "Details anzeigen/verbergen"-Button mit Pfeil
- Titel und Beschreibung bleiben prominente, normale Eingabefelder
- Absende-Button bleibt gross und deutlich

