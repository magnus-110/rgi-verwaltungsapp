## Ursache der Differenz (Tirolerstr. 142 · 1800 Giro · Januar 2025)

**Soll:** 13.210,32 € · **Buchhaltung zeigt:** 15.352,38 € · **Differenz: +2.142,06 €**

### Was passiert?

Die Saldoberechnung im Kontenabgleich nutzt die Postgres-Funktion `calculate_account_balance_at`. Diese rechnet **rein seitenbasiert**:
- Buchung hat `account_id = Bank` → **+Betrag**
- Buchung hat `counter_account_id = Bank` → **−Betrag**

`booking_type` (`income`/`expense`) wird **ignoriert**.

### Warum das hier knallt

Make.com bucht **bank-zentrisch**: Die Bank steht meist als `account_id` mit positivem `amount` und `booking_type=expense` für Ausgaben. Beispiel Januar 2025 (Tirolerstr. 142):

| Datum | Beschreibung | Typ | Bank-Seite | Betrag | Soll-Wirkung Bank |
|---|---|---|---|---|---|
| 02.01. | Verwaltervergütung | expense | account_id | 214,20 | −214,20 |
| 07.01. | Allgemeinstrom | expense | account_id | 43,00 | −43,00 |
| 09.01. | Winterdienst HGS | expense | account_id | 116,62 | −116,62 |
| 10.01. | Gerätemiete Techem | expense | account_id | 228,48 | −228,48 |
| 13.01. | Hausreinigung Gschwend | expense | account_id | 110,67 | −110,67 |
| 13.01. | (ohne Text) | expense | account_id | 55,34 | −55,34 |
| 20.01. | Hausmeister HGS | expense | account_id | 114,24 | −114,24 |
| 21.01. | Winterdienst (Bereitstellung) | expense | account_id | 178,14 | −178,14 |
| 31.01. | Kontogebühren | expense | account_id | 10,34 | −10,34 |
| **Summe Ausgaben** | | | | | **−1.071,03** |

Die RPC zählt diese Beträge aber **+1.071,03** (Bank ist `account_id` → +). Der Fehler ist also **2 × 1.071,03 = 2.142,06 €** — exakt die angezeigte Differenz.

Die korrekte Rechnung wäre:
```
Anfangssaldo  12.649,76
+ Einnahmen    1.631,59
− Ausgaben     1.071,03
= Endsaldo    13.210,32 ✓ (passt zum Kontoauszug)
```

### Lösung

In `src/components/finance/lib/bookingAggregation.ts` existiert bereits `signedTotalForAccount`, das `booking_type` korrekt berücksichtigt (siehe Memory „Bank-Centric Booking Logic"). Diese Helper-Logik wird im Kontenabgleich nicht verwendet.

**Plan:**

1. **`BankReconciliationTab.tsx` umstellen** auf clientseitige Berechnung mit `signedTotalForAccount`:
   - `openingBook` = `signedTotalForAccount(bankAccountId, bookings ≤ Vortag)`
   - `closingBook` = `signedTotalForAccount(bankAccountId, bookings ≤ Monatsende)`
   - Den bisherigen „Korrektur"-Workaround (`openingDeltaCorrected`/`balanceCorrection`) komplett entfernen — der war nur ein Pflaster für die Eröffnungsbuchung 4000 und ist mit der neuen Logik überflüssig.
   - Buchungen werden einmal gemeinsam mit `account_id`, `counter_account_id`, `amount`, `booking_type`, `booking_date` geladen (gefiltert auf `building_id`, `fiscal_year`, Bank-Konto, `status ≠ cancelled`).

2. **Verifizieren** durch erneutes Öffnen Januar 2025: Endsaldo lt. Buchhaltung muss 13.210,32 € zeigen, Differenz 0,00 €.

3. **Memory-Update** in `mem://features/finance/bank-reconciliation-monthly`: Hinweis ergänzen, dass der Kontenabgleich `signedTotalForAccount` nutzen muss (nicht die alte RPC), weil Make.com bank-zentrisch mit `booking_type` bucht.

### Technische Details

- **Keine** DB-Migration nötig — die RPC bleibt unverändert (sie wird an anderen Stellen für reine Kassen-/Saldoberichte ggf. noch benutzt, das wird in einem separaten Schritt geprüft).
- **Keine** Änderung an Buchungsdaten — die vorhandenen Buchungen sind bank-zentrisch korrekt erfasst, nur die Auswertung war falsch.
- Datei betroffen: nur `src/components/finance/BankReconciliationTab.tsx`.
