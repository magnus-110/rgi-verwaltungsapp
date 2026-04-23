

# Plan: Abrechnung Birkenweg 6 / 2025 mit HV Office abgleichen

## Diagnose

Vergleich App vs. HV Office hat 4 Abweichungen ergeben:

| # | Position | App zeigt | HV zeigt | Ursache |
|---|---|---|---|---|
| 1 | 1400 Heizung/Warmwasser | 1.276,30 € | 5.148,99 € | `getAccountBookingTotal` filtert ALLE Buchungen mit `category='heating_repost'` raus → die 3.537,68 € Gas-Umbuchung + 167,51 € Strom-Umbuchung kommen nie auf 1400 an |
| 2 | 1600 Lfd. Instandhaltung | umlagefähig | nicht umlagefähig | Konto-Setting falsch klassifiziert |
| 3 | 1920 Rep. aus Entnahme RL | umlagefähig | nicht umlagefähig | Konto-Setting falsch klassifiziert |
| 4 | 1431/1440/1470/1472 Durchlaufkonten | werden in Abrechnung gelistet | nicht enthalten | Section `heating_prepayment` wird im UI noch dargestellt |
| 5 | Rücklagen-Block (Plan IHR 3.600 + Entnahme 7.293,51 + Zinsen/Steuern) | unvollständig | komplett mit Zinsen/KESt/Soli | Konten 1840/1850/1860 (`section='reserve'`) tauchen in der Abrechnung nirgends auf, weil `SECTION_ORDER` die Reserve-Bewegungen nicht zeigt |

## Lösung

### A) Code-Fix in `BillingSettlement.tsx` — Repost-Logik (Bug #1)

`getAccountBookingTotal(accountId)` so umstellen, dass `heating_repost`-Buchungen nur dann ignoriert werden, wenn das Konto **Quelle** (Vorauszahlungskonto 1470er) ist — nicht wenn es **Ziel** (1400) ist. Konkret: Filter entfernen, stattdessen pro Buchung prüfen — wenn die Buchung `heating_repost` ist und `accountId` = die Quelle (counter_account in unserer Konvention bei diesen Buchungen ist 1400 als Ziel, account_id ist 1470 als Quelle) → Beitrag der Quelle weglassen, Ziel zählt voll.

Einfacher: heating_prepayment-Konten werden ohnehin aus der Abrechnung ausgeblendet (siehe C), daher reicht es, den Repost-Filter komplett zu entfernen. Dann zeigt 1400 korrekt 5.148,99 € (1443,81 + 167,51 + 3537,68), und die Quellkonten 1470/1472 werden gar nicht mehr dargestellt.

### B) Daten-Fix `chart_of_accounts` — HV-konforme Klassifizierung (Bugs #2, #3)

Migration mit Updates:

| Konto | Feld | Alt → Neu |
|---|---|---|
| 1600 Lfd. Instandhaltung | `settlement_section` | `operating_distributable` → `operating_non_distributable` |
| 1600 | `is_distributable` | `true` → `false` |
| 1920 Rep. aus Entnahme RL | `settlement_section` | `operating_distributable` → `operating_non_distributable` |
| 1920 | `is_distributable` | `true` → `false` |
| 1920 | `is_reserve_funded` | bleibt `true` (für Neutralisierung) |

### C) Code-Fix `BillingSettlement.tsx` — Durchlaufkonten ausblenden (Bug #4)

`SECTION_ORDER` die Sektion `heating_prepayment` entfernen. Diese Konten dienen nur der Buchhaltung (Vorauszahlungen → Umbuchung auf 1400) und gehören nach HV-WEG-Logik nicht in die Eigentümerabrechnung. Ihr Saldo landet ohnehin per Repost auf 1400.

### D) Code-Fix `BillingSettlement.tsx` — Reserve-Sektion vollständig (Bug #5)

Im aktuellen Code wird `getSectionTotal('reserve')` nur als Fallback genutzt. Stattdessen analog zu HV Office:

- **Zuführung Plan IHR**: aus `economic_plan.total_reserve` (3.600 €) — bleibt
- **Entnahme aus Rücklage**: `totalReserveWithdrawal` aus `is_reserve_funded`-Konten — bleibt
- **Zinsen/KESt/Soli auf RL**: aktuell `section='reserve'`. Diese in einem eigenen Block „Bewegungen Rücklagenkonto" im Reserve-Abschnitt darstellen (Zinsertrag 37,56 + KESt -9,39 + Soli -0,50). Sie sind **nicht abrechnungswirksam für Eigentümer**, beeinflussen aber den Endbestand und tauchen bei HV unter „nicht umlagefähig" auf.
- Die Konten 1840/1850/1860 zusätzlich in `operating_non_distributable` ausweisen (analog HV) — am sinnvollsten Konto-Setting umstellen: `1850/1860` → `settlement_section='operating_non_distributable'`, `is_distributable=true` (nur als Aufwand, der per is_reserve_funded neutralisiert würde — alternativ: nur informativ ohne Verteilung). 1840 (Zinsertrag) → bleibt `reserve`, wird im Reserve-Block angezeigt.

### E) Verifikation

Nach Fix muss die Abrechnung exakt zeigen:

```text
Umlagefähig (operating_distributable):
  1010 Müllabfuhr           378,60
  1030 Wasser/Abwasser       27,84
  1050 Allgemeinstrom       111,68
  1300 Versicherungen       895,97
  1400 Heizung/Warmwasser 5.148,99   ← Fix #1
  Σ                       6.563,08

Nicht umlagefähig:
  1500 Verwaltervergütung 1.927,80
  1520 Kontogebühren        144,32
  1600 Lfd. Instandhaltung  240,98   ← Fix #2
  1850 KESt                   9,39
  1860 Soli                   0,50
  1920 Rep. aus Entnahme  7.293,51   ← Fix #3
  Σ                       9.616,50

Abgrenzungen Σ            -755,99

Rücklage:
  Plan IHR Zuführung     -3.600,00
  Entnahme RL (1920)     +7.293,51

Abrechnungssumme       -12.486,07 € ✓ (matcht HV exakt)
```

## Schritte

1. **Migration** `chart_of_accounts` — Klassifizierung 1600, 1920, 1850, 1860 anpassen
2. **`BillingSettlement.tsx`** — `heating_repost`-Filter aus `getAccountBookingTotal` entfernen
3. **`BillingSettlement.tsx`** — `SECTION_ORDER` ohne `heating_prepayment`
4. **`BillingSettlement.tsx`** — Reserve-Block um Zinsen/KESt/Soli-Anzeige erweitern (informativ)
5. **Verifikation** — Werte gegen HV-PDF prüfen, Ziel: Abrechnungssumme = -12.486,07 €, Abrechnungsspitze = +1.613,93 €
6. **Konsistenz-Check** — `EconomicPlanSection`, `BookingReviewSection`, `HeatingAccountsSection` lesen dieselben Konten — keine Änderung nötig, da Repost-Filter dort bereits korrekt nur die Quellseite ausschließt

## Hinweis
Nach diesen Fixes ist die Gesamtabrechnung deckungsgleich mit HV Office. Anschließend folgt die Einzelabrechnung pro Eigentümer (MEA-Verteilung, Heizkosten gem. Brunata, Abrechnungsspitze) — das ist bereits implementiert und sollte automatisch stimmen, sobald die Gesamtspalte korrekt ist.

