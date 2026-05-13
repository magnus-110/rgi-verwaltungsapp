## Ziel

1. Im Abrechnungs-PDF (und UI) wieder **Zwischensummen je Block** ausweisen (Einnahmen, umlagefähig, nicht umlagefähig, Heizkosten, Rücklage, Abgrenzungen).
2. **Einnahmen-Block aufsplitten** in drei feste Zeilen: *Vorschüsse zur Kostendeckung*, *Vorschüsse auf Erhaltungsrücklage (EHR)*, *Überzahlung Vorschüsse*. Berechnung neu — basiert auf Personenkonten + Konto 1930 + Hub-Hausgeldern.
3. Im Building-Hub das Feld **„davon EHR"** (`reserve_share_monthly`) bei Personen-Hausgeld **entfernen** (UI + Spalte bleibt in DB).

## Neue Berechnungslogik (Vorschüsse)

In `BillingSettlement.tsx` (Block ab Zeile 516–562) ersetzen wir die bisherige `reserve_share_monthly`-Aufteilung durch:

```text
sollHausgeldGesamt   = Σ über alle assignments × contact_building_costs (Hausgeld/Nebenkosten)
                       — bisherige Logik mit getCostAnnualAmount + timeProp,
                         aber OHNE Split via reserve_share_monthly
ehrAccountClosing    = Schlusssaldo Konto 1930 (settlement_section='reserve',
                       Name "Planmäßige IHR Wohnungen") via getEffectiveClosingBalance
sollKostendeckung    = sollHausgeldGesamt − ehrAccountClosing
sollEHR              = ehrAccountClosing
personenkontenClose  = Σ Schlusssaldo aller Personenkonten
                       (account_number Regex /^00\d{2}$/  und Name beginnt mit "Hausgeld ")
ueberzahlung         = personenkontenClose − sollKostendeckung − ehrAccountClosing
totalVorschuss       = sollKostendeckung + sollEHR + max(ueberzahlung, 0)
```

`hasReserveSplit` = `sollEHR > 0.005` (steuert ob die EHR-Zeile gerendert wird).
Überzahlung-Zeile wird nur gerendert wenn `|ueberzahlung| > 0.005`.

`abrechnungsspitze`/`abrechnungssumme` bleiben unverändert (nutzen `totalVorschuss`).

## Payload + Template

In `buildBillingPayload.ts`:

- `einnahmen_full` (virtuelle Vorzeile) ersetzen durch **drei** Vorzeilen:
  - `Vorschüsse zur Kostendeckung` → `sollKostendeckung`
  - `Vorschüsse auf Erhaltungsrücklage` → `sollEHR` (nur wenn > 0)
  - `Überzahlung Vorschüsse` → `ueberzahlung` (nur wenn ≠ 0)
  - …gefolgt von Buchungs-Einnahmen (Zinsen etc.)
- Neue Felder in totals durchreichen: `totalSollKostendeckung`, `totalSollEHR`, `totalUeberzahlung`, sowie String-Felder `sum_vorschuss_kostendeckung`, `sum_vorschuss_ehr`, `sum_vorschuss_ueberzahlung`.
- **Zwischensummen je Block** als eigene Felder + `_label`:
  - `sum_einnahmen` (bereits vorhanden)
  - `sum_bewirtschaftung_umlagefaehig` (vorhanden)
  - `sum_bewirtschaftung_nicht_umlagefaehig` (vorhanden)
  - `sum_heizkosten` (vorhanden)
  - `sum_ruecklage` (vorhanden)
  - `sum_abgrenzungen` (vorhanden)
  → keine neuen Felder nötig, aber wir liefern eine **Konvenienz-Variable** `subtotals` (Array) aus, damit das Template einen einzigen Loop für alle Blockzwischensummen nutzen kann (für v6.2 nicht nötig — die Felder existieren bereits, wir beleben nur den vom Nutzer aktuell vermissten Wert in UI/Doc).

## UI BillingSettlement

- Aktuelle Vorschuss-Anzeige (Zeilen ~1230–1280) erweitert um die neue Überzahlungs-Zeile.
- Im Einnahmen-Section (Tabelle) drei virtuelle Zeilen oben einfügen analog zur jetzigen Hausgeld-Zeile.

## Building-Hub: EHR-Feld entfernen

`src/components/contacts/BuildingContactsList.tsx` Zeilen ~1040–1055: das gesamte „davon EHR" Eingabefeld + Tooltip entfernen. `reserve_share_monthly` bleibt in DB & Type, wird nur nicht mehr im UI editiert und nicht mehr in der Berechnung gelesen. Default-Wert beim Anlegen neuer Hausgeld-Kosten auf `0` setzen.

## Technische Details

- Personenkonten-Erkennung: `account.account_number` matcht `/^00\d{2}$/` UND `account_name` startet mit `Hausgeld ` (Regex aus DB-Stichprobe bestätigt). Building-scoped (accounts werden bereits per `building_id` gefiltert in BillingSettlement).
- Konto 1930: `accounts.find(a => a.account_number === '1930')`. Falls nicht vorhanden → `ehrAccountClosing = 0`, Block "Vorschüsse auf EHR" wird ausgeblendet.
- Schlusssaldo via vorhandenen Helper `getEffectiveClosingBalance(acc.id, bookings, flatBalances, fiscalYear, opening4000Id)`.
- Keine DB-Migration nötig.

## Files to change

- `src/components/finance/BillingSettlement.tsx` — neue Vorschuss-Berechnung, UI-Erweiterung
- `src/components/finance/lib/buildBillingPayload.ts` — Payload (3 Vorzeilen + neue Summenfelder)
- `src/components/contacts/BuildingContactsList.tsx` — „davon EHR"-Feld entfernen

## Out of scope

- DOCX-Template selbst (v6.2) muss vom Nutzer im Word ergänzt werden um Platzhalter `{sum_vorschuss_kostendeckung}`, `{sum_vorschuss_ehr}`, `{sum_vorschuss_ueberzahlung}` falls separate Anzeige außerhalb des `{#einnahmen}`-Loops gewünscht. Die bestehenden `{#einnahmen}`-Loops + `{sum_einnahmen}` etc. funktionieren ohne Änderung weiter.
