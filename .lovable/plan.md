## Befund

In `BillingSettlement.tsx` (Zeile 521–524) summiert `getSectionDistributable` aktuell **alle** Konten der Sektion (außer Bilanz-/Abgrenzungs-/Heizungs-Vorauszahlungs-Konten). Das `is_distributable`-Flag (VR — Verteilungsrelevant) wird nicht berücksichtigt.

Dadurch fließen Konten wie **1850** und **1860** (Abrechnungsrelevant, aber NICHT Verteilungsrelevant) in `totalOperatingNonDistRelevant` ein. Folge: Abrechnungssumme ist um ca. 14 € zu hoch, Spitze entsprechend zu niedrig.

## Fix

Eine einzige Änderung in `src/components/finance/BillingSettlement.tsx`, Zeile 521–524:

`getSectionDistributable` zusätzlich nach `a.is_distributable === true` filtern:

```ts
const getSectionDistributable = (section: string) =>
  (sectionAccounts[section] || [])
    .filter((a: any) =>
         a.is_distributable
      && !isAccrualBalanceAccount(a)
      && !isHeatingPrepayAccount(a)
      && !isBalanceSheetAccount(a))
    .reduce((s: number, a: any) => s + Math.abs(a.totalAbs || 0), 0);
```

Wirkt auf alle drei Aufrufe (`operating_distributable`, `operating_non_distributable`, `heating`) — Konten ohne VR-Flag (z. B. 1850, 1860) werden in keiner Sektion mehr in die Abrechnungssumme aufgenommen.

## Erwartetes Ergebnis

| Position | vorher | nachher |
|---|---|---|
| op_non_distributable | 7.218 € | 7.204,69 € |
| **Abrechnungssumme** | 30.930 € | **30.916,90 €** |
| **Abrechnungsspitze** | +2.015 € | **+2.029,10 €** |

Konten 1850 / 1860 bleiben im Kontenrahmen sichtbar und auch Abrechnungs­relevant (für den Vermögensbericht), wandern aber nicht mehr in die Verteilung.
