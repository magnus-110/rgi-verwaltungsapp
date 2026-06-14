## Problem

In `BillingSettlement.tsx` filtert `getSectionDistributable` Konten `/^193\d$/` (Plan-IHR) als „Bilanzkonto" pauschal weg. Damit fällt das einzige Konto in der Sektion `reserve` (1930) raus, `totalReserveRelevant = 0` und die Abrechnungssumme zeigt nur `13.995,96 + 2.763,74 = 16.759,70 €` statt `20.509,70 €`.

## Fix

Den `isBalanceSheetAccount`-Filter **nur außerhalb der Sektion `reserve`** anwenden. Innerhalb von `reserve` ist 193x genau das verteilungsrelevante Konto, das einmal gezählt werden soll (Begründung steht bereits im Kommentar oben).

### Change (1 Stelle)

`src/components/finance/BillingSettlement.tsx` – `getSectionDistributable` nimmt optional die Section entgegen und überspringt den 193x-Filter, wenn `section === "reserve"`:

```ts
const getSectionDistributable = (section: string) =>
  (sectionAccounts[section] || [])
    .filter((a: any) =>
         a.is_distributable
      && !isAccrualBalanceAccount(a)
      && !isHeatingPrepayAccount(a)
      && (section === "reserve" ? true : !isBalanceSheetAccount(a)))
    .reduce((s: number, a: any) => s + Math.abs(a.totalAbs || 0), 0);
```

## Erwartetes Ergebnis (Tirolerstr. 142, 2025)

- Umlagefähig: 13.995,96
- Nicht umlagefähig (verteilungsrelevant): 2.763,74
- IHR (Sektion reserve, 1930): 3.750,00
- **Abrechnungssumme: 20.509,70 €**
- Vorschuss Soll: 20.337,00 → **Abrechnungsspitze −172,70 € (Nachzahlung)**

PDF (`buildBillingPayload.ts`) übernimmt automatisch, da `sumVerteilbar = totals.abrechnungssumme`.
