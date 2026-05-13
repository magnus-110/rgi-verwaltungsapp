# Abgrenzungs-Vorzeichen korrigieren (HV-Office Konvention)

## Problem

In der Sektion „Abgrenzungen / Sollstellungen" werden aktuell **alle** Konten pauschal mit „−" angezeigt, weil der Renderer (`BillingSettlement.tsx`, Zeile 1080–1091) jede Nicht-Einnahmen-Sektion als Aufwand behandelt.

Buchhalterisch ist das falsch: Abgrenzungen verlagern Aufwand/Ertrag **zwischen Jahren**, daher hängt das Vorzeichen davon ab, in welche Richtung verlagert wird.

## Buchhalterische Regel (entspricht HV-Office-Screenshot)

Bezogen auf die Abrechnungssumme des **lfd. Jahres**:

| Konto-Bereich (SKR03 HV) | Bedeutung | Wirkung auf lfd. Jahr | Vorzeichen im Report |
|---|---|---|---|
| **4100–4119** | Ausgaben im lfd. J. **für Vorjahr** (ARA-Auflösung) | Aufwand wird **rausgenommen** | **negativ (−)** |
| **4120–4139** | Einnahmen im lfd. J. **für Vorjahr** | Einnahme wird **rausgenommen** | **positiv (+)** |
| **4160–4179** | Ausgaben im Folgejahr **für lfd. J.** (PRA-Bildung) | Aufwand wird **hinzugerechnet** | **positiv (+)** |
| **4180–4199** | Einnahmen im Folgejahr **für lfd. J.** | Einnahme wird **hinzugerechnet** | **negativ (−)** |
| **4020** WEG-Abrech.Sollstellung | Sollstellung an Eigentümer | reduziert Abrechnungsspitze | **negativ (−)** (wie heute) |

Merksatz: **Aus dem Jahr raus → Vorzeichen wie Originalbuchung. Ins Jahr rein → Vorzeichen umkehren.**

Im Screenshot rechnet die Zwischensumme dann sauber:
`-6.093,13 (4020) − 1.805,85 (4110) + 1.293,95 (4160) − 25,00 (4180) = −6.630,03 ✓`

## Technische Umsetzung

### 1. Klassifizierungs-Helper (neu)

Neue Datei `src/components/finance/lib/accrualSign.ts`:

```ts
// Liefert +1 oder -1 für die Anzeige in der Abrechnung
export function getAccrualDisplaySign(accountNumber: string): 1 | -1 {
  const n = parseInt(accountNumber, 10);
  if (Number.isNaN(n)) return -1;
  if (n >= 4100 && n <= 4119) return -1; // Ausg. lfd. J. für Vorjahr
  if (n >= 4120 && n <= 4139) return  1; // Einn. lfd. J. für Vorjahr
  if (n >= 4160 && n <= 4179) return  1; // Ausg. Folgejahr für lfd. J.
  if (n >= 4180 && n <= 4199) return -1; // Einn. Folgejahr für lfd. J.
  return -1; // 4020 + sonstige Abgrenzung: wie Aufwand
}

export function isAccrualAccount(accountNumber: string): boolean {
  const n = parseInt(accountNumber, 10);
  return n === 4020 || (n >= 4100 && n <= 4199);
}
```

### 2. Renderer anpassen — `BillingSettlement.tsx`

In `renderSection` (Zeile 1068–1151) und beim Abschnittsaldo:

- `renderSigned` darf für die **Sektion `accrual`** nicht pauschal "−" setzen.
- Stattdessen pro Konto: Magnitude × `getAccrualDisplaySign(acc.account_number)` anzeigen.
- Abschnittsaldo der Sektion = Summe der **bereits vorzeichenrichtig** umgerechneten Konten (nicht `getSectionSignedTotal` verwenden, das spiegelt nur Buchungs-Vorzeichen).

Konkret:
- Neue Hilfsfunktion `getAccrualSectionTotal()` in der Komponente:  
  `Σ totalAbs(acc) * getAccrualDisplaySign(acc.account_number)`
- `renderSigned` erhält für accrual-Sektion einen optionalen Modus, der `displayPositive` aus dem Konto-Vorzeichen ableitet (statt aus Sektion).
- `totalAccrual` (Zeile 386) bleibt als Magnitude für die Verteilungs-/Soll-Berechnung erhalten, aber für Anzeige wird der **signierte** accrual-Total benutzt.

### 3. Einzelabrechnung & Vermögensbericht prüfen

- In `BillingSettlement.tsx` Zeile 480–490 wird `accrual` aktuell aus der verteilbaren Summe ausgeschlossen → bleibt so (nachrichtlich).
- Die Anzeige in der **Einzelabrechnung** (Owner-PDF/HTML) muss dieselbe Konvention verwenden — gleiche Helper-Funktion dort einsetzen.
- DOCX-/PDF-Export (settlement edge function) ebenfalls anpassen, damit UI und Dokumente identisch bleiben (Memory: „PDF Aggregation Shared").

### 4. Validierung

Nach der Änderung muss im Beispiel-Screenshot gelten:
- 4020: −6.093,13 €
- 4110: −1.805,85 €
- 4160: **+1.293,95 €** (vorher fälschlich −)
- 4180: −25,00 €
- Zwischensumme „Abgrenzungen": **−6.630,03 €**

### 5. Memory-Update

Neuer Eintrag `mem://features/finance/abgrenzungs-vorzeichen` mit der obigen Tabelle, plus Verweis im Index unter „Core" als Kurzregel:  
„Abgrenzungen: 4100/4180 negativ, 4120/4160 positiv (Ins-Jahr-rein dreht das Vorzeichen)."

## Nicht im Scope

- Kontenrahmen wird nicht umnummeriert.
- Buchungs-Eingabe-Logik (Soll/Haben beim Buchen) bleibt unverändert — nur die **Anzeige** in Abrechnung/Bericht wird korrigiert.
