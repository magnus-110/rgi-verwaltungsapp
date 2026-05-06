## Problem

Im Kassenprüfungs-Kontenblatt (Adolf-Haff-Weg 3) zeigen die Badges am Personenkonto irreführende Werte:

1. **„Soll WP"** wird aus `booking_templates.expected_amount` berechnet — auch wenn für das Jahr **gar kein Wirtschaftsplan** existiert.
2. **„Haben: 949,58 €"** zeigt nur die positiv gebuchten Zugänge auf dem Personenkonto. Das tatsächlich gezahlte Hausgeld (12 × 370 € = 4.440 €) steckt aber in den Abgängen / im Saldo (-4.440 €). Die Badge bildet damit nicht die geleisteten Hausgeldzahlungen ab.

## Lösung

### 1. „Soll WP" nur aus echtem Wirtschaftsplan
- In `CashAuditAccountSheet.tsx` neue Query gegen `economic_plans` (Tabelle prüfen — vermutlich `economic_plans` + `economic_plan_items` o.ä.) für `building_id` + `fiscal_year`.
- Wenn **kein veröffentlichter Wirtschaftsplan** vorhanden → Badges „Soll WP", „Haben", „Δ" komplett **ausblenden**.
- Wenn vorhanden → `Soll WP` aus dem Einzelwirtschaftsplan-Eintrag des jeweiligen Personenkontos (Jahres-Vorschuss-Soll) ziehen, nicht mehr aus `booking_templates`.

### 2. „Haben" = tatsächlich gezahltes Hausgeld
Aktuell: `haben = totalZugang` (nur positive Beträge auf der Hauptkonto-Seite).

Neu: **`haben` = Summe aller Hausgeldzahlungen** auf dem Personenkonto, unabhängig von der Soll/Haben-Richtung der Buchung.
- Konvention: Hausgeld-Zahlungen reduzieren den offenen Saldo des Personenkontos. In der bestehenden Logik landen sie als `abgang` (Saldo wird negativer = mehr „bezahlt").
- Praktischer Ansatz: `haben = totalAbgang` (bzw. präziser: alle Buchungen mit Gegenkonto Bank `1800`, die Zahlungseingänge sind).
- Fallback / sauber: über Gegenkonto-Filter `counter_account_id = Bank-Konto (1800)` summieren — das sind eindeutig die Hausgeldzahlungen.

### 3. Δ-Berechnung anpassen
- `diff = haben − soll`
- Bei Soll 4.230 € und Haben 4.440 € → Δ = +210 € (grün, Überzahlung) statt aktuell −3.280 €.

## Technische Details

**Datei:** `src/components/finance/CashAuditAccountSheet.tsx`

- Neue Query `useQuery(["audit-economic-plan", buildingId, fiscalYear])` → liefert pro Personenkonto den Soll-Vorschuss; bei `null/empty` Badges nicht rendern.
- `sollByAccount` aus `templates` **entfernen** (oder als reiner Fallback streichen — User-Wahl: streichen).
- `haben`-Berechnung umstellen: in der `rows.map`-Schleife eine zusätzliche Summe `paidByBank` führen, die nur Buchungen zählt, deren Gegenkonto die Bank ist.
- Token-Mode: ggf. neue RPC `get_audit_economic_plan_by_token` analog zu `get_audit_templates_by_token`.

## Offene Annahmen (vor Umsetzung kurz prüfen)

- Tabellenname & Felder des Wirtschaftsplans (vermutlich `economic_plans` + `economic_plan_items` mit `account_id` + `annual_amount`).
- Bank-Konto-Nummer: ist `1800` projektweit fix oder dynamisch (z. B. `is_bank_account` Flag im COA)?
