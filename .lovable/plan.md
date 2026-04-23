

## Plan: Abrechnung an HV-Office-Standard angleichen — generisch für alle Liegenschaften

Ziel: Einzel- und Gesamtabrechnung strukturell und rechnerisch identisch zu HV Office — als **allgemeingültige Logik** für alle Liegenschaften, nicht als Sonderregel.

### Was geändert wird

**A) Einzelabrechnung-Layout an HV Office angleichen** (`BillingSettlement.tsx`)

Neue Block-Reihenfolge analog HV Office:
```text
1. Einnahmen (Vorauszahlungen + Zinsen)
2. Umlagefähige Bewirtschaftungskosten
3. Nicht umlagefähige Kosten
4. Heizkosten (Konto 1400 nach Brunata)
5. Instandhaltungsrücklage (Zuführung + Entnahme als Doppelbuchung)
6. Abrechnungssumme → Vorschussverpflichtung → Abrechnungsspitze
```

Trennung „verteilungsrelevant" vs. „nachrichtlich" wird visuell klar (Badge oder zweite Spalte).

**B) Abrechnungsspitze korrekt berechnen** (`BillingSettlement.tsx`, Zeile 385)

Aktuell fließt `totalAccrual` in die Abrechnungssumme. HV Office macht das nicht. Neu:
- `abrechnungssumme = totalOperatingDist + totalOperatingNonDist + totalReserve − totalReserveWithdrawal`
- `totalAccrual` wird **nachrichtlich** ausgewiesen, nicht mehr verteilt.

Generisch: Abgrenzungen sind per Definition jahresübergreifend und gehören in keiner Liegenschaft in die Abrechnungssumme.

**C) Rücklagen-Doppelbuchung nach HV-Office-Schema**

Aufwände auf rücklagenfinanzierten Konten (`is_reserve_funded=true`, z. B. 1920) erscheinen:
1. einmal als Aufwand im Block „Umlagefähige Kosten" (informativ),
2. einmal als negative Gegenbuchung „Entnahme aus Rücklage" → neutralisiert den Cashflow.

Funktioniert für jede Liegenschaft, da das Flag `is_reserve_funded` bereits existiert.

**D) Heizkosten-Verteilung ohne MEA-Fallback** (`BillingSettlement.tsx`, ~Zeile 493)

Für Konto 1400 (jedes Konto mit `settlement_section='heating'` bzw. `is_heating_relevant=true`) wird **strikt** der Brunata-Verteilungsschlüssel aus `brunata_allocations` verwendet. Wenn Brunata-Werte fehlen → **harte Warnung** + roter Status in der Abrechnung statt stillem MEA-Fallback. Das verhindert falsche Heizkostenverteilungen in jeder zukünftigen Abrechnung.

**E) Brennstoffbestand im Vermögensbericht ergänzen** (`AssetReportSection.tsx`)

Statt in der Abrechnung wird der Brennstoffblock im Vermögensbericht ausgebaut — dort gehört er hin (Bestandsausweis):
- Anfangsbestand (Menge + Wert)
- Einkäufe im WJ
- Endbestand (Menge + Wert)
- berechneter Verbrauch
Quelle: `fuel_inventory`. Liegenschaften ohne Brennstoffeinträge zeigen den Block nicht.

### Generische Funktionsweise (deine Hauptfrage)

Alle Änderungen basieren auf **bereits existierenden Datenfeldern**, nicht auf hardcodierten Konto-IDs oder Liegenschafts-IDs:

| Feld | Quelle | Wirkung |
|---|---|---|
| `chart_of_accounts.settlement_section` | global | Blockzuordnung |
| `chart_of_accounts.is_reserve_funded` | global | Doppelbuchung Rücklage |
| `chart_of_accounts.is_heating_relevant` | global | Brunata-Verteilung |
| `brunata_allocations` | pro Liegenschaft + WJ | Heizkosten-Schlüssel |
| `fuel_inventory` | pro Liegenschaft + WJ | Vermögensbericht-Block |

→ Bei neuer Liegenschaft genügt der bestehende 4-Schritt-Workflow (Grundlagen → Buchungen → Heizkosten/Brunata → Abrechnung). Die Abrechnung funktioniert automatisch korrekt wie bei Birkenweg 6.

### Reihenfolge der Umsetzung

1. Logikfix `abrechnungssumme` ohne Accruals (Punkt B) — kleinste Änderung, größte Wirkung
2. Heizkosten strikt Brunata, kein MEA-Fallback (Punkt D)
3. Rücklagen-Doppelbuchung im Layout (Punkt C)
4. Layout-Umbau Einzelabrechnung in HV-Office-Reihenfolge (Punkt A)
5. Brennstoffbestand-Ausbau im Vermögensbericht (Punkt E)

### Was du danach tun musst

Nichts liegenschaftsspezifisch. Reine Logikänderungen am gemeinsamen Code — wirken sofort für alle Liegenschaften.

