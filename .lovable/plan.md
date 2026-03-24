

# Plan: Kontenanzeige-Logik + Suchfunktion

## Zusammenfassung

Drei Aenderungen:
1. **Gebaude-Verteilerschluessel-Tab** (`BuildingDistributionKeysTab`): Suchfeld hinzufuegen
2. **Finanzseite Kontenrahmen** (`ChartOfAccountsTab`): Gebaude-Auswahl + Suchfeld hinzufuegen, Query dynamisch machen
3. **Finanzseite Verteilerschluessel** (`DistributionKeysTab`): Query um building-spezifische Konten erweitern bei Gebaeudeauswahl + Suchfeld

## Aenderungen

### 1. `BuildingDistributionKeysTab.tsx`
- Neuer State `searchTerm`
- `Input` mit Search-Icon unterhalb des Headers ("Konto suchen...")
- Filter: `accounts.filter(a => a.account_number.toLowerCase().includes(term) || a.account_name.toLowerCase().includes(term))`
- Kategorien ohne Treffer ausblenden

### 2. `ChartOfAccountsTab.tsx`
- Neuer State `selectedBuilding` + `searchTerm`
- Gebaude-Dropdown (wie in `DistributionKeysTab`) oberhalb der Tabelle, mit Option "Alle (global)" als Default
- **Query aendern**: `queryKey` inkl. `selectedBuilding`. Wenn kein Gebaeude: `.is("building_id", null)` (wie bisher). Wenn Gebaeude ausgewaehlt: `.eq("building_id", selectedBuilding)` (nur building-spezifische Konten)
- Suchfeld wie oben
- Buildings-Query hinzufuegen (gleich wie in DistributionKeysTab)

### 3. `DistributionKeysTab.tsx`
- Neuer State `searchTerm`
- Suchfeld hinzufuegen
- **Query aendern**: Wenn Gebaeude ausgewaehlt, `.or(building_id.is.null,building_id.eq.${selectedBuilding})` statt nur `.is("building_id", null)`. QueryKey um selectedBuilding erweitern.
- Kategorien ohne Suchtreffer ausblenden

## Dateien

| Datei | Aenderung |
|---|---|
| `src/components/finance/BuildingDistributionKeysTab.tsx` | Suchfeld |
| `src/components/finance/ChartOfAccountsTab.tsx` | Gebaude-Dropdown, dynamische Query, Suchfeld |
| `src/components/finance/DistributionKeysTab.tsx` | Query mit building-spezifischen Konten, Suchfeld |

