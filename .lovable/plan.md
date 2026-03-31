

## Kontenrahmen im Gebäude erweitern + Defaults setzen + Sortierung fixen

### Problem
1. **BuildingDistributionKeysTab** zeigt nur 4 Spalten (Verteilerschlüssel, Abr., HL, Saldo) — es fehlen: WP-relevant, Verteilungsrelevant (VR), Abr.-Sektion, §35a-Typ, §35a-relevant
2. **Alle globalen Konten** haben fast alle Flags auf `false`/`null` — keine sinnvollen Defaults gesetzt
3. **Sortierung** nutzt `sort_order` statt `account_number` — Konten wie 1041, 1470-1473 stehen am Ende (sort_order = 0 oder 115)

### Umsetzung

**1. BuildingDistributionKeysTab.tsx erweitern**
- Neue Spalten in der Tabelle hinzufügen (identisch zu ChartOfAccountsTab): VR, §35a-Typ, Abr.-Sektion, WP, §35a
- Jede Spalte als direkt editierbares Checkbox/Dropdown (wie bereits bei Abr., HL, Saldo)
- Add-Dialog erweitern um alle fehlenden Felder

**2. Sortierung auf `account_number` umstellen**
- In beiden Komponenten: `.order("account_number")` statt `.order("sort_order")`
- Damit werden Konten chronologisch nach Nummer sortiert (00000, 1000, 1010, ..., 4000, ...)

**3. SQL-Update für korrekte Defaults aller globalen Konten**
Eine Migration die alle ~80 Konten mit sinnvollen Standardwerten befüllt:

| Kontenbereich | is_billing_relevant | is_distributable | settlement_section | is_wirtschaftsplan_relevant | settlement_35a_type |
|---|---|---|---|---|---|
| 00000 (Personen) | false | false | null | false | null |
| 1000-1303 (Umlagefähig) | true | true | operating_distributable | true | dienste (bei 1060-1130) |
| 1400-1461 (Heizung) | true | true | operating_distributable | true | null |
| 1470-1473 (Vorauszahlungen) | false | false | bank | false | null + carry_forward=true |
| 1500-1503 (Verwaltung) | true | true | operating_non_distributable | true | null |
| 1510-1560 (Verw.kosten) | true | true | operating_non_distributable | true | null |
| 1600-1699 (Instandhaltung) | true | true | operating_non_distributable | true | handwerker |
| 1700-1720 (Rücklage) | true | true | reserve | true | null + carry_forward=true |
| 1800-1810 (Bank) | false | false | bank | false | null + carry_forward=true |
| 1840-1860 (Zinsen/Steuern) | true | true | income / operating_non_distributable | false | null |
| 1900-1940 (Sonstige/§35a) | varies | varies | varies | false | dienste/handwerker |
| 4000-4180 (Eröffnung/Abgr.) | false | false | accrual | false | null |

Heating-relevant: Konten 1400-1461 + is_heating_relevant = true

### Betroffene Dateien
- `src/components/finance/BuildingDistributionKeysTab.tsx` — alle Spalten + Sortierung
- 1 neue Migration — UPDATE aller Defaults + sort_order = numerisch nach account_number

