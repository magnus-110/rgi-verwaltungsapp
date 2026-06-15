# Problem

In der Vorlage werden `{abrechnungssaldo_gesamt}` (Gebäude-Saldo) und `{abrechnungssaldo_ihre}` (Eigentümer-Saldo) in einer gemeinsamen Bedingung (`{#abrechnungssaldo_guthaben}` / `{#abrechnungssaldo_nachzahlung}`) gerendert. Die Bedingung wird aktuell aber **nur aus dem Eigentümer-Saldo** abgeleitet. Beim WEG kann das Gebäude in Summe ein Guthaben haben, der einzelne Eigentümer aber eine Nachzahlung (oder umgekehrt) — die Zeile zeigt dann ein falsches Vorzeichen/Label für den Gesamtbetrag.

# Lösung (sauberste Variante)

Jede Spalte bekommt ihre eigenen Sign-Flags und ihr eigenes Label. So kann die Vorlage Gesamt und Eigentümer-Anteil unabhängig behandeln.

## Code-Änderung
Datei: `src/components/finance/lib/buildBillingPayload.ts` (~Zeile 536–540)

Ergänzen (bestehende Felder bleiben für Rückwärtskompatibilität):

```ts
abrechnungssaldo_gesamt: fmtEUR(Math.abs(wegSaldo)),
abrechnungssaldo_gesamt_label: ghnz(wegSaldo),
abrechnungssaldo_gesamt_guthaben: wegSaldo >= 0,
abrechnungssaldo_gesamt_nachzahlung: wegSaldo < 0,

abrechnungssaldo_ihre: fmtEUR(Math.abs(ownerSaldo)),
abrechnungssaldo_ihre_label: ghnz(ownerSaldo),
abrechnungssaldo_ihre_guthaben: ownerSaldo >= 0,
abrechnungssaldo_ihre_nachzahlung: ownerSaldo < 0,

// Alt (bleibt, damit alte Vorlagen weiter funktionieren):
abrechnungssaldo_label: ghnz(ownerSaldo),
abrechnungssaldo_guthaben: ownerSaldo >= 0,
abrechnungssaldo_nachzahlung: ownerSaldo < 0,
```

Analog für die Abrechnungsspitze (Zeile 521–525): `abrechnungsspitze_gesamt_guthaben/_nachzahlung/_label` ergänzen, falls dort dasselbe Problem auftritt.

## Anpassung deiner Vorlage

Statt einer gemeinsamen Bedingung zwei getrennte Blöcke pro Spalte:

```
{#abrechnungssaldo_gesamt_guthaben}Guthaben Gebäude: {abrechnungssaldo_gesamt}{/abrechnungssaldo_gesamt_guthaben}
{#abrechnungssaldo_gesamt_nachzahlung}Nachzahlung Gebäude: {abrechnungssaldo_gesamt}{/abrechnungssaldo_gesamt_nachzahlung}

{#abrechnungssaldo_ihre_guthaben}Ihr Guthaben: {abrechnungssaldo_ihre}{/abrechnungssaldo_ihre_guthaben}
{#abrechnungssaldo_ihre_nachzahlung}Ihre Nachzahlung: {abrechnungssaldo_ihre}{/abrechnungssaldo_ihre_nachzahlung}
```

Oder kürzer mit den neuen `_label`-Feldern (zeigt automatisch "Guthaben"/"Nachzahlung"):

```
Abrechnungssaldo Gebäude ({abrechnungssaldo_gesamt_label}): {abrechnungssaldo_gesamt}
Ihr Anteil ({abrechnungssaldo_ihre_label}): {abrechnungssaldo_ihre}
```

# Alternative (kein Code-Change)

Wenn du den Code nicht anfassen willst: In der Vorlage `{abrechnungssaldo_gesamt}` einfach aus den GH/NZ-Bedingungen herausnehmen und stattdessen mit `{abrechnungssaldo_label}` als neutralem Text führen — das löst aber nicht das Vorzeichenproblem, wenn Gesamt und Ihr-Anteil unterschiedliche Richtungen haben.

# Empfehlung

Code-Variante umsetzen — ist abwärtskompatibel (alte Vorlagen funktionieren weiter) und du hast volle Kontrolle pro Spalte.
