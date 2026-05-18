## Ziel

Zwei Probleme im Adolf-Haff-Weg-Kontenrahmen beheben:

1. **Verteilerschlüssel-Dropdown im Kontenrahmen** zeigt aktuell *alle* Standard-Schlüssel + nur die Custom-Schlüssel der Liegenschaft. Es soll exakt die Liste der **im Gebäude tatsächlich gepflegten Anteile** zeigen (Standard *und* Custom). Im globalen Kontenrahmen sind nur Standard-Schlüssel erlaubt.
2. **Konto 1401 (Nutzerwechsel Heizkostenabrechnung)** ist als „Abrechnungsrelevant" markiert, taucht aber nicht in der Abrechnung auf.

---

## Teil 1 — Verteilerschlüssel synchron zu Gebäude-Anteilen

### Regel
- **Gebäude-spezifischer Kontenrahmen**: Dropdown listet exakt die `share_type`-Werte, die im jeweiligen Gebäude unter `contact_building_shares` existieren (Standard wie z. B. „mea", „qm" + Custom wie „Zwischenablesung Heizkosten").
- **Globaler Kontenrahmen (Alle / global)**: Dropdown listet nur die globalen Standard-Schlüssel aus `SHARE_TYPES`. Keine gebäudespezifischen Custom-Keys.
- Wenn ein Konto bereits einen Schlüssel hat, der nicht (mehr) in der gefilterten Liste vorkommt, wird dieser Wert zusätzlich als „(nicht im Gebäude gepflegt)" angezeigt, damit er sichtbar bleibt und korrigiert werden kann.

### Umsetzung
- `useCustomShareTypes` zu `useBuildingShareTypes(buildingId?)` umbauen: liefert künftig alle in `contact_building_shares` verwendeten `share_type` (Standard + Custom), gefiltert pro Gebäude. Für `buildingId=undefined` (globaler Tab) liefert es nur die `SHARE_TYPES`-Standardliste.
- `ChartOfAccountsTab.tsx`: `allDistKeys` aus diesem Hook bauen statt aus `DISTRIBUTION_KEYS ∪ custom`. Mapping `value → Label` über `getShareTypeLabel`. „Stale-Key"-Anzeige für vorhandene aber nicht mehr gepflegte Werte ergänzen.
- `CreateAccountInlineDialog.tsx`: dieselbe Liste verwenden (Prop `buildingId` durchreichen, falls noch nicht vorhanden).
- `ManualEconomicPlanEditor.tsx` analog auf den neuen Hook umstellen, damit Wirtschaftsplan und Kontenrahmen identische Optionen zeigen.

---

## Teil 2 — Konto 1401 erscheint nicht in der Abrechnung

### Befund aus der DB
- `1401` (building Adolf-Haff-Weg): `is_billing_relevant=true`, `is_distributable=true`, `settlement_section='operating_non_distributable'`, `default_distribution_key='mea'`.
- Eine Buchung 35,99 € am 31.12.2025 (Hauptkonto 4160 / Gegenkonto 1401), status `pending`, im Period-Range 2025-01-01 – 2025-12-31.
- Erwartung: erscheint in Sektion „Nicht umlagefähige Kosten" mit −35,99 €. Tatsächlich nicht sichtbar.

### Ursachen-Hypothesen (in dieser Reihenfolge prüfen)
1. **React-Query Cache** nach Anlegen des Kontos nicht invalidiert (`settlement-accounts` Key). → Sicherstellen, dass `invalidateAllCoa` auch diesen Key invalidiert.
2. **Section-Default greift nicht**: Beim Anlegen wurde `settlement_section` evtl. erst nachträglich gesetzt; Period-Aggregation vor dem Setzen gecached.
3. **`is_distributable=true` in `operating_non_distributable`**: Wird in `BookingReviewSection` / `BillingSettlement` evtl. doppelt klassifiziert (sowohl umlagefähig als auch nicht-umlagefähig) und durch eine spätere Dedupe-Logik verworfen. Speziell prüfen: 1401 darf nicht parallel als „heating"-Konto behandelt werden, weil Account-Number 1400–1499 in `HeatingAccountsSection` getriggert wird, aber `is_heating_relevant=false`. In `BillingSettlement.tsx` Zeile 1071 wird auf `account_number === "1400"` geprüft — 1401 ist davon nicht betroffen, also unkritisch.

### Umsetzung
- Reproduktion durch Hard-Refresh; falls dann sichtbar → React-Query Invalidation in `ChartOfAccountsTab` um `settlement-accounts`, `settlement-bookings`, `coa-aggregation` ergänzen.
- Falls weiterhin unsichtbar: zusätzliche Sektion-Auswahl-Pflicht beim Anlegen (Dialog) erzwingen + Validierung „is_distributable nur mit gepflegtem Verteilerschlüssel".
- Klarer Hint im UI: Wenn `is_billing_relevant=true` aber `settlement_section=null`, einen gelben Badge „Sektion fehlt – wird in Abrechnung ignoriert" im Kontenrahmen anzeigen.

---

## Geänderte/neue Dateien

- `src/hooks/useCustomShareTypes.ts` → umbenennen/erweitern zu `useBuildingShareTypes`
- `src/components/finance/ChartOfAccountsTab.tsx`
- `src/components/finance/CreateAccountInlineDialog.tsx`
- `src/components/finance/ManualEconomicPlanEditor.tsx`
- `src/components/finance/BillingSettlement.tsx` (nur falls Ursache 2/3 bestätigt; sonst nur Query-Invalidation)

Keine Datenbankänderungen erforderlich.