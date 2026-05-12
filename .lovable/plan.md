## Problem

In der Abrechnung werden viele Konten mit Saldo 0,00 € angezeigt (z. B. 1000 Straßenreinigung, 1011 Papiertonne, 1013 Gewerbemüll …).

**Ursache:** In `BillingSettlement.tsx` (Zeile 355–362) gilt aktuell:

- `is_billing_relevant === true` → **immer anzeigen**, auch bei Saldo 0
- `is_billing_relevant === false` → immer ausblenden
- `null` → nur anzeigen wenn Saldo ≠ 0

DB-Check zeigt: Alle Standard-Aufwandskonten (1000–1071) haben `is_billing_relevant = true` als Default. Dadurch erscheinen sie auch bei Null-Saldo in der Liste.

## Lösung

Standardverhalten umdrehen, damit Null-Saldo-Konten in der Abrechnung nicht mehr stören:

### 1. Filterlogik in `BillingSettlement.tsx` (Zeile 355–362) anpassen

Neue Regel:
- `is_billing_relevant === false` → immer ausblenden (unverändert)
- **Standard: Konten mit Saldo ≈ 0 ausblenden — auch wenn `is_billing_relevant = true`**
- Nur wenn der Nutzer den neuen Toggle „Konten mit Null-Saldo anzeigen" aktiviert, werden diese sichtbar (für Korrekturen / Buchungsnachweis)
- Reserve-Sektion bleibt wie bisher Ausnahme (immer anzeigen)

### 2. UI: Toggle „Null-Saldo Konten anzeigen"

Schalter im Header der Abrechnungs-Übersicht (neben dem bestehenden Steuerungselementen), default **aus**. State lokal im Component.

### 3. Auswirkung

- Saubere Übersicht: nur Konten mit tatsächlicher Bewegung erscheinen
- Verteilungstabelle, Vermögensbericht und Summen bleiben mathematisch identisch (Null trägt nichts bei)
- Konten mit Saldo 0, die manuell auf `is_billing_relevant = true` gesetzt wurden, bleiben in den Konten-Stammdaten unverändert — nur die Anzeige ändert sich

### Technische Details

Datei: `src/components/finance/BillingSettlement.tsx`

```ts
const [showZeroBalanceAccounts, setShowZeroBalanceAccounts] = useState(false);

accounts.forEach((acc) => {
  const section = acc.settlement_section;
  if (!section) return;
  const billingFlag = (acc as any).is_billing_relevant;
  if (billingFlag === false) return;
  const total = getAccountBookingTotal(acc.id);
  const isZero = Math.abs(total) < 0.005;
  if (isZero && section !== "reserve" && !showZeroBalanceAccounts) return;
  // ...
});
```

Toggle-Switch via `<Switch>` (shadcn) oberhalb der Tabelle einfügen.