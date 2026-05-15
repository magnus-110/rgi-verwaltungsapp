## Ziel

Vermögensbericht beim Birkenweg 6 (und allen anderen Liegenschaften) soll dem HV-Office-Format aus der hochgeladenen XLSX (Tirolerstr. 142) folgen: nur IST-Stände der Positionen zum Stichtag, am Ende eine Gesamtsumme. Abgrenzungsbuchungen müssen mit korrektem Vorzeichen je Konto einfließen, manuelle Positionen ebenfalls.

## Ziel-Struktur (analog HV-Office)

```text
Objekt {nr} - WJ {jahr} - {anschrift}
Vermögensstand zum 31.12.{jahr}

Liquide Mittel aus Bankkonten und Kasse
  Heizölrestbestand                                   {x} €
  {Bankkonto 1}                                       {x} €
  {Rücklagenkonto}                                    {x} €
                                                  ────────
                                          Zwischensumme  €

Guth. und Nachz. aus Abrechnung incl. Altschulden
  Guthaben aus Abrechnung                             {x} €
  Nachzahlung aus Abrechnung                          {x} €
                                          Zwischensumme  €

Zu- und Abflüsse aus Jahresabgrenzung   (Konten 4100/4120 → Folgejahr-Effekt)
  Einnahmen im lfd. J. für Folgejahr (PRA, 4120)
  Ausgaben  im lfd. J. für Folgejahr (ARA, 4100)
  Einnahmen im Folgejahr für lfd. J. (4160)
  Ausgaben  im Folgejahr für lfd. J. (4180)
                                          Zwischensumme  €

Forderungen zum Jahresende
  (Personenkonten mit Soll-Saldo / offene Posten)     {x} €
                                          Zwischensumme  €

Verbindlichkeiten zum Jahresende
  (Personenkonten mit Haben-Saldo)                    {x} €
                                          Zwischensumme  €

Sonstige Vermögensposten        (nach Kontonummer + manuelle Items)
  {Konto Flag-markiert ohne Standardgruppe}           {x} €
  {Manuelle Position 1 (asset_report_items)}          {x} €
                                          Zwischensumme  €

══════════════════════════════════════════════════
Vermögensstand zum 31.12.{jahr}                  {Σ} €
```

Vorzeichen-Regeln (aus `lib/accrualSign.ts`, bereits Core-Memory):
- 4100/4180: negativ
- 4120/4160: positiv
- Ins-Folgejahr-rein dreht das Vorzeichen entsprechend

## Was umgesetzt wird

### 1. Neues Flag `is_asset_report_relevant`

- Spalte in `chart_of_accounts`, Default `false`.
- Migration setzt für **alle Liegenschaften gleichzeitig** automatisch `true` für:
  - 1800–1899 (Bank/Kasse)
  - 1810/1820 (Erhaltungsrücklage)
  - 1470–1473 (Vorauszahlungen Versorger)
  - 4100, 4120, 4160, 4180 (Abgrenzungen)
  - 1700/1710 (Abrechnungsspitze/IHR-Soll für Guth./Nachz.)
- Inline togglebar in `AccountPlanView` und `AccountSettingsPopover` — gleiche UX wie die zwei bestehenden Flags.

### 2. Vermögensbericht flag-getrieben + HV-Office-Layout

Refactor `AssetReportSection.tsx`:

- Eingangsmenge = alle Konten mit `is_asset_report_relevant = true` + Brennstoffbestand + manuelle Items.
- Gruppierung in feste Sektionen anhand Kontonummer:

| Sektion | Kontonummern |
|---|---|
| Liquide Mittel aus Bankkonten und Kasse | 1800–1899 + Brennstoff |
| Erhaltungsrücklage (eigener Block, separat von liquide) | 1810/1820 + reserve_role |
| Guth. und Nachz. aus Abrechnung incl. Altschulden | 1700/1710 |
| Vorauszahlungen Versorger | 1470–1473 |
| Zu- und Abflüsse aus Jahresabgrenzung | 4100/4120/4160/4180 mit `getAccrualDisplaySign` |
| Forderungen zum Jahresende | Personenkonten Soll-Saldo (optional, falls Anforderung) |
| Verbindlichkeiten zum Jahresende | Personenkonten Haben-Saldo (optional) |
| Sonstige Vermögensposten | alle weiteren flag-markierten Konten **+ manuelle Items**, sortiert nach Kontonummer |

- Pro Sektion: Zeilen + Zwischensumme.
- **Keine Veränderungs-/Bewegungsspalten** — nur IST-Stand zum Stichtag (`getEffectiveClosingBalance`).
- Gesamtsumme = Σ aller Sektions-Zwischensummen.

### 3. Manuelle Positionen integriert

- `AssetReportItemsCard` bleibt als Edit-UI bestehen, wird aber **innerhalb** der `AssetReportSection` als Subkomponente platziert.
- Items fließen in die Sektion „Sonstige Vermögensposten" und in die Gesamtsumme.
- Sortierung dort: zuerst flag-markierte Konten nach Kontonummer, dann manuelle Items alphabetisch.

### 4. Payload / Word-Vorlage

`buildAssetReportPayload` in `lib/buildBillingPayload.ts` liefert generisches Schema:

```json
{
  "stichtag": "31.12.2025",
  "objekt": "...",
  "sektionen": [
    { "titel": "Liquide Mittel ...", "zeilen": [{label, betrag}], "zwischensumme": x },
    ...
  ],
  "vermoegensstand": x
}
```

Bestehende DOCX-Vorlage `vermoegensbericht` muss einmalig auf dieses Schema angepasst werden (`{#sektionen} {sektion} {#zeilen} ... {/zeilen} {zwischensumme} {/sektionen}` plus `{vermoegensstand}`) — separater Folge-Task.

## Technische Details

**Migration**
```sql
ALTER TABLE chart_of_accounts
  ADD COLUMN is_asset_report_relevant boolean NOT NULL DEFAULT false;

UPDATE chart_of_accounts SET is_asset_report_relevant = true
WHERE account_number ~ '^(18\d{2}|147[0-3]|17[01]0|410[0-9]|412[0-9]|416[0-9]|418[0-9])$';
```

**Code**
- `src/components/finance/AssetReportSection.tsx` — Refactor: flag-getriebene Sektionsbildung, HV-Office-Layout, manuelle Items integriert, Vorzeichen via `getAccrualDisplaySign`.
- `src/components/finance/AccountSettingsPopover.tsx`, `AccountPlanView.tsx` — drittes Flag „Vermögensbericht" inline.
- `src/components/finance/CreateAccountInlineDialog.tsx`, `ChartOfAccountsTab.tsx` — Flag im Anlage-Formular.
- `src/components/finance/lib/buildBillingPayload.ts` — `buildAssetReportPayload` generisch über `sektionen[]`.
- `src/components/finance/AssetReportItemsCard.tsx` — bleibt, wird in Section eingebettet.
- Memory-Update: neuer Eintrag `mem://features/finance/asset-report-flag-driven`.

**Unverändert**
- `getEffectiveClosingBalance`, `sumForAccount`, Eröffnungsbestands-Quellen, Brennstoff-Logik, `accrualSign.ts`.
