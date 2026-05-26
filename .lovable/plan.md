## Änderungen am Schlüssel-Modul

### 1. Bug: „Anhänger bearbeiten" öffnet erst nach Zurück
**Ursache:** In `BuildingKeysTab.tsx` gibt es bei `detailTag` einen Early-Return (`return <KeyTagDetail … />`). Der `<KeyTagDialog>` wird darunter im Haupt-Render gerendert und ist deshalb nicht im DOM, solange die Detail-Ansicht aktiv ist. `onEdit` setzt zwar `tagDialog.open = true`, aber der Dialog existiert nicht — er erscheint erst, sobald man auf „Zurück" klickt und der Haupt-Render greift.

**Fix:** Den Early-Return entfernen und die Detail-Ansicht bedingt **innerhalb** des Haupt-Renders zeigen, sodass `<KeyTagDialog>` immer mountet. Alternativ: Edit-Aktion aus der Detail-Ansicht erst `setDetailTag(null)` aufrufen und danach `setTagDialog`. Wir wählen Variante 1 (Dialog immer gemountet) — robuster.

### 2. Tab-Aufteilung in der BuildingKeysTab
Statt einer langen Seite mit drei gestapelten Cards (Stammdaten + Anhänger + Verlauf) bekommen wir interne Tabs:

- **Tab „Anhänger"** — Stammdaten-Card (Liegenschaftsnummer + Schließplan) + Anhängerliste
- **Tab „Verlauf"** — Filter (Anhänger / Event-Typ) + chronologische Event-Liste

Implementierung mit dem bestehenden `Tabs`-Component (`@/components/ui/tabs`).

### 3. Liegenschaftsnummer automatisch generieren (001, 002, …)
Aktuell ist `property_number` ein manuelles Pflichtfeld. Stattdessen:

- **DB-Migration:** Trigger `BEFORE INSERT` auf `key_property_settings`, der bei leerem `property_number` automatisch die nächste freie 3-stellige Nummer berechnet:
  ```
  SELECT lpad((COALESCE(MAX(property_number::int), 0) + 1)::text, 3, '0')
  FROM key_property_settings
  WHERE property_number ~ '^[0-9]+$';
  ```
- **Auto-Initialisierung im UI:** Beim ersten Öffnen der Schlüssel-Tab eines Gebäudes ohne Settings-Zeile wird automatisch eine Zeile angelegt (Insert mit nur `building_id`) → Trigger vergibt die Nummer.
- **UI-Feld** wird auf „read-only" gestellt (man sieht die Nummer, kann sie aber nicht mehr editieren). Editieren bei Altbestand-Migration kann später ergänzt werden.

### 4. Anhänger als Liste mit Schlüsseln drunter
Statt 3-Spalten-Card-Grid mit Klick auf Detail-Ansicht:

- Liste in Reihen (eine Card pro Anhänger), volle Breite.
- Pro Reihe links: Farbstreifen + Anhängernummer + Typ + Foto-Thumb (klein) + Leih-Badge.
- Rechts: Aktionen (`Ausgeben` / `Zurück` / `Verloren`, `Bearbeiten`, `Löschen`).
- **Darunter direkt eingebettet:** Sub-Liste der zugeordneten Schlüssel (Typ, Nummer, Hersteller, Notiz, Löschen) + „+ Schlüssel"-Button.
- Klick auf den Anhänger ist nicht mehr nötig; die Detail-Seite (`KeyTagDetail.tsx`) wird obsolet und entfernt. Schlüssel-Hinzufügen-Form (die in `KeyTagDetail.tsx` steckt) wandert als kollabierbares Inline-Form in die neue Listen-Card.

```
┌────────────────────────────────────────────────────────────┐
│ ▌1/001-01G   Generalschlüssel    [Verliehen bis 30.05.]   │
│              📷                                            │
│              [Ausgeben] [Bearbeiten] [Löschen]            │
│   ─ Schlüssel (2) ───────────────────────  + Schlüssel    │
│   • Wohnungstür · Nr. 4711 · KESO · "Kopie"        🗑     │
│   • Briefkasten · Nr. 0815 · BKS                   🗑     │
└────────────────────────────────────────────────────────────┘
```

### 5. Aufräumarbeiten
- `KeyTagDetail.tsx` wird gelöscht.
- `BuildingKeysTab.tsx` enthält jetzt: Tabs, neue `TagListRow`-Sub-Komponente (inkl. Inline-Schlüssel-Liste + Add-Form), unveränderte Dialoge (`KeyTagDialog`, `KeyLoanDialog`).

---

## Technische Notizen

- Keine neuen Tabellen/Spalten nötig (nur 1 Trigger auf `key_property_settings`).
- Cache-Invalidation: `["key-tags", buildingId]`, `["keys", tagId]`, `["key-events", buildingId]`, `["key-settings", buildingId]`, `["outstanding-keys"]` (Dashboard-Widget).
- Bestehende Dialoge (`KeyTagDialog`, `KeyLoanDialog`) bleiben unverändert.

## Betroffene Dateien

- `src/components/buildings/keys/BuildingKeysTab.tsx` (Refactor: Tabs + Listen-Ansicht + Bugfix)
- `src/components/buildings/keys/KeyTagDetail.tsx` (löschen, Inline-Add-Form übernehmen)
- Neue Supabase-Migration für `auto_property_number`-Trigger
