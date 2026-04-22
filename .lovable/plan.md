

# Antwort + Umbau-Plan: Konten 1700/1710, Schritt 2 entfernen, Brunata-Gating, Abgrenzungen

## Teil A — Erklärung der Konten 1700 und 1710

| Konto | Aktuelle Bezeichnung | Realer Zweck | Beispiele für Buchungen |
|---|---|---|---|
| **1700** | „Summe I. Bewirtschaftungskosten" | **Falsch verwendet.** Es ist im SKR-Verwaltungsmodell ein **Summenausweis-Etikett** für die Gesamtabrechnung — kein Buchungskonto. In unserer DB ist es zusätzlich `settlement_section = 'reserve'` gesetzt, was inhaltlich nicht passt. | **Hier wird/sollte gar nicht gebucht werden.** Der Summenwert entsteht rechnerisch aus den Konten 1000–1499. |
| **1710** | „II. Beitragsverpflichtung IHR" | Sollkonto für die **planmäßige Zuführung zur Erhaltungsrücklage** laut Wirtschaftsplan (Forderung an die Eigentümer). | Beispiel WP 2025: 12.000 € IHR-Soll → 1710 an 0001/0002/0003 (Personenkonten, anteilig nach MEA). Bei Eingang Zahlung: 1800 (Bank) an 1710. |

**Echtes Rücklagenvermögen** liegt auf **1810** („Festgeld/Sparbuch"). **1800** ist das Girokonto. **1920** ist die rücklagenfinanzierte Reparatur (mit `is_reserve_funded=true`).

Beide Konten (1700, 1710) tauchen in der Saldenübernahme nur deswegen auf, weil sie versehentlich `carry_forward_balance=true` UND `settlement_section='reserve'` haben. Sie verfälschen die Übersicht und bringen den Nutzer zum Eintragen sinnloser Werte.

→ **Empfehlung: 1700 wird zu einem reinen Anzeige-/Pseudo-Konto. `carry_forward_balance` deaktivieren.** 1710 bleibt buchbar (Sollstellung IHR), aber `carry_forward_balance` ebenfalls deaktivieren — der Saldo ergibt sich aus Buchungen, nicht aus einem Vortrag.

---

## Teil B — Was umgebaut wird

### 1) Schritt 2 „Saldenübernahme" entfernen
Die Komponente `BalanceCarryForward` ist redundant: Die Grundlagen-Karten (Schritt 1) lesen Anfangsbestände bereits aus der Eröffnungsbuchung 4000 (oder manuell aus `account_balances`). Ein zweites Eingabe-UI verwirrt nur und führt zu doppelter Pflege.

- Aus `BillingTab.tsx` entfernen:
  - Import `BalanceCarryForward`
  - Den Block unter `step.id === "review"`, der `<BalanceCarryForward …/>` rendert, ersatzlos streichen. `BookingReviewSection` bleibt.
- Auto-Carry-Forward-Effekt (`useEffect` in `BillingTab.tsx`, Z. 65–134) entfernen — er kopiert nur Vorjahres-Closing-Balances ohne Mehrwert; die echte Quelle ist die 4000-Eröffnungsbuchung.
- `balanceStatus` und das daran gekoppelte Status-Hint im Sticky-StatusBar entfernen. Schritt „basics" zeigt grünen Status, sobald für alle relevanten Konten ein Anfangsbestand erkannt wurde.
- Die Datei `BalanceCarryForward.tsx` selbst behalten wir vorerst (keine harten Abhängigkeiten in anderen Tabs prüfen wir vor Löschung), aber sie wird nicht mehr eingebunden.

### 2) Konten 1700/1710 in der UI bereinigen (Datenpflege, keine Migration)
- `chart_of_accounts.carry_forward_balance` für **1700** und **1710** auf `false` setzen.
- 1700 zusätzlich `settlement_section = NULL` (es ist kein Rücklagen-, sondern ein Summenetikett).
- Damit verschwinden beide automatisch aus der Saldenübernahme-Tabelle und aus `SettlementBasicsStep` / `BillingSettlement` (Aggregationen filtern ohnehin auf `settlement_section`).

### 3) Brunata-Gating in Schritt 3
Aktuell kann der Nutzer Brunata-Werte eintragen, bevor die Brennstoffrechnungen vom Gegenkonto (z. B. 1410 Brennstoffkauf) auf **Konto 1400** (Sammelkonto Heizung/Warmwasser) umgebucht wurden. Folge: Die Summen-Prüfung „Brunata vs. 1400" schlägt fehl oder ergibt 0 €.

Neue Reihenfolge in `BillingTab.tsx` und Sperre im `BrunataAllocationManager`:
1. `HeatingAccountsSection` (Übersicht)
2. `FuelInventorySection` (Brennstoffrestbestände)
3. **`HeatingRebookingSection`** (Umbuchung 1410/1420/1430/… → 1400) — **wird vor Brunata gerendert**
4. **`BrunataAllocationManager`** — gesperrt, solange Konto **1400** keinen Saldo > 0 hat (per `sumForAccount(1400, bookings)`).
   - UI: Inputs disabled + Hinweisbanner „Bitte zuerst Heizkosten auf Konto 1400 umbuchen (Schritt 3.3)."
   - Sobald 1400 > 0 → Inputs aktiv, Summen-Check gegen 1400 läuft wie bisher.

### 4) Umgang mit Abgrenzungen (Schritt 4 „Accruals")
Status quo:
- `AccrualSection` zeigt Buchungen mit `service_period_from / service_period_to`, die das Wirtschaftsjahr überschreiten (z. B. Versicherungsprämie Nov 2025 – Okt 2026), und schlägt per KI Abgrenzungssplits vor.
- Dafür existieren `accrual_bookings`-Einträge sowie das Konto-Pattern `settlement_section = 'accrual'`.

Was fehlt / wird ergänzt:
- **Konto 4900 „Aktive Rechnungsabgrenzung (ARA)"** und **4910 „Passive Rechnungsabgrenzung (PRA)"** als Standardkonten anlegen, falls nicht vorhanden, mit `settlement_section='accrual'`, `carry_forward_balance=true`. Vorabprüfung nötig.
- Workflow: KI-Vorschlag akzeptieren → System bucht automatisch
  - Aufwand-Splittung: 4900 an Aufwandskonto (für den Anteil, der ins Folgejahr gehört)
  - Im Folgejahr automatischer Auflösungs-Booking-Vorschlag: Aufwandskonto an 4900
- In Schritt 1 (Grundlagen) zusätzlich Karte „Offene Abgrenzungen aus Vorjahr" anzeigen (Saldo 4900/4910 aus Vorjahresende), damit der Nutzer sieht, was zu Beginn des WJ aufzulösen ist.
- In `BillingSettlement` werden ARA/PRA-Konten beim Aufwand neutral ausgewiesen (keine Verteilung an Eigentümer, da bereits im Vorjahr/Folgejahr verteilt).

---

## Betroffene Dateien

**Bearbeitet**
- `src/components/finance/BillingTab.tsx` — Schritt 2 entfernen, Reihenfolge Schritt 3 ändern, Status-Logik anpassen
- `src/components/finance/BrunataAllocationManager.tsx` — Sperre + Hinweisbanner, wenn Saldo Konto 1400 = 0
- `src/components/finance/SettlementBasicsStep.tsx` — neue Karte „Offene Abgrenzungen Vorjahr" (Saldo 4900/4910)
- `src/components/finance/AccrualSection.tsx` — Auto-Booking beim Akzeptieren eines KI-Vorschlags (Buchung gegen 4900/4910)
- `src/components/finance/BillingSettlement.tsx` — ARA/PRA aus Aufwandsverteilung ausschließen

**Datenpflege (insert tool, keine Migration)**
- UPDATE `chart_of_accounts` SET `carry_forward_balance=false`, `settlement_section=NULL` WHERE `account_number='1700'`
- UPDATE `chart_of_accounts` SET `carry_forward_balance=false` WHERE `account_number='1710'`
- INSERT Standardkonten 4900 (ARA) und 4910 (PRA), falls nicht vorhanden, `settlement_section='accrual'`, `carry_forward_balance=true`

**Memory-Update**
- `mem://features/finance/abrechnungs-workflow-v5` — neue 4-Schritt-Reihenfolge (basics → review → heating mit Gating → accruals → settlement), Erklärung 1700/1710, ARA/PRA-Logik

---

## Reihenfolge nach Approval
1. Datenpflege 1700/1710 + ARA/PRA prüfen/anlegen
2. `BillingTab.tsx` umbauen (Schritt 2 raus, Heizkosten-Reihenfolge)
3. `BrunataAllocationManager` Gating
4. `AccrualSection` Auto-Booking gegen 4900/4910
5. `SettlementBasicsStep` Karte „Offene Abgrenzungen"
6. `BillingSettlement` ARA/PRA-Ausschluss
7. Memory aktualisieren

