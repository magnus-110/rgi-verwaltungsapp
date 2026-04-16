

## Plan: Kontenrahmen + §35a + Buchungshinweise in suggest-match

### Problemzusammenfassung
Die KI kennt weder den Kontenrahmen noch die §35a-Relevanzen noch die liegenschaftsspezifischen Buchungshinweise. Deshalb kann sie keine Konten vorschlagen und keine Steuerrelevanz erkennen.

### Änderungen

**1. `useTransactionAiPrefetch.ts` — Mehr Kontext laden und übergeben**

Drei zusätzliche Datenquellen laden (parallel zu den bestehenden):
- `chart_of_accounts` der Liegenschaft (globale + gebäudespezifische Konten)
- `booking_instructions` aus der `buildings`-Tabelle

Diese als `accounts` und `bookingInstructions` im Body an `suggest-match` übergeben.

**2. `suggest-match/index.ts` — Prompt + Schema erweitern**

- **Neue Eingabefelder** aus dem Request-Body: `accounts`, `bookingInstructions`
- **Kontenrahmen als Liste** in den User-Prompt einfügen (Format: `KONTO 1010 "Müllabfuhr" §35a=nein`)
- **Buchungshinweise** in den User-Prompt einfügen mit dem Hinweis "höchste Priorität"
- **§35a-Felder** im Tool-Schema ergänzen: `is_35a_relevant` (boolean) und `amount_35a` (number) in jedem `suggested_bookings`-Item
- **Gegenkonto** ergänzen: `counter_account_number` im Schema (Standard: "1800")

**System-Prompt-Erweiterung** mit WEG-Zuordnungswissen basierend auf dem echten Kontenrahmen:

```
Typische WEG-Kontenzuordnungen (aus deinem Kontenrahmen):
- Straßenreinigung → 1000, §35a JA
- Müllabfuhr / Restmüll → 1010, §35a NEIN
- Wasserversorgung → 1030, §35a NEIN
- Abwasser / Kanal → 1040, §35a NEIN
- Allgemeinstrom → 1050, §35a NEIN
- Hausmeister → 1060, §35a JA
- Winterdienst → 1061, §35a JA
- Hausreinigung → 1070, §35a JA
- Gartenpflege → 1080, §35a JA
- Ungezieferbekämpfung → 1090, §35a JA
- Wartung allgemein → 1100, §35a JA
- Aufzugwartung → 1103, §35a JA
- Grundsteuer → 1200, §35a NEIN
- Versicherungen → 1300, §35a NEIN
- Heizung/Warmwasser → 1400, §35a NEIN
- Brennstoffkauf → 1410, §35a NEIN
- Heizungswartung → 1440, §35a JA
- Vorauszahlungen Gas → 1470 (Vorauszahlungskonto!)
- Vorauszahlungen Fernwärme → 1471
- Vorauszahlungen Strom → 1472
- Vorauszahlungen Wasser → 1473
- Verwaltervergütung → 1500, §35a NEIN
- Bankgebühren → 1520, §35a NEIN
- Instandhaltung/Reparaturen → 1600, §35a JA
- Gegenkonto Bank → 1800

Abschlagszahlungen: Buche auf Vorauszahlungskonto (1470-1473), NICHT auf Aufwandskonto.
```

**§35a-Regeln** im Prompt:
- `is_35a_relevant = true` bei Arbeitsleistungen (Hausmeister, Reinigung, Gartenpflege, Wartung, Winterdienst, Schädlingsbekämpfung)
- `is_35a_relevant = false` bei reinem Material, Energie, Versicherungen, Steuern, Bankgebühren
- `amount_35a` = geschätzter Netto-Arbeitsanteil des Buchungsbetrags

### Dateien

| Datei | Änderung |
|---|---|
| `src/hooks/useTransactionAiPrefetch.ts` | `chart_of_accounts` + `buildings.booking_instructions` laden, als `accounts`/`bookingInstructions` übergeben |
| `supabase/functions/suggest-match/index.ts` | Kontenrahmen + Buchungshinweise in Prompt, §35a + counter_account im Schema, WEG-Zuordnungstabelle |

### Keine DB-Migration nötig

