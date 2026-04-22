

# Fix: SettlementBasicsStep zeigt 0,00 € für Rücklage und Hausgelder

## Diagnose
Drei Bugs in `src/components/finance/SettlementBasicsStep.tsx` — der gleiche Logikfehler, den wir bereits in PDF + `BillingSettlement` behoben haben, war hier noch übrig:

| # | Bug | Folge |
|---|---|---|
| 1 | Personenkonten via `startsWith("0000")` erkannt | matcht nur Konto `0000`, nie `0001/0002/0003…` → Hausgelder = 0,00 € |
| 2 | Rücklage via `category === "ruecklage"` gefiltert | echte Kategorie ist `"4. WEG-Systemkonten & Rücklagen"` → Rücklage = 0,00 € |
| 3 | Bank-Bestand summiert alle `carry_forward_balance=true`-Konten außer der falsch erkannten Rücklage → enthält versehentlich Konto 1700 (Summe Bewirtschaftung) etc. |

## Lösung

### Bug 1 — Personenkonten-Pattern
Konsistent zur bereits dokumentierten Regel (`mem://features/finance/pdf-aggregation-shared`):
```ts
const personalAccountPattern = /^0\d{3}$/;
const personAccounts = accounts.filter(
  (a) => personalAccountPattern.test(a.account_number) && a.account_number !== '0000'
);
```

### Bug 2 + 3 — Rücklage und Bank über Kontonummern statt Kategorie
Die DB-Kategorien sind freier Text und nicht zuverlässig. Die Trennung erfolgt sauberer per Kontonummer:
- **Bank/Giro**: Konten `1800`–`1899` (Standard-WEG-Bankkonten)
- **Rücklage**: Konto `1700` (Erhaltungsrücklage) + alle Konten `1750`–`1799` (sonstige Rücklagen)

```ts
const isBankAccount = (n: string) => /^18\d{2}$/.test(n);
const isReserveAccount = (n: string) => n === '1700' || /^17[5-9]\d$/.test(n);

const giroOpening = openings
  .filter((o) => isBankAccount(o.acc.account_number))
  .reduce((s, o) => s + o.amount, 0);

const reserveOpening = openings
  .filter((o) => isReserveAccount(o.acc.account_number))
  .reduce((s, o) => s + o.amount, 0);
```

Hinweis: Konto `1700` heißt im aktuellen Stand „Summe I. Bewirtschaftungskosten" — das ist offensichtlich falsch benannt für Birkenweg 6. Wir prüfen vor dem Fix per Read-Query, ob `1700` tatsächlich die Erhaltungsrücklage ist; falls nein, braucht es zusätzlich eine Datenkorrektur (eigener Schritt) oder ein neues Flag `is_reserve_account` analog zu `is_reserve_funded`.

### Bug 4 (Bonus) — Filter auf Datumsbereich statt fiscal_year
Konsistenz mit PDF/BillingSettlement: Bookings über `booking_date` zwischen `period_from` und `period_to` filtern. Dazu die Period laden.

## Verifikation
Nach dem Fix muss für **Birkenweg 6 / 2025** angezeigt werden:
- Anfangsbestand Bank: Saldo aus Eröffnungsbuchung 4000 auf 1800
- Anfangsbestand Rücklage: Saldo aus Eröffnungsbuchung 4000 auf 1700 (sofern korrektes Rücklagenkonto)
- Geleistete Hausgelder: Σ Bewegungen auf 0001 + 0002 + 0003

## Betroffene Datei
- `src/components/finance/SettlementBasicsStep.tsx`

## Memory-Update
Ergänzung zu `mem://features/finance/pdf-aggregation-shared`:
> Rücklagen-/Bank-Trennung in der UI nutzt Kontonummern-Pattern (`/^18\d{2}$/` für Bank, `1700` + `/^17[5-9]\d$/` für Rücklage), nicht die freitext-Kategorie. SettlementBasicsStep, BillingSettlement und PDF folgen dieser Regel.

