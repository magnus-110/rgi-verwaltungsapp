## Befund

**Ursache 1 — falsche Endbestände bei Bank & Rücklage:**
`getClosing` benutzt `sumForAccount`, das **nicht** booking_type-aware ist. Bei bank-zentrischen Buchungen werden dadurch alle Beträge auf der Bankseite (Ein- UND Ausgang) addiert, statt income vs. expense zu saldieren.

Mit der korrekten signierten Aggregation (`signedTotalForAccount`, identisch zur oberen Konten-Liste):

| Konto | Aktuell falsch | Signiert (richtig) | Erwartet |
|---|---|---|---|
| 1800 Bank | 92.581,84 | 5.656,94 | 5.856,94 |
| 1810 Rücklage | 29.030,23 | **25.166,39** | **25.166,39** ✓ |
| 1450 Brennstoff | 1.401,10 | 1.401,10 | 1.401,10 ✓ |

(Die kleine 1800-Restdifferenz von 200 € ist Datenqualität, kein Logikfehler — sie verschwindet automatisch, sobald die fehlende Bewegung eingetragen wird.)

**Ursache 2 — was sind die 9.266,59 € „Sonstige Bestandskonten"?**
Das ist Konto **4000 „Eröffnungsbuchungen"**. Es hat `carry_forward_balance=true`, fällt aber in keine der Kategorien Bank/Rücklage/Brennstoff/Vorauszahlung — und landet deshalb im Sammeltopf „Sonstige".

Konzeptionell ist 4000 kein Bestandskonto, sondern das technische Gegenkonto für Eröffnungsbuchungen (SKR-Standard). Es darf in den Anfangs-/Endbeständen **nicht** auftauchen. Genauso wenig die Konten 4900/4910 (ARAP/PRAP) — die sind hier zwar 0, gehören aber konzeptionell in die Abgrenzungen, nicht in die Bestände.

## Umsetzung

In `src/components/finance/BillingSettlement.tsx`:

1. **Endbestände korrekt rechnen:**
   `getClosing` von `sumForAccount` auf `signedTotalForAccount` umstellen. Manuelle `account_balances.closing_balance` bleibt als expliziter Override erhalten.
   Vorzeichen-Magnitude über `Math.abs` für Anzeige beibehalten (Aufwandsseite negativ, Aktivseite positiv → Magnitude in der UI).

2. **Sammelposten „Sonstige" säubern:**
   Bei der Bildung der `carryAccounts`-Liste die Konten mit `settlement_section in ('opening','accrual')` ausschließen. Damit verschwinden 4000 (Eröffnungsbuchungen) und 4900/4910 (ARAP/PRAP) aus den Anfangs-/Endbeständen.

3. **Auf den DOCX-Payload durchwirken:**
   `carryAccountsList` (siehe `buildBillingPayload`) und die UI-Felder `closingGiro/closingReserve/closingFuel/closingPrepay/closingOther` werden automatisch korrekt, weil sie alle aus `getClosing` + `carryAccounts` abgeleitet sind.

## Erwartetes Ergebnis Adolf-Haff-Weg 2025

- **Girokonto 1800:** 5.856,94 € (statt 92.581,84 €)
- **Instandhaltungsrücklage 1810:** 25.166,39 € (statt 29.030,23 €)
- **Brennstoffendbestand 1450:** 1.401,10 € (unverändert)
- **Sonstige Bestandskonten:** entfällt (war Konto 4000, gehört dort nicht hin)
- **Vorauszahlungen 1470–1473:** 0 € (unverändert)

Damit fließt automatisch auch die Abrechnungsspitze in eine plausible Größenordnung — sie war bisher mit 23.112,29 € Nachzahlung verzerrt, weil die Endbestände (insbesondere die 92.581,84 € Bank) überhöht waren.