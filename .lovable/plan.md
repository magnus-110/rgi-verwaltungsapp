

# Plan: Konto/Vorlage-Checkbox pro Kostenkategorie

## Aenderung

Aktuell wird `ensureAccountAndTemplate` nur fuer "Hausgeld" automatisch aufgerufen. Stattdessen soll bei **jeder** Kostenkategorie eine Checkbox erscheinen, mit der der Nutzer entscheiden kann, ob Konto + Vorlage angelegt werden sollen.

## UI-Aenderung in `BuildingContactsList.tsx`

In der Kosten-Zeile (Zeilen 586-620) wird **rechts neben dem Intervall-Dropdown** eine Checkbox mit Tooltip hinzugefuegt:
- Checkbox-Label: kleines Icon (z.B. Konto-Symbol) oder kurzer Text "Konto + Vorlage"
- Beim Aktivieren der Checkbox wird `ensureAccountAndTemplate` aufgerufen (mit dem aktuellen `cost_type` statt nur "Hausgeld")
- Die Checkbox ist rein als Trigger gedacht (kein persistenter State noetig, da sie einmalig Konto/Vorlage erstellt)

## Logik-Aenderung in `ensureAccountAndTemplate`

- Die Pruefung `if (costType !== "Hausgeld" || amount <= 0) return;` wird entfernt
- Nur noch `if (amount <= 0) return;` bleibt
- Kontoname wird dynamisch: `"{costType} {lastName}"` (z.B. "Miete Mueller", "Stellplatz Schmidt")
- Vorlagenname wird: `"mtl. {costType} {unitNumber} {floorLocation}"` (z.B. "mtl. Miete 0001 EG rechts")

## Auto-Trigger entfernen

Der automatische Aufruf in `updateCost` (Zeilen 279-286) wird entfernt. Stattdessen wird Konto/Vorlage **nur** ueber die Checkbox erstellt - bewusste Entscheidung des Nutzers.

## Dateien

| Datei | Aenderung |
|---|---|
| `src/components/contacts/BuildingContactsList.tsx` | Checkbox pro Kostenzeile, `ensureAccountAndTemplate` generisch machen, Auto-Trigger entfernen |

