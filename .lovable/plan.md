

# Plan: Heizkosten-Workflow vollständig umsetzen — Konto 1400 als „Sammelkonto Brunata"

## Verstandenes Ziel (User-Workflow)

```text
Schritt 1 — Heizkosten-Umbuchung
  alle HK-Vorauszahlungs- & Aufwandskonten  →  1400
  (1410, 1431, 1440, 1470, 1471, 1472)
  Salden danach: 0 €    1400 = Summe ALLER HK-Bewegungen

Schritt 2 — Strom-Splitt nach Brunata-Bescheid
  Brunata sagt: vom Allgemeinstrom (1472) sind X € heizungsrelevant,
                                            Y € Allgemeinstrom (Treppenhaus etc.)
  Buchung:  1400 → 1050   in Höhe von Y €  (Allgemeinstrom-Anteil raus aus 1400)
  Konto 1050 zeigt am Ende den NICHT-heizungsrelevanten Stromanteil

Schritt 3 — Abrechnung
  In der Jahresabrechnung erscheint NUR Konto 1400 (Heizung/Warmwasser)
  als HK-Position mit Brunata-Verteilung, plus Konto 1050 als allg. Strom.
  Konten 1410/1431/1440/1470/1471/1472 sind nicht sichtbar (Saldo 0).
```

## Diagnose des aktuellen Zustands (Birkenweg 6 / 2025)

| Konto | Saldo aktuell | Repost? | Kommentar |
|---|---|---|---|
| 1400 Heizung/WW | −423,89 € | hat 4 Reposts | aber UI zeigt nur 1.443,81 € weil `heating_repost`-Filter aktiv |
| 1410 Brennstoffkauf | 0 € ✓ | ja | OK |
| 1431 Gerätemiete | −389,54 € | **nein** | nicht heizungsrelevant markiert, kein Repost erstellt |
| 1440 Heizungswartung | −134,17 € | **nein** | dito |
| 1470 VZ Gas | 0 € ✓ | ja | OK |
| 1472 VZ Strom | 0 € ✓ | ja | komplette 390,87 € auf 1400 umgebucht — Splitt fehlt |
| 1050 Allgemeinstrom | −111,68 € | – | nur direkte Stromrechnung, kein Anteil aus 1472 |

**Brunata-Soll: 5.148,99 €**. Aktuell auf 1400 nach Repost: 423,89 € + die durch Filter ausgeblendeten ~3.700 € = ~4.150 €. Es fehlen Wartung/Gerätemiete (523,71 €), und der Strom-Splitt 1400→1050 fehlt komplett. Daher matcht weder 5.148,99 € noch zeigt die UI den korrekten Wert.

## Lösung

### A) `chart_of_accounts` — Klassifizierung korrigieren (Migration)

```text
1431 Gerätemiete       → is_heating_relevant=true,  settlement_section=heating_prepayment (bleibt)
1440 Heizungswartung   → is_heating_relevant=true,  settlement_section=heating_prepayment (bleibt)
```

Damit werden sie beim nächsten „Umbuchung erstellen" automatisch mit auf 1400 gebucht.

### B) `HeatingRebookingSection.tsx` — bestehende Reposts beim Re-Generieren idempotent löschen

Aktueller Code löscht `booking_category='heating_repost'`-Buchungen vor Neugenerierung — das ist korrekt, ABER `getAccountTotal` filtert genau diese auch raus, daher wird beim 2. Lauf nicht doppelt gezählt. ✓ — kein Code-Fix nötig, nur Klassifizierung A) anwenden, dann „Neu generieren" klicken → alle 6 HK-Konten landen sauber auf 1400.

### C) Neuer Block in `HeatingRebookingSection.tsx` — „Strom-Splitt 1400 → 1050"

Nach erfolgter HK-Umbuchung erscheint ein zweiter Bereich:

```text
┌─ Strom-Splitt nach Brunata ───────────────────────────────┐
│ Konto 1400 enthält aktuell 5.148,99 €                     │
│ davon Allgemeinstrom-Anteil (lt. Brunata): [____] €       │
│ Zielkonto: [1050 Allgemeinstrom ▾]                        │
│ [Splitt-Buchung erstellen]                                │
└────────────────────────────────────────────────────────────┘
```

Erzeugt eine Buchung `account_id=1050, counter_account_id=1400, amount=Y, booking_category='heating_split'` zum Stichtag 31.12.

Danach: 1400 = 5.148,99 − Y (= Brunata-relevante Summe), 1050 = bisheriger Saldo + Y.

### D) `BillingSettlement.tsx` & `HeatingAccountsSection.tsx` — Repost-Filter erweitern

Filter `b.booking_category !== 'heating_repost'` ergänzen um `&& b.booking_category !== 'heating_split'`, damit der Strom-Splitt nicht doppelt zählt.

Anzeige in der Abrechnung: Konto 1400 zeigt jetzt korrekt den **Netto-Heizkostentopf nach Splitt** (= Brunata-Summe), Konto 1050 zeigt den vollen Allgemeinstrom inkl. Splittanteil.

### E) Validierung in `BrunataAllocationManager.tsx`

Statt „Σ Brunata-Werte vs. Konto 1400" die Differenz erst nach Strom-Splitt prüfen. Toleranz: < 0,50 €. Bei Treffer grüner Badge „Brunata = Konto 1400 ✓".

### F) Datenbank — neue `booking_category` Enum-Wert

`heating_split` zu enum hinzufügen (falls Constraint vorhanden) oder Constraint erweitern.

## Schritte

1. **Migration**: `chart_of_accounts` 1431/1440 → `is_heating_relevant=true`. Enum/Constraint `booking_category` um `heating_split` erweitern.
2. **HeatingRebookingSection.tsx**: Neuer Splitt-Block (Section C) mit Zielkonto-Auswahl und Betragseingabe.
3. **BillingSettlement.tsx + HeatingAccountsSection.tsx**: Filter um `heating_split` erweitern.
4. **BrunataAllocationManager.tsx**: Validierung nach Splitt.
5. **User-Aktion danach**: in der App „Umbuchungen löschen" → „Neu generieren" → Strom-Splitt 167,51 € (oder lt. Brunata) auf 1050 buchen → 1400 sollte exakt 5.148,99 € zeigen.

## Hinweis

Der Workflow funktioniert dann komplett wie beschrieben: HK-Konten werden auf 0 gesetzt, 1400 sammelt alles, der Brunata-irrelevante Stromanteil wird per zweiter Umbuchung auf 1050 geschoben, und die Abrechnung zeigt genau die zwei Endkonten 1400 (= Brunata) und 1050 (= Allgemeinstrom).

