# Wirtschaftsplan 2026: Vorzeichen-Chaos beheben (7.322 € vs. 13.042 €)

## Befund (verifiziert in der Datenbank)

Der Plan Birkenweg 6 / 2026 hat 10 Positionen mit **gemischten Vorzeichen**:

```text
1010 Müll                 -380      1300 Versicherungen        +42
1011 Papiertonne           -30      1301 Gebäudeversicherung   +890
1050 Allgemeinstrom       -280      1400 Heizung/Warmwasser  +5.500
1500 Verwaltervergütung -1.930      1520 Kontogebühren        +150
1600 Instandhaltung       -240      1930 Planmäßige IHR     +3.600
```

- Vorzeichenbehaftete Summe = **7.322 €** → das zeigt die UI (und `economic_plans.total_costs`).
- Summe der Beträge ohne Vorzeichen = **13.042 €** → das erzeugt das Dokument (dort wird überall `Math.abs` verwendet).

Damit sind alle drei gemeldeten Symptome erklärt: falsche Gesamtsumme, Abweichung UI ↔ Dokument, und Positionen mal mit „−", mal mit „+". Die Einzelwirtschaftspläne sind ebenfalls betroffen, weil die Eigentümeranteile aus diesen vorzeichenbehafteten Beträgen berechnet werden — positive und negative Positionen heben sich beim Eigentümertotal gegenseitig auf.

Ursache: Beträge werden auf drei Wegen gesetzt, aber nur einer erzwingt ein Vorzeichen.
- Manuelle Eingabe → immer `-abs(Betrag)` (negativ).
- Klick auf den Vorjahreswert („Vorjahr übernehmen") → übernimmt den Vorjahres-IST **mit dessen Vorzeichen**, das je nach Buchungsrichtung positiv sein kann.
- Aufrund-Pfeil → behält das vorhandene Vorzeichen bei, verstärkt den Fehler also.

Der Tirolerstr.-Plan 2026 hat dasselbe Problem (Summe Items −26.707 vs. gespeicherte `total_costs` −25.358), Adolf-Haff-Weg 3 ist zu prüfen.

## Ziel

Eine einzige, durchgängige Konvention: **Kostenpositionen im Wirtschaftsplan werden intern negativ gespeichert und in der Oberfläche wie im Dokument als positive Beträge dargestellt.** UI-Summe und Dokumentensumme sind danach zwingend identisch (13.042 €).

## Umsetzung

1. **Eingabewege vereinheitlichen** (`ManualEconomicPlanEditor.tsx`)
   - „Vorjahr übernehmen" speichert `-abs(Vorjahreswert)`.
   - Aufrund-Pfeil (Gesamtplan und Einzelplan) rundet immer auf `-nächste 10 €`, unabhängig vom bisherigen Vorzeichen.
   - Zurücksetzen-Button erscheint künftig für jeden gesetzten Wert (bisher nur bei positiven Beträgen, daher bei negativen nie sichtbar).

2. **Darstellung normalisieren** (`EconomicPlanLayout.tsx`)
   - Positionsbeträge, Vorjahreswerte, Gruppen- und Fußzeilensummen werden als Beträge ohne Vorzeichen angezeigt, exakt wie im Dokument.
   - Eingabefelder zeigen ebenfalls den positiven Betrag; das negative Vorzeichen bleibt reine Speicherkonvention.

3. **Summenlogik** (`ManualEconomicPlanEditor.tsx`)
   - Gesamtsumme, umlagefähige Summe, Eigentümersumme, Rücklagen- und Vorschusssumme werden über Beträge ohne Vorzeichen gebildet — dieselbe Rechnung wie im Dokument.
   - Prozent-Änderung ggü. Vorjahr rechnet ebenfalls auf Beträgen ohne Vorzeichen.

4. **Bestandsdaten korrigieren (Datenmigration)**
   - `economic_plan_items.planned_amount` und `economic_plan_unit_items.amount` auf `-abs(...)` normalisieren.
   - `economic_plans.total_costs` aus der Summe der Positionen neu berechnen, damit gespeicherte und angezeigte Werte übereinstimmen.

5. **Verifikation**
   - Birkenweg 6 / 2026: Gesamtsumme muss 13.042,00 € in UI **und** Dokument zeigen.
   - Stichprobe eines Einzelwirtschaftsplans: Summe der Eigentümeranteile über alle Einheiten ≈ Gesamtsumme.
   - Tirolerstr. 142 und Adolf-Haff-Weg 3 nach der Migration gegenprüfen.

## Hinweis

Die Migration verändert bestehende Planwerte (nur das Vorzeichen, nicht die Höhe). Inhaltlich geplante Beträge bleiben unverändert.
