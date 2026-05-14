## Befund — warum die Abrechnungsspitze 23.112,29 € Nachzahlung statt ~+2.000 € Guthaben anzeigt

Erwartete Rechnung (Adolf-Haff-Weg 2025):
```
+ 27.946,00  Vorschüsse Kostendeckung
+  5.000,00  Vorschüsse EHR
−          Bewirtsch. umlagefähig (op_distributable, Aufwand)
−          Bewirtsch. nicht umlagefähig (op_non_distributable)
−          Heizung (heating-Sektion)
−   5.000,00 IHR-Plan (Konto 1930 Planmäßige IHR)
−          relevante Abgrenzungen (accrual, vorzeichenrichtig)
=  ≈ + 2.000  Abrechnungsspitze (Guthaben)
```

Tatsächliche Berechnung in `BillingSettlement.tsx`:
```
abrechnungssumme = op_dist + op_non_dist + heating + totalReserve − totalReserveWithdrawal
spitze           = (sollKostendeckung + sollEHR) − abrechnungssumme
```

Drei Bugs ziehen die Abrechnungssumme künstlich auf 56.058 €:

1. **`totalReserve` enthält das Bestandskonto 1810** — Für Adolf-Haff existiert kein Wirtschaftsplan 2025, also greift der Fallback `reserveFromBookings = getSectionTotal("reserve")` und summiert **1810 (Rücklagenkonto, Bestand 25.166,39 €) + 1930 (Plan-IHR 5.000 €) = 30.166 €**. Korrekt wären nur **5.000 € (Plan-IHR aus 1930 bzw. economicPlan.total_reserve)**. 1810 ist Bestand, gehört in den Vermögensbericht, nicht in die Spitze.

2. **Bilanzkonto 1450 (Brennstoffrestbestand) wird als Aufwand gezählt** — sitzt in `operating_distributable` mit Saldo 1.401,10 €. Es ist aber Bestand, kein Aufwand → muss aus der Abrechnungssumme raus (steht bereits korrekt in den Endbeständen).

3. **Sektionssumme filtert zu eng nach `is_distributable=true`** — `getSectionDistributable` schließt damit z. B. KESt/Soli (1850/1860) aus, obwohl sie verteilungsrelevant sind. „Nicht-umlagefähig" (auf Mieter) ≠ „nicht-verteilungsrelevant" (auf Eigentümer). Filter weg.

4. **Abgrenzungen fehlen komplett** — Die User-Formel sieht „relevante Abgrenzungen" als Komponente vor (für Adolf-Haff zwar 0, aber andere Liegenschaften haben sie). Sektion `accrual` mit Vorzeichen aus `getAccrualDisplaySign` einbinden.

## Umsetzung — `src/components/finance/BillingSettlement.tsx`

1. **`totalReserve` strikt = Plan-IHR**
   - Primär: `economicPlan?.total_reserve` für das Abrechnungsjahr.
   - Fallback: nur die Konten der Sektion `reserve` mit Nummer **`1930`** (bzw. `^193\d$`) — niemals 1810/1820 (Bestand).
   - Konsequenz: 1810 verschwindet komplett aus der Spitze, bleibt aber wie gehabt im Vermögensbericht / Endbestand sichtbar.

2. **Sektionssumme der Aufwandsseite säubern (`getSectionDistributable`)**
   - `is_distributable`-Filter entfernen.
   - Bilanzkonten ausschließen: `account_number` startet mit `145` (Brennstoffrestbestand) **oder** `settlement_section in ('accrual','heating_prepayment')` **oder** `1810/1820/1930` (sind keine Aufwandskonten).
   - Beibehalten: ARAP/PRAP-Schutz und Vorauszahlungs-Schutz.

3. **Abgrenzungen vorzeichenrichtig in `abrechnungssumme` aufnehmen**
   - Neue Größe `totalAccrualRelevant = Σ acc.totalAbs * getAccrualDisplaySign(acc.account_number)` über Sektion `accrual`.
   - In Summe addieren (kann negativ sein und damit die Spitze entlasten).

4. **Neue `abrechnungssumme`-Formel**
   ```
   abrechnungssumme =
       op_dist_relevant       (Aufwand, ohne 1450/Bilanz)
     + op_non_dist_relevant
     + heating_relevant
     + plan_ihr               (5.000 €, nur 1930/economicPlan)
     + accrual_relevant       (vorzeichenrichtig)
     − totalReserveWithdrawal
   ```

5. **Spitze unverändert**
   ```
   vorschussFuerSpitze = sollKostendeckung + sollEHR     // 27.946 + 5.000
   abrechnungsspitze   = vorschussFuerSpitze − abrechnungssumme
   ```

6. **Anzeige im Settlement-Block** (Zeile ~1325) bleibt strukturell gleich — die Beträge stimmen automatisch.

## Erwartetes Ergebnis Adolf-Haff-Weg 2025

| Position | Betrag |
|---|---|
| op_distributable (ohne 1450) | ≈ 18.687,21 € |
| op_non_distributable | ≈ 7.218,00 € |
| heating | 0,00 € |
| Plan-IHR (1930) | 5.000,00 € |
| Abgrenzungen | 0,00 € |
| **Abrechnungssumme** | **≈ 30.905 €** |
| Vorschuss Soll (27.946 + 5.000) | 32.946,00 € |
| **Abrechnungsspitze** | **≈ + 2.041 € (Guthaben)** |

Statt bisher 56.058,29 € Abrechnungssumme und 23.112,29 € Nachzahlung.

## Hinweis / Folgewirkung

- DOCX-Payload (`buildBillingPayload`) bekommt die korrigierten Werte automatisch, weil alle Felder aus denselben Variablen abgeleitet sind.
- Andere Liegenschaften mit korrekt gepflegtem Wirtschaftsplan (z. B. economicPlan vorhanden) waren von Bug #1 nicht betroffen, profitieren aber von Bug #2/#3/#4.