## Ziel
Im Schritt 3 „Abrechnung erzeugen" zusätzlich zu den bestehenden Tabs (Gesamtabrechnung, Einzelabrechnungen, Vermögensbericht) zwei weitere Tabs ergänzen: **Wirtschaftsplan** und **§35a Bescheinigung**. So sind alle Auswertungen einer Periode auf einer Seite gebündelt.

## Umsetzung

**Datei:** `src/components/finance/BillingSettlement.tsx`

1. In der `TabsList` (Zeile 1276) zwei neue `TabsTrigger` ergänzen:
   - `wirtschaftsplan` → Label „Wirtschaftsplan" (Icon `FileText`)
   - `paragraph35a` → Label „§35a Bescheinigung" (Icon `Receipt`)

2. Zwei neue `TabsContent`-Blöcke nach dem Vermögensbericht-Tab einfügen, die jeweils die bestehenden Sections rendern:
   ```tsx
   <TabsContent value="wirtschaftsplan">
     <EconomicPlanSection buildingId={buildingId} periodId={periodId} fiscalYear={fiscalYear} />
   </TabsContent>
   <TabsContent value="paragraph35a">
     <Paragraph35aSection buildingId={buildingId} periodId={periodId} fiscalYear={fiscalYear} />
   </TabsContent>
   ```

3. Imports ergänzen: `EconomicPlanSection`, `Paragraph35aSection`, ggf. `FileText`/`Receipt` aus `lucide-react`.

## Nicht geändert
- Der separate Bereich „Planung & Berichte" in `Finance.tsx` bleibt unverändert (dort sind die Sections weiterhin erreichbar). Es wird nur eine zusätzliche Einstiegsstelle innerhalb der Abrechnung geschaffen.
- Keine Backend-/Logik-Änderungen, reine UI-Komposition.
