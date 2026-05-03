## Analyse: Ist die App heute schon abbildbar?

**Ja, grundsätzlich** — der Manuell-Editor (`Planung & Berichte → Manuell anlegen`) deckt das Grundgerüst beider PDFs ab:
- Gesamtwirtschaftsplan = Tab "Gesamtwirtschaftsplan" (Konto, Bezeichnung, Plan-Saldo, Verteilungsschlüssel, Σ pro Jahr/Monat).
- Einzelwirtschaftsplan = Tab "Einzelwirtschaftspläne" (pro Eigentümer, mit MEA-Anteil, Override pro Zeile).

**Aber es fehlen mehrere Spalten und Berechnungen**, die HV-Office liefert. Die Eintragung wäre heute möglich, aber das Ausgabeformat sieht anders aus als das beigefügte PDF.

---

## Was fehlt / muss optimiert werden

### A) Gesamtwirtschaftsplan — fehlende Spalten

| HV-Office PDF | Status in App |
|---|---|
| **IST Vorjahr** je Konto | fehlt komplett — Spalte muss in `EconomicPlanLayout` ergänzt werden, Wert aus Buchungen Vorjahr (`sumForAccount` analog Edge-Function) |
| **Änd. %** (Plan vs. IST Vorjahr) | fehlt — abgeleitet, einfach berechnet |
| **Umlage per** (Schlüssel je Konto) | wird gespeichert, aber im Layout nur klein/optional gezeigt — sollte als eigene Spalte sichtbar sein |
| Trennzeichen `*` für umlagefähige Konten | fehlt — Flag `is_distributable` existiert in `chart_of_accounts`, müssen wir in der Anzeige als `*` voranstellen |
| Zeile **„davon umlagefähig"** | fehlt — Σ aller Konten mit `is_distributable = true` |
| **EURO pro QM und Monat** | fehlt — braucht Summe Wohnflächen aus `area_sqm_override` |

### B) Einzelwirtschaftsplan — fehlende Spalten und Logik

| HV-Office PDF | Status in App |
|---|---|
| Spalten **Ges Anteil / Ihr Anteil** (z. B. 1.000,000 / 127,000) | fehlt — heute nur Prozent-Anzeige, kein Tausendstel-Wert |
| Spalten **Ges Kosten / Ihre Kosten** | nur "Ihre Kosten" — Ges Kosten müsste aus dem Gesamtplan dazu |
| **Verteilungsschlüssel je Konto unterschiedlich** (Heizk.Abr, Einheiten, TG-Stellplätze, Ges.Tausendstel) | hier ist der größte Bug: heute wird **alles linear über MEA** verteilt. PDF nutzt aber je Konto den im COA hinterlegten `default_distribution_key`. Konkret: Verwaltergebühr nach `Einheiten`, TG-Verwaltung nach `stellplaetze`, Heizung nach `Heizk.Abr` (Brunata-Ergebnis), Rest nach `mea`. |
| Zeile **„auf Sie umlegbar"** mit Eigentümer-Summe | fehlt |
| **€ pro Monat** Gesamtbelastung | vorhanden (€/Monat-Spalte), aber keine Footer-Summe |
| **Aufteilung „davon EHR / davon Vorschuss"** im Footer | fehlt — braucht Trennung Konto 1720 (Plan IHR) vs. Rest |
| **Bankverbindung-Fußzeile** | fehlt im Einzelplan-Layout |
| **WPL-Nr.** (z. B. `w1002202600013112`) | fehlt — Identifier pro Einheit/Jahr |

### C) Distribution-Keys: kritischer Logikfehler

Im PDF werden **5 verschiedene Verteilungsschlüssel** parallel benutzt. In `share_type` existieren bereits: `mea`, `stellplaetze`, `einheit`, `qm`, `Heizk.Abr` (= über Brunata, fehlt noch). Der Manuell-Editor nutzt aber heute in `buildUnitRows()` einheitlich `proportion = mea`. → Wir müssen pro Konto den passenden Schlüssel anwenden.

### D) Was fehlt komplett

1. **Vorjahres-IST-Anbindung**: heute läuft Manuell-Editor isoliert — wir müssen optional eine Vorperiode verknüpfen, um IST-Spalte zu füllen (oder leer lassen, wenn keine vorhanden).
2. **Datumskontext**: PDF zeigt „01.01.2026 – 31.12.2026 / 365 Tage" — vorhanden, aber im PDF-Export müsste das mit raus.
3. **PDF-Export im HV-Office-Look**: aktuell zeigt die App nur den Editor-View. Es gibt noch keinen druckbaren Gesamt-/Einzelplan-PDF im exakt gewohnten Layout (`html2canvas + jsPDF`, Century Gothic / Work Sans wie im Memory dokumentiert).

---

## Plan zur Umsetzung

### Schritt 1 — Datenfluss erweitern (`ManualEconomicPlanEditor.tsx`)
- Neue Query `prev-year-bookings` (analog `generate-economic-plan` Edge-Function, mit `sumForAccount` für bank-zentrische Aggregation).
- `rows` um `previous_amount` und `change_pct` ergänzen.
- Property `building.area_sqm_total` (Summe aller `area_sqm_override`) berechnen → für €/QM/Monat.

### Schritt 2 — Layout erweitern (`EconomicPlanLayout.tsx`)
- Spalten: `Konto | Bezeichnung | Umlageschlüssel | IST Vorjahr | Plan-Saldo | Änd. %`.
- Marker `*` für `is_distributable=true`.
- Footer-Zeilen: `Σ Plan`, `davon umlagefähig`, `€ pro QM und Monat`.

### Schritt 3 — Einzelplan-Berechnung korrekt (`buildUnitRows`)
- Pro Account den passenden `share_type` aus `chart_of_accounts.default_distribution_key` lesen.
- `proportion` je Zeile aus dem entsprechenden `contact_building_shares`-Eintrag bzw. Building-Summe ermitteln.
- Spalten ergänzen: `Ges Anteil`, `Ihr Anteil`, `Ges Kosten` (= Plan-Saldo), `Ihre Kosten`.
- Heizung: Wenn Brunata-Heizk.Abr vorliegt → diesen Schlüssel; sonst Hinweis „Heizkosten erst nach Brunata-Abrechnung umlegbar".

### Schritt 4 — Footer Einzelplan
- Σ „auf Sie umlegbar".
- € pro Monat = Σ / 12.
- Davon EHR (Konto 1720 / Reservekonten) und Vorschuss (Rest) — nutzt vorhandenes `is_reserve_funded` Flag im COA.
- Bankverbindung: aus `building.bank_account_id` → IBAN und Bank-Name.

### Schritt 5 — PDF-Export (optional, separate Iteration)
- Druckbare Variante des Layouts mit html2canvas + jsPDF (analog ETV-PDFs), Century Gothic Headings + Work Sans Body.
- WPL-Nr. generieren: Schema `w{building_short}{year}{unit_no}3112`.

---

## Empfehlung

**Phase 1 (jetzt umsetzen, ohne DB-Migration):** Schritte 1–4. Damit kann man die zwei beigefügten PDFs **inhaltlich 1:1** in der App eintragen und der Bildschirm zeigt dieselben Spalten und Summen.

**Phase 2 (später):** PDF-Export im HV-Office-Look (Schritt 5).

**Keine DB-Migration nötig** — alle benötigten Felder (`is_distributable`, `is_reserve_funded`, `default_distribution_key`, `area_sqm_override`, `share_type` mit allen Varianten) sind bereits vorhanden.

Soll ich mit Phase 1 starten?
