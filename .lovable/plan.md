

# Plan: Mehrfachzuordnung eines Kontakts zum selben Gebäude ermöglichen

## Problem
Aktuell filtert der `AssignContactDialog` bereits zugeordnete Kontakte aus der Liste (`existingContactIds`). Eigentümer mit mehreren Wohnungen im selben Gebäude können daher nicht mehrfach zugeordnet werden.

## Änderungen

### 1. AssignContactDialog.tsx
- Entferne den Filter `existingContactIds` aus der Kontaktliste — alle Kontakte bleiben wählbar
- Zeige bei bereits zugeordneten Kontakten einen Hinweis-Badge (z.B. "Bereits zugeordnet"), damit der Nutzer weiß, dass eine weitere Zuordnung erfolgt
- Behalte die `existingContactIds`-Prop für den Badge-Hinweis, aber nicht zum Ausfiltern

### 2. BuildingContactsList.tsx
- Passe die Übergabe von `existingContactIds` an — sie wird weiterhin übergeben, aber nur noch für den Hinweis im Dialog genutzt
- Keine funktionale Änderung nötig, da mehrere Assignments für denselben `contact_id` bereits von der DB unterstützt werden (kein Unique-Constraint auf `contact_id + building_id`)

### 3. ContactBuildingAssignments.tsx
- Entferne den Filter `availableBuildings` der bereits zugeordnete Gebäude ausschließt, damit ein Kontakt auch mehrfach demselben Gebäude zugeordnet werden kann

### Technische Details
- Die DB-Tabelle `contact_building_assignments` hat keinen Unique-Constraint auf `(contact_id, building_id)`, daher sind Mehrfachzuordnungen bereits möglich
- Jede Zuordnung hat eigene `unit_number`, `floor_location`, Shares und Costs — die Daten bleiben pro Assignment getrennt

