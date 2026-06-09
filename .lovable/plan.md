## 1) Jahreszyklus wird beim Eigentümer nicht synchronisiert

### Ursache
`OwnerAnnualCycleWidget` liest direkt aus `annual_cycle_tasks` (gleiche Tabelle wie der Admin). Die RLS-SELECT-Policy nutzt `user_can_access_building(auth.uid(), building_id)`. Diese Funktion erlaubt nur:
- Admins (`user_has_admin_access`)
- Hausverwalter (`building_managers`)

WEG-Eigentümer (Verknüpfung über `weg_owner_buildings`) sind nicht enthalten. Daher liefert das Query beim Eigentümer immer 0 Zeilen — die Kacheln bleiben grau, egal was der Admin setzt.

### Fix
Migration: SELECT-Policy auf `annual_cycle_tasks` erweitern, sodass auch WEG-Eigentümer ihre Gebäude lesen dürfen (read-only; Update/Delete/Insert bleiben Admin/Manager). Umsetzung über eine kleine Helper-Function `user_can_view_building_cycle(uid, building_id)` (SECURITY DEFINER), die zusätzlich `EXISTS (SELECT 1 FROM weg_owner_buildings wob JOIN weg_owners wo ON wo.id = wob.weg_owner_id WHERE wob.building_id = _building_id AND wo.user_id = _uid)` prüft. Anschließend `DROP POLICY annual_cycle_select` und neu mit der Helper-Funktion anlegen.

Damit zeigt das Owner-Widget exakt denselben Status wie der Admin.

## 2) Dokumente-Seite des Eigentümers: Ordner-Cards + Wirtschaftsjahr-Filter

Datei: `src/pages/weg-owner/Files.tsx`

### Änderungen
- **Ordner-Cards statt flacher Gruppen-Überschriften**: Einstiegsansicht zeigt pro Tab (Persönlich / Gebäude) ein Grid aus Karten — eine Karte je Kategorie mit Icon/Farbe (aus `building_file_categories`), Name und Dateianzahl. Klick auf Karte → Drill-down in die Dateiliste dieser Kategorie (mit „Zurück"-Button). Mobil 1 Spalte, Desktop 2–3 Spalten.
- **Nur belegte Ordner anzeigen**: Karten werden nur gerendert, wenn `files.filter(f => f.category_id === cat.id).length > 0`. „Ohne Kategorie" nur, wenn solche Dateien existieren.
- **Wirtschaftsjahr-Filter**: Select oben (neben Suche). Optionen werden dynamisch aus den geladenen Dateien gebildet (`building_files.fiscal_year`, distinct, absteigend) plus „Alle Jahre" und „Ohne Jahr". Filter wirkt vor der Gruppierung, sodass leere Ordner für das gewählte Jahr automatisch verschwinden.
- Sucheingabe bleibt; sie filtert weiterhin über `display_name` und wirkt zusätzlich zum Jahresfilter.
- Hierarchie der Kategorien (`parent_id`): vorerst flach lassen wie heute (alle Kategorien als Karten). Falls gewünscht, in einem Folgeschritt Top-Level-Karten mit Aufklappen der Unterordner — bitte bei Bedarf bestätigen.

### Technische Hinweise
- `building_files.fiscal_year` existiert bereits → keine DB-Änderung nötig.
- `building_file_categories` liefert `icon`, `color`, `name` für die Card-Darstellung.
- Drill-down rein clientseitig per Local-State (`selectedCategoryId`), keine zusätzlichen Queries.
- Keine Änderung an Sichtbarkeits-/RLS-Regeln der Dateien.

## Reihenfolge
1. Migration für `annual_cycle_tasks`-SELECT-Policy (Owner-Sync).
2. Refactor `src/pages/weg-owner/Files.tsx` (Cards, Jahresfilter, Empty-Folder-Hide).
