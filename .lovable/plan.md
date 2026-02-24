

# Neue Dokumenten-Upload-Seite mit Drag & Drop Kacheln

## Uebersicht

Die `/files`-Seite wird komplett umgebaut: Statt eines Upload-Dialogs werden alle Upload-Einstellungen (Kategorie, Sichtbarkeit, Beschreibung etc.) direkt in eine **Toolbar oben** auf der Seite verschoben. Darunter erscheinen bei Auswahl eines Gebaeudes grosse **Drag-and-Drop-Kacheln** fuer das Gebaeude und jeden zugehoerigen Eigentuemer/Mieter, auf die man Dateien einfach per Drag & Drop ablegen kann.

---

## Neues Layout der Seite

```text
+---------------------------------------------------------------+
| Dokumente                                                     |
| Dokumente fuer Gebaeude und Nutzer verwalten                  |
+---------------------------------------------------------------+
| [Gebaeude v]  [Kategorie v] [+Kat] [Sichtbar: On] [Refresh]  |
| [Beschreibung (optional)...]                                  |
+---------------------------------------------------------------+
|                                                               |
| +-----------------------------------------------------------+ |
| |  GEBAEUDE-KACHEL (volle Breite)                           | |
| |  "Musterstr. 5" - Gebaeude-Dokumente                     | |
| |  Dateien hierher ziehen oder klicken                      | |
| |  [bereits hochgeladene Dateien als Liste darunter]        | |
| +-----------------------------------------------------------+ |
|                                                               |
| +---------------------------+  +---------------------------+  |
| |  Max Mustermann           |  |  Erika Muster             | |
| |  max@example.com          |  |  erika@example.com        | |
| |  Dateien hier ablegen     |  |  Dateien hier ablegen     | |
| |  [Dateiliste]             |  |  [Dateiliste]             | |
| +---------------------------+  +---------------------------+  |
+---------------------------------------------------------------+
```

---

## Aenderungen im Detail

### 1. Kategorie-Management direkt in der Toolbar

- Neben dem Kategorie-Dropdown erscheint ein **"+" Button** um neue Kategorien inline hinzuzufuegen (oeffnet einen kleinen Popover mit Name + Farbe)
- Im Kategorie-Dropdown gibt es bei jeder Kategorie ein kleines **Loeschen-Icon** (X), um sie direkt zu entfernen
- Der separate "Kategorien"-Button und das `FileCategoryManager`-Sheet bleiben als erweiterte Verwaltung erhalten

### 2. Toolbar mit Upload-Einstellungen (ersetzt den Upload-Dialog)

Die Felder aus dem bisherigen `FileUploadDialog` wandern in eine kompakte Toolbar direkt auf der Seite:

- **Zeile 1**: Gebaeude-Dropdown | Kategorie-Dropdown (mit +/- Buttons) | Sichtbarkeit-Toggle | Refresh-Button
- **Zeile 2**: Beschreibung (optionales Textfeld, eingeklappt, zeigt sich bei Bedarf)

Der Upload-Dialog wird **entfernt**. Dateien werden stattdessen per Drag & Drop auf die Kacheln gezogen oder per Klick auf eine Kachel ausgewaehlt.

### 3. Drag-and-Drop Kacheln

Wenn ein **Gebaeude ausgewaehlt** ist:

**Gebaeude-Kachel (volle Breite, ganz oben)**
- Grosse Kachel ueber die gesamte Breite
- Zeigt den Gebaeude-Namen und ein Building-Icon
- Text: "Dateien fuer alle Bewohner hierher ziehen"
- Dateien die hier abgelegt werden, bekommen `building_id` = Gebaeude, `assigned_user_id` = NULL
- Darunter: Liste der bereits fuer dieses Gebaeude hochgeladenen allgemeinen Dateien

**Personen-Kacheln (2-spaltig darunter)**
- Je eine Kachel pro Mieter/Eigentuemer des Gebaeudes (gefiltert nach `building_id` in profiles bzw. `weg_owner_buildings`)
- Zeigt Name, E-Mail, User-Icon
- Dateien die hier abgelegt werden, bekommen `building_id` = Gebaeude, `assigned_user_id` = Person
- Darunter: Liste der bereits fuer diese Person hochgeladenen Dateien

Wenn **kein Gebaeude ausgewaehlt** ist ("Alle Gebaeude"):
- Normale Tabellenansicht wie bisher (alle Dateien)

### 4. Drag-and-Drop Logik

Jede Kachel hat:
- `onDragOver` / `onDragEnter` / `onDragLeave` / `onDrop` Event-Handler
- Visuelles Feedback: Border-Farbe aendert sich beim Drag-Over (z.B. blauer Rahmen, leichter Hintergrund)
- Beim Drop: Datei wird mit den aktuell in der Toolbar eingestellten Werten (Kategorie, Sichtbarkeit, Beschreibung) plus der Kachel-spezifischen Zuordnung (building_id / assigned_user_id) hochgeladen
- Alternativ: Klick auf die Kachel oeffnet einen Datei-Picker

### 5. WEG-Eigentuemer Zuordnung

Fuer WEG-Verwaltungsmodus werden die Personen aus der `weg_owner_buildings`-Tabelle geladen statt nur aus `profiles`:
- Alle `weg_owner_buildings`-Eintraege fuer das ausgewaehlte Gebaeude
- Dann deren Profile aus `profiles` laden
- So erscheinen nur die tatsaechlich dem Gebaeude zugeordneten WEG-Eigentuemer

---

## Betroffene Dateien

### Geaendert
| Datei | Aenderung |
|-------|----------|
| `src/pages/Files.tsx` | Komplett umgebaut: Toolbar mit Einstellungen, Kachel-Layout, Drag-and-Drop-Logik, Dateien pro Kachel laden |
| `src/components/files/FileList.tsx` | Wird zu einer kompakten Inline-Liste (ohne eigene Suche), die innerhalb einer Kachel gerendert wird |

### Bleibt unveraendert
| Datei | Grund |
|-------|-------|
| `src/components/files/FileCategoryManager.tsx` | Bleibt als erweiterte Verwaltung per Sheet erhalten |
| `src/components/files/FileUploadDialog.tsx` | Wird nicht mehr von Files.tsx genutzt, aber bleibt fuer moegliche andere Verwendung |
| Tenant/WEG-Owner Files-Seiten | Nicht betroffen |

### Neue Komponente
| Datei | Beschreibung |
|-------|-------------|
| `src/components/files/FileDropCard.tsx` | Wiederverwendbare Drag-and-Drop-Kachel mit Datei-Upload-Logik, Dateiliste, visuellem Drop-Feedback |

---

## Technische Details

### Drag-and-Drop Upload-Ablauf
1. Nutzer waehlt Gebaeude und optional Kategorie/Sichtbarkeit in der Toolbar
2. Nutzer zieht Datei auf eine Kachel (Gebaeude oder Person)
3. `onDrop` wird ausgeloest mit der `File` aus dem `DataTransfer`
4. Upload-Funktion wird aufgerufen mit:
   - `building_id` = ausgewaehltes Gebaeude
   - `assigned_user_id` = Person der Kachel (oder null fuer Gebaeude-Kachel)
   - `category_id` = aus Toolbar
   - `visible_to_users` = aus Toolbar
   - `description` = aus Toolbar
   - `management_mode` = aktueller Modus
5. Datei wird in Supabase Storage hochgeladen, Eintrag in `building_files` erstellt
6. OCR-Verarbeitung wird im Hintergrund gestartet (wie bisher)
7. Kachel zeigt die neue Datei sofort an

### Inline-Kategorie-Erstellung
- Popover neben dem Kategorie-Dropdown
- Einfaches Formular: Name + Farbe
- Nach Erstellung wird die neue Kategorie automatisch ausgewaehlt

