

## Problem: Zwei verschiedene Kontenansichten zeigen unterschiedliche Daten

### Was du siehst

- **Buchen → Buchungen → Kontenplan-Ansicht** (`AccountPlanView.tsx`) — korrekt
- **Abrechnung → Schritt 1 „Buchungen prüfen"** (`BookingReviewSection.tsx`) — abweichend

Beide gruppieren Buchungen nach Konto, verwenden dafür aber **unterschiedliche Logik**.

### Ursache

| Aspekt | AccountPlanView (korrekt) | BookingReviewSection (falsch) |
|---|---|---|
| **Doppelte Buchführung** | Jede Buchung erscheint auf BEIDEN Konten (account_id + counter_account_id), Vorzeichen jeweils sauber gedreht | Buchung erscheint nur EINMAL — auf dem „Nicht-Bank"-Konto via Heuristik |
| **Konto-Auswahl** | nutzt beide Felder → vollständig | Heuristik: „falls Hauptkonto = Bank, nimm Gegenkonto, sonst Hauptkonto" |
| **Vorzeichen** | `booking_type` (income/expense) → +/− | `useCounter ? -amount : +amount` — fehleranfällig |
| **Anfangsbestände** | aus `account_balances` geladen + Saldo berechnet | gar nicht berücksichtigt |
| **Eröffnungsbuchungen 4000** | werden über bank-zentrische Logik erfasst | können auf falschem Konto landen |
| **Kategorien-Sortierung** | Aktiva → Passiva → Erträge → Aufwand (definierte Reihenfolge) | alphabetisch |
| **Gruppierung bei Buchungen ohne Bankkonto** | korrekt auf beiden Seiten | landen falsch, weil die Bank-Heuristik nicht greift |

**Konkret falsch in `BookingReviewSection`:**
1. Eine Umbuchung Konto X → Konto Y wird nur auf einem der beiden Konten angezeigt.
2. Heizkosten-Umbuchung 4xxx → 1400 erscheint je nach Heuristik auf einer Seite, statt auf beiden.
3. Eröffnungsbestände fehlen komplett → Saldenvergleich gegen Bankkonto unmöglich.
4. Kategorien-Reihenfolge ist nicht buchhalterisch (Aktiva/Passiva/Ertrag/Aufwand), sondern Alphabet.

### Lösung: Eine gemeinsame Anzeigelogik

Statt zwei parallele Implementierungen zu pflegen, wird die korrekte `AccountPlanView`-Logik zur **Single Source of Truth** für Konten-Gruppierungen.

**Änderungen:**

1. **`BookingReviewSection.tsx` umbauen**, damit die Konten-Aggregation identisch zur `AccountPlanView` arbeitet:
   - Jede Buchung doppelt erfassen (account_id + counter_account_id, Vorzeichen jeweils gedreht)
   - Konten aus `chart_of_accounts` laden, nicht über die Bank-Heuristik konstruieren
   - Anfangs-/Schlusssalden aus `account_balances` laden und anzeigen
   - Kategorien-Reihenfolge `asset → liability → equity → income → expense`

2. **Gemeinsamen Hook auslagern** (`src/components/finance/lib/useAccountAggregation.ts`):
   - Liefert `groupedAccounts`, `bookingsByAccount`, `balanceByAccount` einheitlich.
   - Wird von `AccountPlanView` UND `BookingReviewSection` genutzt.
   - Verhindert zukünftiges Auseinanderlaufen.

3. **Spezifische Review-Features bleiben erhalten** (Soll/Ist-Vergleich gegen Templates, KI-Prüfung, Vollständigkeitsbadge mit erwarteter Anzahl pro Konto).

### Generische Wirkung

Die Aggregations-Logik ist liegenschaftsunabhängig — jede Liegenschaft profitiert sofort. Auch andere zukünftige Konten-Übersichten (Kassenprüfung, Vermögensbericht, §35a) können den gemeinsamen Hook nutzen.

### Reihenfolge

1. `useAccountAggregation` Hook extrahieren (basierend auf `AccountPlanView`-Logik)
2. `AccountPlanView` auf den Hook umstellen — Verhalten unverändert
3. `BookingReviewSection` auf den Hook umstellen + Review-Badges/KI-Button beibehalten
4. Visuelle Konsistenz (Saldo-Spalten, Reihenfolge) angleichen

### Was du danach tun musst

Nichts. Reine Codebereinigung — beide Tabs zeigen ab sofort dieselben Zahlen.

