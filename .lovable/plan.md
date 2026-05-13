## Problem

Aktuell zeigt die Vorschuss-Aufstellung:
- Vorschüsse zur Kostendeckung: **27.938,06 €** (erwartet: 27.946 €, Diff ~8 €)
- Überzahlung: **2.427,94 €** (erwartet: 210 €, Diff ~2.218 €)

Zwei eigenständige Bugs in `src/components/finance/BillingSettlement.tsx`:

### Bug 1 — Doppel-Proration beim Soll-Hausgeld (~8 € Diff)

In Zeile 530-540 wird der Jahresbetrag **doppelt zeitanteilig** gerechnet:
```
getCostAnnualAmount(c, period.period_from, period.period_to)  // bereits zeitanteilig nach cost.valid_from/to im Abrechnungszeitraum
  * timeProp                                                    // nochmal zeitanteilig nach assignment.valid_from/to
```

Beispiel: Eigentümer ab 01.07., Kosten ab 01.07. gültig → `getCostAnnualAmount` liefert bereits den Halbjahresbetrag, `timeProp = 0,5` halbiert ihn nochmal → ¼ statt ½.

**Fix:** Schnittmenge aus Assignment- UND Cost-Validity gegen den Abrechnungszeitraum bilden, einmalige Proration. `timeProp` entfällt für die Soll-Berechnung.

### Bug 2 — Überzahlung enthält Vorjahres-Eröffnungssalden (~2.210 € Diff)

`personenkontenClose` summiert die Schlusssalden inkl. **Eröffnungsbestand** der Personenkonten 00xx. Hat ein Eigentümer Vorjahres-Guthaben/Schulden, fließt das in `personenkontenPaid` mit ein und verfälscht die Überzahlung.

Der Nutzer rechnet:
```
Überzahlung = Σ tatsächlich gezahlte Hausgelder DIESES Jahres − Σ Soll-Hausgelder
            = 33.156 − 32.946 = 210
```

**Fix:** `personenkontenPaid` aus den **Bewegungen** (movements) des Geschäftsjahres berechnen, nicht aus dem Schlussbestand. `getEffectiveClosingBalance` liefert bereits `.movements` — diesen Wert verwenden (invertiert).

## Änderungen

**Datei:** `src/components/finance/BillingSettlement.tsx`

1. **Zeilen 522–544** (`sollHausgeldGesamt`): `getCostAnnualAmount` so erweitern/aufrufen, dass es Assignment-Validity berücksichtigt — Multiplikation mit `timeProp` entfernen.
2. **Zeilen 562–565** (`personenkontenClose` → `personenkontenPaid`): nur `movements` verwenden:
   ```ts
   const personenkontenMovements = personenkontenAccounts.reduce((s, a) =>
     s + getEffectiveClosingBalance(a.id, bookings, flatBalances, fiscalYear, opening4000Id).movements, 0);
   const personenkontenPaid = -personenkontenMovements;
   ```
3. Vereinfachung der Überzahlungs-Formel (mathematisch äquivalent, klarer):
   ```ts
   const totalUeberzahlung = personenkontenPaid - sollHausgeldGesamt;
   ```

## Verifikation

Nach dem Fix mit den Beispielzahlen:
- Soll-Hausgeld gesamt: 32.946 € → Kostendeckung 27.946 € + EHR 5.000 €
- Tatsächlich gezahlt (nur GJ): 33.156 €
- Überzahlung: 33.156 − 32.946 = **210 €** ✓
