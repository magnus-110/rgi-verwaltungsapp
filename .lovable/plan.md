# Schlüsselanhänger: Fehler "duplicate key ... key_tags_tag_number_key" beheben

## Was los ist (geprüft)

- In St.-Wolfgang-Str. 6 existiert genau **ein** Anhänger: `1/047-01` (Typ Rot) mit **einem** Schlüssel. Der von Ihnen gelöschte zweite Schlüssel ist tatsächlich aus der Datenbank entfernt — dort gibt es keine Leiche.
- Die Ursache liegt in der Nummernvergabe: Die Datenbank-Funktion zählt die laufende Nummer **pro Schlüsselart** hoch (`MAX(sequence_number) ... WHERE building_id = ... AND key_type_id = ...`), die Spalte `tag_number` ist aber **global eindeutig**.
- Seit der Farb-Buchstabe (G/O/R) aus der Nummer entfernt wurde, erzeugt ein zweiter Anhänger mit **anderer** Schlüsselart im selben Gebäude wieder `1/047-01` → Unique-Verletzung, Speichern schlägt fehl.

## Lösung

Migration, die die Nummernvergabe umstellt:

- Laufende Nummer wird künftig **pro Gebäude + Lagerort** hochgezählt, nicht mehr pro Schlüsselart. Damit ist jede Anhängernummer im Gebäude eindeutig, unabhängig von der Farbe.
- Zusätzlich ein Sicherheitsnetz: Falls die berechnete Nummer wider Erwarten schon existiert, zählt die Funktion in einer Schleife weiter, bis eine freie Nummer gefunden ist (verhindert Fehler auch bei Altdaten oder parallelen Anlagen).
- Die bestehende Unique-Regel `(building_id, key_type_id, sequence_number)` wird durch `(building_id, storage_location_id, sequence_number)` ersetzt, passend zur neuen Zählweise.
- Bestehende Anhänger bleiben unverändert; ihre Nummern werden nicht neu vergeben.

## Ergebnis

Der nächste Anhänger in St.-Wolfgang-Str. 6 erhält `1/047-02` (bzw. die nächste freie Nummer im Lagerort) und lässt sich speichern — auch mit anderer Schlüsselart/Farbe.

## Technisch

- `CREATE OR REPLACE FUNCTION public.generate_key_tag_number()`: Sequenz-Ermittlung auf `building_id + storage_location_id` umstellen, danach `WHILE EXISTS (SELECT 1 FROM key_tags WHERE tag_number = ...) LOOP v_next_seq := v_next_seq + 1 END LOOP`.
- Constraint-Tausch auf `key_tags`.
- Kein Frontend-Änderungsbedarf; `KeyTagDialog.tsx` schickt weiterhin `sequence_number: 0` / `tag_number: 'TMP'`.
