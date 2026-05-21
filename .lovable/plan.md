## Problem

Im Vermögensbericht (PDF/Vorlage) erscheinen die Abgrenzungs-/Forderungspositionen mit abgekürzten, **hartkodierten** Bezeichnungen wie:

- "Ausg. im lfd. J. für Folgejahr"
- "Einn. im lfd. J. für Folgejahr"
- "Ausg. im lfd. J. für Vorjahr"
- "Einn. im lfd. J. für Vorjahr"

In der UI (Kontenplan / Buchhaltung) heißen dieselben Konten aber ausgeschrieben, z. B.:

- 4160 "Ausgaben im Folgejahr für lfd. Jahr"
- 4180 "Einnahmen im Folgejahr für lfd. Jahr"
- 4110 "Ausgaben im lfd. Jahr für Vorjahr"
- 4120 "Einnahmen im lfd. Jahr für Vorjahr"

Ursache: In `buildBillingPayload.ts` (Z. 577–602) werden die Bereiche 4100–4199 pauschal per `sumRange()` zu zwei Zeilen aggregiert, mit fest eingetragenen Kurztexten. Der echte `account_name` aus `chart_of_accounts` wird hier ignoriert. Dasselbe Muster steht zusätzlich in `AssetReportSection.tsx` (Z. 153–157) für die UI-Vorschau.

## Lösung

Statt zwei festen Aggregat-Zeilen pro Sektion **pro tatsächlich bebuchtem Konto eine Zeile** mit dessen echtem `account_name` ausgeben.

### Änderungen in `src/components/finance/lib/buildBillingPayload.ts`

1. Sektion 3 (Z. 569–586, "Zu- und Abflüsse aus Jahresabgrenzung", Ranges 4140–4199):
   - Über `accrualAccs.filter(n in [4140..4199])` iterieren
   - Pro Konto Zeile bauen: `{ konto_nr, bezeichnung: a.account_name, betrag, betrag_raw }`
   - Vorzeichenlogik aus `accrualSign.ts` (4160 +, 4180 −, 4140 +) pro Konto anwenden — heute identisch, nur jetzt korrekt zugeordnet
   - `sumAbgrenzung` weiterhin als Summe der Zeilen
   - Zeilen mit |betrag| < 0,005 weiterhin ausfiltern

2. Sektion 4 (Z. 588–606, "Forderungen zum Jahresende", Ranges 4100–4139):
   - Analog: pro Konto eine Zeile mit echtem `account_name`
   - Vorzeichen wie bisher (4100 +, 4120 +)

3. Sektion 5 (Z. 608–610, "Verbindlichkeiten"): unverändert.

Optional zusätzlich pro Zeile `konto_nr` mit ausgeben, damit die Vorlage künftig "{konto_nr} {bezeichnung}" rendern kann (rein additiv, bestehende Vorlagen brechen nicht).

### Änderungen in `src/components/finance/AssetReportSection.tsx`

- Den Hardcoded-Mapper `inRange(...) → "Ausg. im lfd. J. ..."` (Z. 153–157) entfernen bzw. nur noch als Fallback verwenden, falls `account_name` leer ist. Primär den COA-Namen anzeigen, damit UI-Vorschau und PDF deckungsgleich sind.

## Auswirkungen

- Vorlagen-Loops `{#abgrenzung}{bezeichnung}` / `{#forderungen}{bezeichnung}` funktionieren unverändert — sie bekommen jetzt nur die echten, vollen Namen.
- Mehrere Konten im selben Range (z. B. 4160 + 4170) erscheinen jetzt als separate Zeilen statt zu einer Summe verschmolzen — das ist genauer und entspricht der UI.
- Summen-Platzhalter `{sum_abgrenzung}` / `{sum_forderungen}` bleiben numerisch identisch.

Kein Migrations- oder Datenbankaufwand, rein Frontend/Payload-seitig.
