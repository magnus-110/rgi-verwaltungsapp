## Problem

In der neuen WEG 14 werden nur 15 statt 22 Einzelabrechnungen im DMS/ZIP abgelegt. Ursache: Eigentümer mit mehreren Einheiten (z. B. Wohnung + Garage) erhalten pro Einheit ein PDF, aber die Dateinamen enthalten nur den Eigentümernamen — dadurch überschreiben sich Wohnungs- und Garagenabrechnung im DMS bzw. ZIP gegenseitig, und pro Eigentümer bleibt nur die zuletzt geschriebene Datei übrig (meist die Garage).

Die Edge Function ist bereits deployt und verarbeitet die 22 Einheiten korrekt — nur das Frontend produziert kollidierende Dateinamen.

## Fix

In `src/components/finance/BillingSettlement.tsx` die Einheitennummer (`unit_number` aus `contact_building_assignments`) in Anzeigename, Dateiname und Job-Item übernehmen — exakt so wie in der hochgeladenen Referenz-Datei. Drei Stellen sind betroffen:

1. **DMS-Queue Einzelabrechnungen (~Zeile 1197–1211):** `unit_number` aus dem Assignment lesen und in `displayName` (`Einzelabrechnung_{jahr}_{name}_{einheit}`) sowie im `items[0]` als `unitNumber` mitgeben.

2. **ZIP-Download „Alle Dokumente" (~Zeile 1241–1246):** `fileBase` um die sanitisierte Einheitennummer erweitern (`Abrechnung_{jahr}_{name}_{einheit}`) und `unitNumber` ins Item aufnehmen. `ownerResults` bereits pro Assignment vorhanden — dort `unitNumber` mitführen.

3. **Sammelbericht-Queue (~Zeile 1433–1468):** `unit_number` aus dem Assignment ableiten, in das Item aufnehmen und in `displayName` (`Sammelbericht_{jahr}_{name}_{einheit}`) verwenden.

Reine Presentation-/Naming-Änderung — keine Business-Logik, keine Payload-Änderungen, keine Edge-Function-Änderungen.

## Ergebnis

Alle 22 Einheiten der WEG 14 erhalten eigene, eindeutig benannte PDFs im DMS und im ZIP. Eigentümer mit Wohnung + Garage bekommen beide Dokumente statt nur der zuletzt geschriebenen.