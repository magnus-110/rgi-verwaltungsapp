Ich habe den Fehler tief geprüft. Die Ursache ist nicht, dass „Stellplätze“ fehlt. Der Schlüssel ist korrekt bei den Personen hinterlegt und im gebäudespezifischen Kontenrahmen gespeichert.

Befund für Adolf-Haff-Weg 3:
- Gebäude hat 8 Einheiten.
- Anteil „stellplaetze“ existiert bei den Personen: Summe 9 Stellplätze.
- Im gebäudespezifischen Kontenrahmen ist Konto 1501 „Verwaltervergütung TG“ korrekt auf „stellplaetze“ überschrieben.
- Im bestehenden Wirtschaftsplan-Item zu Konto 1501 steht aber noch der alte gespeicherte Wert „einheiten“.

Warum es weiterhin „Einheiten“ zeigt:
- `ManualEconomicPlanEditor` baut die Zeilen aktuell so:
  - Wenn ein `economic_plan_items.distribution_key` existiert, wird dieser angezeigt.
  - Erst wenn dort nichts steht, wird der aktuelle gebäudespezifische Override aus `building_account_overrides` verwendet.
- Bei Konto 1501 existiert ein altes `economic_plan_items.distribution_key = 'einheiten'`.
- Deshalb gewinnt der veraltete Plan-Item-Wert über den aktuellen Kontenrahmen-Override „stellplaetze“.

Zusätzlich gefunden:
- Konto 1500 hat im Override „einheit“, im Plan-Item aber noch „einheiten“. Das ist nur ein Alias-/Normalisierungsproblem, wirkt optisch ähnlich.
- Andere echte Anteilsschlüssel bei Adolf-Haff-Weg sind vorhanden und berechenbar: `mea`, `Whg.-MEA`, `Gar.-MEA`, `Sonder-MEA`, `stellplaetze`, `einheit`, `qm`/Fläche im aktuellen Code nur über `area_sqm_override` statt über den gespeicherten Anteil `qm`.
- Einige Standard-Schlüssel aus der Dropdown-Liste haben bei Adolf-Haff-Weg keine hinterlegten Anteile (`garagen`, `wasser`, `warmwasser`, `heizkosten` usw.). Wenn man sie auswählt, kann die Berechnung aktuell auf MEA zurückfallen oder 0 ergeben. Das sollte nicht still passieren.

Plan zur Korrektur:

1. Wirtschaftsplan-Zeilen auf den aktuellen Kontenrahmen synchronisieren
- In `ManualEconomicPlanEditor.tsx` die Priorität ändern:
  - Gebaüdespezifischer Override aus `building_account_overrides` hat Vorrang.
  - Danach `chart_of_accounts.default_distribution_key`.
  - Nur wenn beides fehlt, vorhandenes Plan-Item / Fallback.
- Damit zeigt Konto 1501 sofort „Stellplätze“, obwohl im alten Plan-Item noch „einheiten“ steht.

2. Bestehende Plan-Items beim Speichern/Öffnen nicht mehr veralten lassen
- Beim Speichern eines Planbetrags nicht nur `planned_amount`, sondern auch den aktuell effektiven `distribution_key` speichern.
- Optional beim Laden/Rendern intern den effektiven Schlüssel verwenden, damit alte Daten nicht mehr die UI blockieren.
- Dadurch wird der bestehende Plan für Adolf-Haff-Weg automatisch wieder konsistent, sobald gespeichert wird.

3. Gebaüdespezifischen Kontenrahmen vollständig berücksichtigen
- Für globale Konten: `building_account_overrides` verwenden.
- Für eigene Gebäude-Konten (`chart_of_accounts.building_id = buildingId`): direkt `default_distribution_key` verwenden.
- Sicherstellen, dass beide Fälle im Wirtschaftsplan gleich behandelt werden.

4. Schlüssel-Normalisierung zentral machen
- Eine gemeinsame Normalisierung für `einheit`/`einheiten`, Heizkosten-Aliase und Anteilsschlüssel verwenden.
- Anzeige und Berechnung sollen denselben normalisierten Wert nutzen.
- Dadurch werden Alias-Unterschiede nicht mehr als echte Abweichung behandelt.

5. Anteil-Berechnung für alle vorhandenen Share Types absichern
- `shareTotals` soll alle `contact_building_shares.share_type` generisch summieren.
- Für `qm` soll geprüft werden: zuerst gespeicherter Anteil `qm`, sonst `area_sqm_override` als Fallback.
- Für `stellplaetze`, `Whg.-MEA`, `Gar.-MEA`, `Sonder-MEA` etc. wird exakt der passende Anteil verwendet, nicht MEA.

6. Kein stiller Fallback auf MEA bei fehlendem Anteil
- Wenn ein ausgewählter Schlüssel im Gebäude keine Anteile hat, soll die Berechnung nicht heimlich auf MEA umlegen.
- Stattdessen: Anteil 0 bzw. Warnhinweis in der Zeile, damit falsche Umlagen sichtbar werden.
- Beispiel: Wenn „wasser“ ausgewählt ist, aber keine Wasser-Anteile existieren, muss das auffallen.

7. Auch den KI-/Vorjahres-Generator anpassen
- `supabase/functions/generate-economic-plan/index.ts` nutzt aktuell nur `chart_of_accounts.default_distribution_key` und ignoriert gebäudespezifische Overrides.
- Das wird angepasst, damit aus Vorjahr generierte Wirtschaftspläne ebenfalls den gebäudespezifischen Kontenrahmen übernehmen.

8. Kurze Datenprüfung nach Umsetzung
- Für Adolf-Haff-Weg prüfen:
  - Konto 1501 zeigt „Stellplätze“.
  - Gesamtanteil ist 9, nicht 8 oder 16.
  - Einzelanteil pro Eigentümer entspricht dem hinterlegten Stellplatz-Anteil.
  - Konto 1500 bleibt „Einheiten“ mit 8 Einheiten.
- Zusätzlich prüfen, dass vorhandene Custom-Anteile wie `Whg.-MEA`, `Gar.-MEA`, `Sonder-MEA` berechenbar bleiben.