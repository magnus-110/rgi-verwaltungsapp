

## Gebaude-Hub: Master-Detail Umstrukturierung

### Ueberblick

Die Gebaeude-Seite wird zum zentralen Hub mit Master-Detail-Layout. Meldungen bleiben zusaetzlich als eigenstaendiger Menue-Punkt erhalten (globale Uebersicht), werden aber auch im Gebaeude-Dashboard angezeigt.

### Neue Struktur

```text
Sidebar                    Hauptbereich
+-------------------+     +------------------+----------------------------------+
| Dashboard         |     | Gebaeude-Liste   | Gebaeude-Dashboard               |
| NOVA              |     | [Suche...]       |                                  |
| Aufgaben          |     | + Neu            | [Header: Name, Adresse, Code]    |
| Kalender          |     |                  |                                  |
| Meldungen         |     | > Musterweg 1 *  | Tabs:                            |
| Gebaude      <--  |     |   Hauptstr. 5    | Uebersicht | Personen | Meldungen|
| Chatbot           |     |   Parkstr. 12    | Dokumente | Schw.Brett | Wartung  |
| Einstellungen     |     |                  |                                  |
+-------------------+     +------------------+----------------------------------+
```

### Sidebar-Aenderungen (`AdminSidebar.tsx`)

- **Entfernen**: "Schwarzes Brett" und "Dokumente" (FolderOpen/Files) als eigenstaendige Punkte
- **Behalten**: "Meldungen" bleibt als globaler Punkt
- **Gebaeude** rueckt in der Reihenfolge nach oben (nach Meldungen)

Neue Reihenfolge:
1. Dashboard
2. NOVA
3. Aufgaben
4. Kalender
5. Meldungen
6. Gebaeude
7. Chatbot
8. Einstellungen

### Neue Dateien

**`src/pages/Buildings.tsx`** (Refactor)
- Split-Layout mit ResizablePanel: linke Spalte (Gebaeude-Liste, ~300px), rechte Spalte (Dashboard)
- Gebaeude-Liste mit Suche, Filter, "Neues Gebaeude" Button
- URL-Routing: `/buildings` zeigt Liste, `/buildings/:id` selektiert ein Gebaeude
- Mobile: Liste als eigene Ansicht, Klick oeffnet Dashboard fullscreen

**`src/components/buildings/BuildingList.tsx`**
- Scrollbare Liste aller Gebaeude (gefiltert nach management_mode)
- Suchfeld, aktives Gebaeude hervorgehoben
- "Neues Gebaeude" Button oben

**`src/components/buildings/BuildingDashboard.tsx`**
- Header mit Gebaeude-Info (Name, Adresse, Code, Badges) und Quick-Actions (Bearbeiten, Loeschen, Verwalter zuweisen)
- Tab-System mit 6 Tabs:

**Tab 1: Uebersicht**
- Statistik-Karten: Anzahl Eigentuemer/Mieter, offene Meldungen, naechste Wartung, Anzahl Dokumente
- Schnellzugriff-Buttons

**Tab 2: Personen**
- Bestehende UsersList-Komponente, vorgefiltert auf dieses Gebaeude
- Nutzer hinzufuegen (CreateUserDialog), Bulk Upload

**Tab 3: Meldungen** (`src/components/buildings/BuildingReportsTab.tsx`)
- Wiederverwendbare Komponente aus Reports.tsx Logik extrahiert
- Vorgefiltert auf `building_id` des aktuellen Gebaeudes
- Zeigt weg_reports oder miete_reports je nach management_mode

**Tab 4: Dokumente** (`src/components/buildings/BuildingFilesTab.tsx`)
- Wiederverwendbare Komponente aus Files.tsx Logik extrahiert
- Vorgefiltert auf `building_id`, Upload-Funktion direkt integriert

**Tab 5: Schwarzes Brett** (`src/components/buildings/BuildingForumTab.tsx`)
- Wiederverwendbare Komponente aus Forum.tsx Logik extrahiert
- Vorgefiltert auf `building_id`, Post erstellen direkt moeglich

**Tab 6: Wartung** (`src/components/buildings/BuildingMaintenanceTab.tsx`)
- Bestehende MaintenanceConfigSection integriert
- Wartungskonfiguration laden/speichern fuer dieses Gebaeude

### Routing-Aenderungen (`App.tsx`)

```text
/buildings        -> Buildings (Master-Detail, kein Gebaeude selektiert)
/buildings/:id    -> Buildings (Master-Detail, Gebaeude selektiert)
/reports          -> Reports (bleibt, globale Uebersicht)
/forum            -> Redirect zu /buildings (oder entfernen)
/files            -> Redirect zu /buildings (oder entfernen)
```

### Bestehende Seiten

- `Reports.tsx` bleibt unveraendert als globale Meldungs-Uebersicht
- `Forum.tsx` und `Files.tsx` bleiben vorerst erhalten (Legacy-Routen), Kernlogik wird aber in wiederverwendbare Tab-Komponenten extrahiert

### Umsetzungsreihenfolge (4 Iterationen)

1. **Iteration 1**: Master-Detail-Layout + BuildingList + BuildingDashboard mit Uebersicht-Tab und Personen-Tab
2. **Iteration 2**: Meldungen-Tab und Dokumente-Tab integrieren
3. **Iteration 3**: Schwarzes-Brett-Tab und Wartungs-Tab
4. **Iteration 4**: Sidebar bereinigen, alte Routen redirecten, Mobile-Optimierung

### Technische Details

- ResizablePanelGroup fuer Desktop-Split-Layout (wie Nova-Chat)
- Tabs via shadcn/ui Tabs-Komponente
- Bestehende DB-Tabellen und RLS-Policies bleiben unveraendert -- keine Migrationen noetig
- Daten werden per `building_id` Filter aus bestehenden Tabellen geladen
- React Query fuer Caching und Invalidierung

