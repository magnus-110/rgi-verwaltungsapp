## Ziel

1. Eigene Verteilerschlüssel, die in einem Gebäude angelegt werden, sollen **nur in diesem Gebäude** sichtbar/auswählbar sein (heute lecken sie global, weil sie aus `contact_building_shares` ohne Gebäude-Filter geladen werden).
2. Im Kontenrahmen sollen pro Gebäude **alle Standard-Schlüssel + alle in diesem Gebäude angelegten Custom-Schlüssel** auswählbar sein – auch wenn noch keine Person damit verknüpft ist – und die Verteilung über `default_distribution_key` / `building_account_overrides` läuft dann sauber über diesen Schlüssel.

## Aktueller Stand (Befund)

- `src/components/contacts/BuildingContactsList.tsx` (Z. 282-293) lädt Custom-Share-Types **global** (`supabase.from("contact_building_shares").select("share_type")` ohne Building-Filter) → Schlüssel aus Gebäude A erscheinen im Dropdown von Gebäude B.
- `useBuildingShareTypes(buildingId)` (src/hooks/useBuildingShareTypes.ts) filtert zwar per Building, kennt aber **nur** Schlüssel, die bereits in `contact_building_shares` für eine Person verwendet werden. Frisch angelegte, noch ungenutzte Custom-Schlüssel fehlen → Kontenrahmen-Dropdown (ChartOfAccountsTab, BuildingDistributionKeysTab) zeigt sie nicht.
- Es existiert keine Katalog-Tabelle für Custom-Schlüssel.

## Plan

### 1) Neue Katalog-Tabelle `building_share_types`

Migration:
- Spalten: `id`, `building_id` (FK → buildings, ON DELETE CASCADE), `value` (text), `label` (text), `created_at`, `updated_at`.
- Unique-Constraint `(building_id, lower(value))`.
- GRANT SELECT/INSERT/UPDATE/DELETE für `authenticated`, ALL für `service_role`.
- RLS aktiv: Lesen für authentifizierte Nutzer mit Zugriff aufs Gebäude (analog zu `building_account_overrides` / `contact_building_shares` Policies), Schreiben für Admins/Manager.
- Backfill: Für jedes `(building_id, share_type)` aus `contact_building_shares` (joined über `contact_building_assignments`), das **nicht** in der globalen `SHARE_TYPES`-Liste enthalten ist, einen Eintrag in `building_share_types` anlegen, damit bestehende Custom-Keys nicht verloren gehen.

### 2) Hook `useBuildingShareTypes` umstellen

`src/hooks/useBuildingShareTypes.ts`:
- Mit `buildingId`: Zusammenführen aus
  a) **Allen** globalen `SHARE_TYPES`,
  b) `building_share_types` für dieses Gebäude,
  c) zusätzlich (Fallback) tatsächlich in `contact_building_shares` dieses Gebäudes verwendete Werte, falls sie noch nicht im Katalog stehen.
- Duplikate (case-insensitive) entfernen, Standardreihenfolge zuerst, Custom danach alphabetisch.
- Ohne `buildingId`: weiterhin nur globale `SHARE_TYPES`.

### 3) `BuildingContactsList` auf gebäude-scoped umstellen

`src/components/contacts/BuildingContactsList.tsx`:
- Query `customShareTypes` ersetzen: aus `building_share_types` für `buildingId` laden (statt globalem Select).
- "+ Hinzufügen"-Flow (Z. 1026 / 1108 und der Edit/Save-Pfad in der Nähe von Z. 477-513): beim Bestätigen einen Eintrag in `building_share_types` einfügen (`{ building_id: buildingId, value, label: value }`), zusätzlich – wie heute – den eingegebenen Wert im jeweiligen `contact_building_shares`-Datensatz speichern. Bei Rename/Delete des Custom-Typs den Katalog-Eintrag mitpflegen (Edit = UPDATE row + Update aller existierenden `contact_building_shares` mit altem `value`; Delete = nur erlauben, wenn keine Person den Key noch nutzt, sonst Toast).
- Query-Invalidation: nach Mutation `["building-share-types", buildingId]` und `["custom-share-types", …]` invalidieren.

### 4) `useCustomShareTypes` deprecaten / scopen

`src/hooks/useCustomShareTypes.ts` wird heute nur in `DistributionKeysTab.tsx` (globaler Finance-Tab) verwendet und ist dort schon mit `selectedBuilding` parametrisiert. Implementation auf den neuen Katalog umstellen: liest `building_share_types` für die gewählte Liegenschaft (statt aus `contact_building_shares`). Verhalten bleibt identisch.

### 5) Keine UI-Änderungen in den Kontenrahmen-Komponenten nötig

`ChartOfAccountsTab.tsx` und `BuildingDistributionKeysTab.tsx` nutzen bereits `useBuildingShareTypes(buildingId)` und übernehmen damit automatisch die neue, vollständige Liste (Standard + Custom des Gebäudes). Eintrag im Konto-Dropdown speichert wie gehabt in `chart_of_accounts.default_distribution_key` bzw. `building_account_overrides.distribution_key`; die Verteil-Logik in `buildBillingPayload` etc. nutzt diesen String unverändert.

### Out of scope

- Keine Änderung an Buchungslogik, Settlement-Berechnung, MEA-Defaults.
- Kein UI-Refactoring des Personen-Tabs über die Mutationen hinaus.
