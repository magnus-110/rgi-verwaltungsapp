## Ziel
Adolf-Haff-Weg 2025: **Abrechnungsspitze** korrekt aus den **verteilungsrelevanten** Beträgen berechnen, **Endbestände** direkt aus den Konten-Salden zeigen, und den **Einnahmen-Block** stabil mit Kostendeckung/EHR/Überzahlung anzeigen. Konten-Listen oben (sectionAccounts) bleiben unverändert.

## Korrekte Formel (vom Nutzer bestätigt)

```text
+ Vorschüsse Kostendeckung                     +27.938,06
+ Vorschüsse EHR (Schluss-Saldo Konto 1930)    + 5.000,00
− Verteilungsrelevant Umlagefähige Bewirtsch.  −18.712,21
− Verteilungsrelevant Nicht umlagefähige K.    − 7.204,69
− Abgrenzungen, die das lfd. Jahr betreffen      0,00 (Adolf-Haff-Weg: keine)
− IHR-Plan (aus Wirtschaftsplan / 1930-Soll)   − 5.000,00
= Abrechnungsspitze                            + 2.021,16  (Guthaben)
```

Wichtige Punkte (anders als bisher):
- **Überzahlung** zählt NICHT in die Abrechnungsspitze (wird nur als Einnahmenzeile nachrichtlich angezeigt).
- Es zählen **nur die verteilungsrelevanten Anteile** der Aufwandskonten, nicht die Brutto-Salden. Nicht-verteilungsrelevante Beträge (z. B. ARAP-Anteil, durchlaufende Vorauszahlungen) werden ausgeschlossen.
- **Abgrenzungen sind nachrichtlich**: Im Adolf-Haff-Weg betreffen 4020/4110/4160/4180 alle Vorjahre/Folgejahre und sind für die Spitze des lfd. Jahres irrelevant. Die Sektion bleibt im UI sichtbar (mit korrekten Vorzeichen), fließt aber NICHT in die Spitze ein.
- **IHR-Plan** kommt 1:1 aus `economicPlan.total_reserve` (Fallback: Schlusssaldo 1930).

## Änderungen in `src/components/finance/BillingSettlement.tsx`

### 1. Verteilungsrelevante Sektionssummen einführen
Aktuell summiert `getSectionTotal` nur `totalAbs` (Brutto). Neu: pro Sektion `Σ distributableAmount` der enthaltenen Konten verwenden, wobei `distributableAmount` das ist, was bereits pro Konto in der Tabelle als „verteilungsrelevant" angezeigt wird.

```ts
const getSectionDistributable = (section: string) =>
  (sectionAccounts[section] || [])
    .reduce((s, a) => s + (Number(a.distributableAmount ?? a.totalAbs) || 0), 0);

const totalOperatingDistRelevant     = getSectionDistributable("operating_distributable");
const totalOperatingNonDistRelevant  = getSectionDistributable("operating_non_distributable");
```
Die bestehenden `totalOperatingDist` (Brutto) bleiben für die Anzeige der Konten-Listen erhalten — sie sind nur für die Spitze ungeeignet.

### 2. Abrechnungssumme & Spitze nach neuer Formel
Zeile 493 ersetzen:
```ts
// HV-Office-konform: Spitze nutzt nur verteilungsrelevante Beträge + Plan-IHR
const abrechnungssumme =
    totalOperatingDistRelevant
  + totalOperatingNonDistRelevant
  + totalReserve;             // = Plan-IHR (5.000,00)
// Hinweis: Abgrenzungen werden NICHT addiert (nachrichtlich).
// Hinweis: totalReserveWithdrawal entfällt — Plan-IHR ist die einzige Reserve-Last.
```
Zeile 616 ersetzen:
```ts
// Nur Soll-Vorschüsse zählen, nicht Überzahlungen
const vorschussFuerSpitze = totalSollKostendeckung + totalSollEHR;
const abrechnungsspitze   = vorschussFuerSpitze - abrechnungssumme;
```
`totalVorschuss` (inkl. Überzahlung) bleibt für den Einnahmen-Anzeigeblock.

### 3. Einnahmen-Block wieder stabil
Sicherstellen, dass die drei Vorzeilen IMMER aus den festen Quellen kommen und EHR auch dann angezeigt wird, wenn `1930` per economicPlan kommt:
```ts
const totalSollEHR = ehrAccountClosing > 0.005
  ? ehrAccountClosing
  : (Number(economicPlan?.total_reserve) || 0);
```
So wird die EHR-Zeile (Zeile ~1289) bei Adolf-Haff-Weg garantiert mit 5.000,00 € angezeigt und Kostendeckung erscheint mit 27.938,06 €.

### 4. Endbestände direkt aus Kontensaldo
`getClosing` (Zeile 445–451) so anpassen, dass es exakt den Saldo zeigt, der auch in der Konten-Liste oben steht (z. B. 1800 = 5.631,94 €):
```ts
import { sumForAccount } from "./lib/bookingAggregation";

const getClosing = (acc: any) => {
  const manual = balances.find((b: any) => b.account_id === acc.id);
  if (manual?.closing_balance != null && Number(manual.closing_balance) !== 0) {
    return Number(manual.closing_balance);
  }
  // Bewegungs-Saldo (Bank-Zentrik) — identisch zur Anzeige in der Kontenliste
  return sumForAccount(acc.id, bookings as any);
};
```
Damit stimmen `closingGiro / closingReserve / closingFuel / closingPrepay / closingOther / closingTotal` 1:1 mit der Kontenanzeige überein.

### 5. Optional (transparent, kein Funktionsbruch)
Im Vermögensbericht (`AssetReportSection`) prüfen, ob dort dieselben Aggregate verwendet werden — falls ja, dieselbe `getClosing`-Logik verwenden.

## Validierung nach Umsetzung
- Vorschüsse Block: 27.938,06 + 5.000,00 + 210,00 (nachrichtlich) = 33.148,06
- Abrechnungssumme: 18.712,21 + 7.204,69 + 5.000,00 = 30.916,90
- **Abrechnungsspitze: +2.021,16 € Guthaben**
- Endbestand 1800 = 5.631,94 €, 1810 = 25.166,39 € (1:1 wie Kontenliste)

## Out of scope
- DOCX-Payload (`buildBillingPayload.ts`) zieht die Werte automatisch aus `totals` — keine separate Anpassung nötig.
- Datenkorrekturen in `account_balances` werden nicht angefasst.
- Logik „Abgrenzung X betrifft das lfd. Jahr" bleibt vorerst auf 0 (= keine im Adolf-Haff-Weg). Falls später ein Konto explizit als „Abgrenzung lfd. Jahr" markiert werden soll, kann ein eigenes Flag (z. B. `accrual_affects_current_year`) ergänzt werden — separate Story.