## Phase 3 — Mieter-Identifikation über Zeiträume (Einzug/Auszug)

### Was bleibt unverändert
- **Keine** neue Spalte `persons_count`. Personenzahl wird wie bisher als Anteilstyp über `contact_building_shares` + `building_share_types` (Typ „Personen") gepflegt — analog zu MEA/Einheiten/qm bei der WEG.
- **Keine** neue Spalte `nk_vorauszahlung_monatlich`. NK-Vorauszahlung läuft über `contact_building_costs` mit `cost_type='Nebenkosten'`, `interval='monatlich'`, `valid_from/valid_to` — analog Hausgeld beim Eigentümer.
- **WEG-Verwaltung** bleibt unangetastet.

### Datenmodell-Änderungen
Nur ein Validierungs-Trigger auf `contact_building_assignments`:
- `valid_to >= valid_from`, wenn beide gesetzt.
- Keine überlappenden Zeiträume pro `(building_id, unit_number)` für `role_in_building='mieter'` (NULL `valid_to` = offen).
- `RAISE EXCEPTION` bei Verletzung.

### UI

**`BuildingContactsList` (Mietverwaltung, Mieter)**
- Keine neuen Felder. Einzug = `valid_from`, Auszug = `valid_to` (existieren bereits).
- NK-Vorz. wird im bestehenden Kosten-Tab gepflegt (cost_type Nebenkosten).
- Personen werden im bestehenden Anteile-Tab gepflegt (share_type Personen).

**`RentAccountingPage` — neue Sektion „Mieter im Abrechnungszeitraum {fiscal_year}"**
Read-only Tabelle, aggregiert alle `contact_building_assignments` mit `role_in_building='mieter'`, deren `[valid_from, valid_to]` sich mit dem Wirtschaftsjahr überschneiden.

Spalten:
- Mieter (Name) · Einheit · Einzug · Auszug · Monate im Zeitraum (tag-genau) · Personen (aus shares, Typ Personen) · NK-Vorz./M (gewichtete Summe aus `contact_building_costs` Nebenkosten/monatlich im Zeitraum) · **NK-Vorz. Periode** (tag-genau, 2 Dezimalen)
- Klick auf Zeile → öffnet Personen-Tab des Gebäudes mit aufgeklappter Zuordnung.

### Ausgeschlossen (spätere Phasen)
- Phase 4: Verteilung der umlagefähigen Kosten nach Verteilerschlüsseln
- Phase 5: zeit- vs. verbrauchsbasiert
- Phase 6: USt-Handling, settlement_note, PDF

### Testfälle
1. Mieter 10 Monate × 180 €/M → NK-Vorz. Periode = 1.800 €.
2. NK-Erhöhung mit Auto-Close der alten Zeile → gewichtete Periode korrekt.
3. Mieterwechsel ohne Überlappung → beide Zeilen sichtbar.
4. Überlappende Mieter-Zeiträume → Trigger wirft Fehler.
5. WEG-Gebäude bleiben unverändert.
