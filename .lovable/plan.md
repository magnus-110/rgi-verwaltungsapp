## Befund

Die Abrechnungssumme enthält aktuell die Abgrenzungen (`totalAccrualRelevant = −6.630,03 €`), obwohl diese laut UI-Label bereits als „nachrichtlich, nicht verteilt" gekennzeichnet sind. Dadurch wird die Abrechnungssumme künstlich um 6.616,69 € reduziert und die Spitze entsprechend zu hoch (8.645,79 € statt 2.029,10 €).

Aktuelle Berechnung (`BillingSettlement.tsx`, Zeile 531–537):
```
abrechnungssumme = op_dist + op_non_dist + heating + totalReserve
                 + totalAccrualRelevant   ← falsch
                 − totalReserveWithdrawal
```

Erwartung des Nutzers für Adolf-Haff 2025:
```
+ 32.946,00  Vorschüsse (Hausgeld + IHR)
−  18.712,21 op_distributable
−   7.204,69 op_non_distributable
−   5.000,00 Plan-IHR
=   2.029,10 Abrechnungsspitze (Guthaben)
```

Abgrenzungen sind reine Periodisierungs-Information für den Vermögensbericht und gehören nicht in die Abrechnungssumme der Eigentümer.

## Fix

Eine einzige Änderung in `src/components/finance/BillingSettlement.tsx`:

1. **Zeile 536 entfernen** — `+ totalAccrualRelevant` aus `abrechnungssumme` streichen. Variable bleibt erhalten, weil sie für den nachrichtlichen Block und den DOCX-Payload weiter gebraucht wird.

Neue Formel:
```
abrechnungssumme =
    op_dist_relevant
  + op_non_dist_relevant
  + heating_relevant
  + plan_ihr (totalReserve)
  − totalReserveWithdrawal
```

## Erwartetes Ergebnis

| Position | Betrag |
|---|---|
| op_distributable | 18.712,21 € |
| op_non_distributable | 7.204,69 € |
| heating | 0,00 € |
| Plan-IHR | 5.000,00 € |
| Entnahmen IHR | 0,00 € |
| **Abrechnungssumme** | **30.916,90 €** (≈ 30.917 €) |
| Vorschuss Soll | 32.946,00 € |
| **Abrechnungsspitze** | **+ 2.029,10 € Guthaben** |

Abgrenzungen (−6.630,03 €) bleiben als nachrichtliche Zeile sichtbar, fließen aber nicht in die Verteilung ein.

## Hinweis

Falls die angezeigte Abrechnungssumme leicht von 30.916,90 € abweicht (z. B. um ein paar Cent / um 13 €), klären wir das im nächsten Schritt — wahrscheinlich Rundung oder ein einzelnes Konto in `op_non_distributable`.
