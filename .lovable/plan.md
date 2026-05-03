## Problem

Im Einzelwirtschaftsplan wird die Zeile **„davon X €/Mon. für Erhaltungsrücklage und Y €/Mon. für Vorschüsse zur Kostendeckung"** falsch berechnet. Konkret bei Adolf‑Haff‑Weg 3:

- Konto **1930 „Planmäßige IHR Wohnungen"** (635,00 €) wird komplett als **Vorschuss zur Kostendeckung** gezählt
- Erhaltungsrücklage steht auf **0,00 €/Mon.**, obwohl 1930 inhaltlich genau die EHR-Zuführung ist

### Ursache

Die Aufteilung in `ManualEconomicPlanEditor.tsx` (Zeile 741) prüft ausschließlich **`acc.is_reserve_funded`**:

```ts
const ownerReserveTotal = unitRows.filter((r) => r.isReserve).reduce(...)
```

In der DB ist aber bei 1930: `is_reserve_funded=false`, `settlement_section=NULL`, `reserve_role=NULL`. Die Erkennung greift nicht.

Andere Stellen im Code nutzen bereits **breitere, robustere** Erkennungslogik — die Logiken sind nur nicht einheitlich:

| Komponente | Erkennung Rücklagenkonto |
|---|---|
| `AssetReportSection.tsx` | `settlement_section='reserve'` ODER `category='ruecklage'` ODER Name enthält „rücklage"/„erhaltung" |
| `BillingSettlement.tsx` | `settlement_section='reserve'` (Beiträge) bzw. `reserve_role='withdrawal'` / `is_reserve_funded=true` (Entnahmen) |
| `BalanceCarryForward.tsx` | `settlement_section='reserve'` |
| **`ManualEconomicPlanEditor.tsx`** | **nur `is_reserve_funded`** ← zu eng |

Konto **1710 „II. Beitragsverpflichtung IHR"** hat bereits korrekt `settlement_section='reserve'`. Konto 1930 wurde nur nie entsprechend markiert. Das ist also keine punktuelle Daten-Korrektur, sondern eine generelle Inkonsistenz, die bei jeder Liegenschaft auftreten kann.

## Lösung — in 3 Schichten, damit es für alle Liegenschaften zuverlässig läuft

### 1. Zentrale Helper-Funktion `isReserveContributionAccount(acc)` (`src/lib/accountClassification.ts`, neu)

Eine **Single Source of Truth**, die im gesamten Wirtschaftsplan- und Settlement-Code verwendet wird. Ein Konto zählt als EHR-Zuführung, wenn **eines** dieser Kriterien zutrifft:

1. `settlement_section === 'reserve'` (primär, sauberster Marker)
2. `is_reserve_funded === true` (Legacy)
3. `category === 'ruecklage'`
4. Name-Heuristik als Fallback: enthält `rücklage`, `erhaltung`, `IHR`, `instandhaltung` und ist **kein Entnahme-Konto** (`reserve_role !== 'withdrawal'`)

**Wichtig — Trennung Zuführung vs. Entnahme:** Entnahmekonten (`reserve_role='withdrawal'`, z. B. „Rep. aus Entnahme RL") dürfen NICHT als EHR-Zuführung gezählt werden — sie sind im Wirtschaftsplan Aufwand, nicht Rücklagenbildung.

### 2. Verwendung in `ManualEconomicPlanEditor.tsx`

- Zeile 282: `isReserve: isReserveContributionAccount(acc)` statt nur `!!acc.is_reserve_funded`
- Damit wird 1930 sofort korrekt zugeordnet, ohne Datenmigration
- Gleiche Helper-Funktion auch in `EconomicPlanEditor.tsx` (Vorschau / Generator) und `EconomicPlanPreview.tsx` einsetzen, damit PDF-Ausgabe und UI deckungsgleich sind

### 3. Datenbank-Aufräumung + sichtbares UI-Toggle (für saubere Pflege durch User)

**3a. Migration (einmalig, idempotent):** Alle Konten, die per Heuristik als EHR-Zuführung erkannt werden, bekommen `settlement_section = 'reserve'` gesetzt (außer wenn bereits gesetzt oder `reserve_role = 'withdrawal'`). Betrifft Konten wie 1930, 1931, 1932 etc. über alle Mandanten/Liegenschaften hinweg.

**3b. Inline-Toggle im Kontenrahmen** (`ChartOfAccountsTab.tsx` / `AccountSettingsPopover.tsx`):
Ein klar beschriftetes Toggle „**Erhaltungsrücklagen-Zuführung**" pro Konto, das `settlement_section='reserve'` setzt — analog zu den bestehenden Inline-Toggles für `is_billing_relevant` / `is_wirtschaftsplan_relevant` (siehe Memory „Inline Account Relevance Toggles"). Damit kann der Verwalter pro Liegenschaft im Zweifelsfall manuell korrigieren, ohne Code-Änderung.

### 4. Optional — Anzeige als Plus statt Belastung (zur Klärung)

Aktuell wird die EHR-Zuführung **on top** zum monatlichen Hausgeld erhoben (so ist es bei WEG auch korrekt — sie ist Teil des Hausgeld-Vorschusses gem. §28 WEG, nur zweckgebunden). Wir ändern an der **Berechnung** der monatlichen Belastung also bewusst nichts — nur die **Aufteilung in der Detailzeile** wird korrekt: aus „342,86 €/Mon., davon 0 € EHR + 342,86 € Vorschuss" wird z. B. „342,86 €/Mon., davon **52,92 € EHR** + **289,94 € Vorschuss zur Kostendeckung**".

## Technische Details

**Neue Datei:** `src/lib/accountClassification.ts`
```ts
export interface AccountLike {
  account_name?: string | null;
  category?: string | null;
  settlement_section?: string | null;
  is_reserve_funded?: boolean | null;
  reserve_role?: string | null;
}

export function isReserveContributionAccount(acc: AccountLike): boolean {
  if (acc.reserve_role === "withdrawal") return false; // Entnahme ≠ Zuführung
  if (acc.settlement_section === "reserve") return true;
  if (acc.is_reserve_funded === true) return true;
  if (acc.category === "ruecklage") return true;
  const name = (acc.account_name || "").toLowerCase();
  return /rücklage|erhaltung|\bihr\b|instandhaltungsrücklage/.test(name);
}

export function isReserveWithdrawalAccount(acc: AccountLike): boolean {
  return acc.reserve_role === "withdrawal" || acc.is_reserve_funded === true;
  // Hinweis: Legacy is_reserve_funded wurde historisch teils für Entnahmen genutzt.
  // BillingSettlement.tsx Zeile 356 nutzt diese Logik bereits — beibehalten.
}
```

**Edits:**
- `src/components/finance/ManualEconomicPlanEditor.tsx` Z. 282: Helper nutzen
- `src/components/finance/EconomicPlanEditor.tsx`: Reserve-Erkennung auf Helper umstellen (Zeilen 134/153)
- `src/components/finance/EconomicPlanPreview.tsx`: `plannedReserve` / `annualReserve` über Helper ableiten — damit auch der PDF-Druck korrekt EHR vs. Vorschuss zeigt
- `src/components/finance/AccountSettingsPopover.tsx`: neuer Toggle „Erhaltungsrücklagen-Zuführung" (setzt `settlement_section`)
- Migration: `UPDATE chart_of_accounts SET settlement_section='reserve' WHERE settlement_section IS NULL AND reserve_role IS DISTINCT FROM 'withdrawal' AND (is_reserve_funded=true OR category='ruecklage' OR account_name ~* 'rücklage|erhaltung|^.*IHR.*$');` (mit Vorabprüfung der Treffer-Liste)

**Memory-Update:** Erweiterung von `mem://features/finance/economic-plan-hv-office-alignment` um den Helper als verbindliche Regel: „EHR/Vorschuss-Split immer über `isReserveContributionAccount`, nie nur `is_reserve_funded`."

## Erwartetes Ergebnis im Screenshot

Statt:
> davon 0,00 €/Mon. für Erhaltungsrücklage und 342,86 €/Mon. für Vorschüsse zur Kostendeckung

steht:
> davon **52,92 €/Mon. für Erhaltungsrücklage** und **289,94 €/Mon. für Vorschüsse zur Kostendeckung**

(635 € EHR-Anteil dieser Einheit / 12 = 52,92 €)

Und das funktioniert dann automatisch für **alle Liegenschaften**, weil:
- Helper greift sofort über die Name/Category-Heuristik (auch ohne DB-Korrektur)
- Migration räumt Bestand sauber auf
- Inline-Toggle erlaubt manuelle Korrektur in Sonderfällen
