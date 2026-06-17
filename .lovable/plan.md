## 1. UI: "Weitere Kosten" angleichen an Section 4 (Auto-Positionen)

Karten in Section 5 sollen exakt aussehen wie in Section 4 (siehe Screenshot):

- `rounded-xl px-4 py-3`, amber Hintergrund (`RGI.amberBg`), 1px transparent border
- **Eine Zeile** statt zwei Inputs:
  - Links: Trash-Icon (klein, muted) + Bezeichnung als transparentes Input ohne Border, fett — Titel-Look wie bei den Auto-Positionen
  - Darunter Mini-Zeile: `Schlüssel DIREKT · Mieteranteil` (muted, 11px)
  - Rechts (mit `border-left` Separator): gleiches Beträge-Pattern wie Section 4 — `inputMode="decimal"`, `w-24 bg-transparent border-0 outline-none text-right text-lg font-semibold tabular-nums`, kein Spinner, kein Scrollwheel-Change, deutsches Komma-Format, `€` daneben
- Buttons "+ Grundsteuer / Kabel TV / Wartung SE / Freie Position" bleiben darunter unverändert

## 2. Rechen-Logik prüfen

Status der aktuellen Logik (`totals` in `NebenkostenTool.tsx` Z. 298-319):

| Frage | Status |
|---|---|
| Extra-Positionen mitgerechnet? | ✅ `extraSum` fließt in `costSum` und in den Snapshot |
| Vorauszahlungs-Abgleich? | ✅ `result = costSum − prepayMonthly × Tage/Periode` (siehe Pkt. 3) |
| Abmarkierte Position raus? | ✅ via `disabledAccounts.has(...)` aus Summe **und** Snapshot |
| Heizung mit Override? | ✅ `heatingOverride` ersetzt den Messdienst-Wert in Snapshot |

## 3. Tagesgenaue Pro-Rata-Verteilung bei Mieterwechsel

Aktuell rechnet `monthsInPeriod()` nur ganze Monate (Z. 1106-1124). Umstellung auf **tagesgenau**:

```text
days_in_period   = (period_to − period_from) + 1
tenant_days      = (min(period_to, move_out) − max(period_from, move_in)) + 1
factor           = tenant_days / days_in_period      // 0..1
```

`factor` wird angewendet auf:

- jede **Auto-Position** außer `consumption_based` (Verbrauchspositionen kommen schon anteilig vom Messdienst)
- **Heizung** bleibt unverändert (Messdienst rechnet bereits anteilig — Hinweistext sagt das bereits)
- **Extra-Kosten**: standardmäßig anteilig, mit pro-Position-Toggle "ganzjährig" für Einmalkosten wie z. B. eine einzelne Reparatur (Default Pro-Rata, Grundsteuer/Kabel-TV laufen also automatisch tagesanteilig)
- **NK-Vorauszahlung**: `prepayMonthly × 12 × factor` (Tagesbasis statt Monatsbasis — entspricht den 12 Monatsraten anteilig auf die Mietzeit)

Sichtbar im UI:

- Wenn `tenantChanged` aktiv: kleines Banner über Section 4 und 5: "Beträge zeitanteilig vom 14.03. bis 31.10. (232 von 365 Tagen, Faktor 63,6 %)"
- Beträge-Input zeigt direkt den gekürzten Wert (Override des Nutzers überschreibt weiterhin)
- Im Snapshot pro Position zusätzlich `prorata_days`, `period_days`, `prorata_factor` für die PDF

## 4. Was nicht geändert wird

- Sections 1–3, Bottom-Bar, Checkout, Edge Function `get-owner-billing-positions`
- DB-Schema bekommt nur ein optionales Bool `prorata_exempt boolean default false` auf `service_owner_costs` (für den Toggle "ganzjährig") inkl. GRANT-Block

## Files

- `src/pages/weg-owner/NebenkostenTool.tsx` — Section-5-UI, `monthsInPeriod` → `daysFactor`, `totals`-Memo, Snapshot, Banner
- `supabase/migrations/<ts>_owner_costs_prorata_exempt.sql` — Spalte + GRANTs
