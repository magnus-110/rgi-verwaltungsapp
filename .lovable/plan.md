# Fix: Personenkonto-Matching für Einzelabrechnungs-Überzahlung

## Problem

`computeOwnerResult` in `BillingSettlement.tsx` matcht für viele Eigentümer das passende Personenkonto (`00xx Hausgeld …`) nicht und fällt auf SOLL zurück. Dadurch bleibt `ownerUeberzahlung = 0` und die im letzten Fix eingeführte Verrechnung wirkt nicht.

Beispiel AHW 3 / 2025, Unit 0001:
- Assignment: Vorname `Tobias`, Nachname `Johannes Baraniak`, unit_number `0001`
- Personenkonto: account_number `0001`, account_name `Hausgeld Johannes Baraniak`
- Aktuelles Match:
  - `padStart(5, "0")` → `"00001"` ≠ `"0001"` ❌
  - `account_name.includes("0001")` ❌
  - `account_name.includes("tobias")` ❌ (Konto enthält „Johannes")

## Fix — `src/components/finance/BillingSettlement.tsx`

Matching robuster machen. In `computeOwnerResult` (Zeilen ~877) den Block ersetzen:

```ts
// Vergleichbare Helfer
const unitRaw = String(assignment.unit_number || "").trim();
const unitDigits = unitRaw.replace(/^0+/, ""); // "0001" -> "1"
const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-zäöüß0-9 ]/g, " ").trim();

const contactTokens = [
  contact?.last_name,
  contact?.short_name,
  contact?.company_name,
  contact?.first_name,
]
  .filter(Boolean)
  .flatMap((s) => norm(s as string).split(/\s+/))
  .filter((t) => t && t.length >= 3); // Stop-Tokens wie "dr" raus

const personAcc = personenkontenAccounts.find((a: any) => {
  const accNum = String(a.account_number || "").trim();
  const accNumDigits = accNum.replace(/^0+/, "");
  // 1) Match per Unit-Nummer in beliebiger Zero-Padding-Variante
  if (unitDigits && accNumDigits === unitDigits) return true;
  // 2) Match per Namensbestandteil (Nachname/Short/Company priorisiert)
  const accNameNorm = norm(a.account_name);
  return contactTokens.some((tok) => accNameNorm.includes(tok));
});
```

Damit greift für Tobias (Unit 0001) sofort Regel (1); für historische Einträge mit abweichender Nummerierung greift Regel (2) über den Nachnamen `baraniak` bzw. `johannes`.

`signedTotalForAccount` und der Rest des Blocks bleiben unverändert. `ownerActualPaid`, `ownerUeberzahlung`, `result = ownerSpitze + ownerUeberzahlung` ebenfalls wie gehabt.

## Verifikation an AHW 3 / 2025

- Tobias (Unit 0001): `personAcc` = Konto 0001 „Hausgeld Johannes Baraniak", `ownerActualPaid = 4.440 €`, `ownerUeberzahlung = 210 €`, `result = 335,21 + 210 = 545,21 €`.
- Andere Eigentümer ohne Überbezahlung: `ownerUeberzahlung = 0`, Saldo unverändert.
- Gesamt-Saldo bleibt bei `2.029,10 €` (im letzten Fix bereits korrekt gestellt).

## Keine Änderungen nötig an

- `buildBillingPayload.ts` (Payload-Logik vom letzten Fix bleibt)
- DOCX-Vorlage `Einzelabrechnung_Vorlage_II.docx` (Felder `ueberzahlung_wpl_ihre`, `abrechnungssaldo_ihre`, `has_ueberzahlung` werden bereits korrekt befüllt — sie waren nur leer, weil das Match fehlte)
- DB-Schema

## Bonus-Hinweis (optional)

Wenn Du den Konten­namen ändern möchtest („Hausgeld Tobias Baraniak" statt „Johannes Baraniak"), funktioniert das ohne Code-Änderung dank Regel (1) (Unit-Nummer) trotzdem weiter. Empfehlung: Konten­bezeichnungen mit aktuellem Eigentümer-Nachnamen führen, das hilft auch der Bank-Abgleich-KI.
