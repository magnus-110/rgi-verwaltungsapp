# §35a Bescheinigung – Buchungen aus §35a-Positionen + Verteilerschlüssel je Konto

## Zielbild

Im Reiter **Finanzen → Planung & Berichte → §35a Bescheinigung** sollen:

1. **Alle Buchungen sichtbar werden**, die beim Buchen mit einer §35a-Position versehen wurden (Quelle = `bookings.amount_35a > 0` bzw. `is_35a_relevant = true`, nicht mehr abhängig vom Konto-Flag).
2. Jede Position **nach dem im Kontenplan hinterlegten Verteilerschlüssel** (`chart_of_accounts.default_distribution_key`) auf die Eigentümer verteilt werden – also pro Aufwandskonto unterschiedlich (MEA, Einheit, Personen, m², Stellplätze, Heizk.-Abr.).
3. Pro Eigentümer eine **Bescheinigung als PDF** im Layout der Vorlage erzeugbar sein, plus „Alle als ZIP".

## Datenquelle (geändert ggü. heute)

`Paragraph35aSection.tsx` lädt:

- **Buchungen**: `bookings` für Periode/Building, gefiltert auf `is_35a_relevant = true OR amount_35a IS NOT NULL`, inkl. `id, booking_date, description, amount, amount_35a, account_id, counter_account_id, invoice_id, invoices(invoice_number, invoice_date, supplier_name)`.
- **Konten**: `chart_of_accounts` für alle in den Buchungen vorkommenden `account_id`/`counter_account_id`, Felder `id, account_number, account_name, account_type, default_distribution_key`. Aufwandsseite je Buchung = das Nicht-Bank/Geld-Konto (Helper aus `accountClassification.ts`).
- **Verteilerschlüssel je Konto**: `default_distribution_key` ∈ `{mea, einheit, qm, stellplaetze, personen, heizk_abr}` (siehe Memory „Economic Plan HV-Office Alignment").
- **Eigentümer/Einheiten**: `contact_building_assignments` (eigentuemer, aktiv) inkl. `unit_number, unit_kind, billing_mode, parent_assignment_id, contacts(...)` und `contact_building_shares(share_type, share_value)` für **alle** verwendeten Schlüssel (mea, qm, personen, einheiten, stellplaetze). Sub-Units (Stellplatz etc.) werden weiterhin der Hauptwohnung des Eigentümers zugeschlagen (bestehende Logik).
- **Heizkostenabrechnung** (`heizk_abr`): Pro Einheit Anteil aus `heating_distribution_*`-Tabelle wie im Settlement (gleiche Quelle wie Abrechnungs-Workflow); falls für Konto kein Brunata-Datensatz vorhanden → Konto wird im PDF mit Hinweis „keine Brunata-Daten – nicht verteilt" angezeigt (kein MEA-Fallback, vgl. Memory „HV-Office Settlement Layout").
- **Stammdaten**: `buildings` (Name, Adresse), Periode (`period_start/end`), Verwalter-Anschrift für Briefkopf.

## Verteilungs-Logik

Pro **Aufwandskonto** wird ein eigener Block je Eigentümer berechnet:

```
key      = account.default_distribution_key   // mea | einheit | qm | personen | stellplaetze | heizk_abr
share(o) = Anteilswert des Eigentümers o nach key
total    = Σ share(o) über alle aktiven Eigentümer
ratio(o) = share(o) / total
```

Pro Buchung b dieses Kontos:

```
lohnanteil   = b.amount_35a ?? b.amount   // konsolidierte 35a-Logik bleibt
ihrAnteil(o) = lohnanteil * ratio(o)
```

Konto-Summe je Eigentümer = Σ ihrAnteil(o) aller Buchungen des Kontos.
Gesamt-Bescheinigung = Σ über alle §35a-Konten.

Helper `getOwnerShare(owner, key)`:
- `mea` → `share_value` (mea) inkl. Sub-Unit-Aufschlag (bestehende `extraMeaByContact`-Logik)
- `einheit` → 1 pro Hauptwohnung
- `qm` → `share_value` (qm)
- `personen` → `share_value` (personen)
- `stellplaetze` → Anzahl Stellplatz-Sub-Units des Owners
- `heizk_abr` → Anteil aus Brunata-Tabelle für die Einheit; ohne Datensatz: 0

## UI in `Paragraph35aSection.tsx`

1. **Karte „§35a-Buchungen"** (ersetzt heutige „Kosten nach Konto"):
   - Tabelle gruppiert nach Konto (Header: `KontoNr KontoName • Verteilerschlüssel-Badge`).
   - Spalten je Buchung: **Datum | Beleg (description + invoice meta) | Gesamt | §35a-Lohnanteil**.
   - Zwischensumme je Konto, Gesamtsumme unten.
   - Leerzustand pro Konto, falls keine §35a-Buchungen gefunden.

2. **Karte „Verteilung je Eigentümer"** (Übersichtsmatrix):
   - Spalten: Einheit | Eigentümer | je Konto eine Spalte mit **„Ihre Kosten"** | Summe.
   - Footer: Gesamtsummen je Konto + Gesamtsumme.

3. **Karte „Bescheinigungen"**:
   - Zeile pro Eigentümer mit Button **„PDF erstellen"**.
   - Kopfaktion **„Alle als ZIP"** → sequentielles Rendering, Download `35a_Bescheinigungen_<Jahr>.zip` (jszip).

## PDF je Eigentümer

Neue Komponente `src/components/finance/Paragraph35aCertificatePdf.tsx` (html2canvas + jsPDF, A4, Century Gothic Headings / Work Sans Body wie im ETV-PDF):

Inhalt 1:1 zur Vorlage:
- **Briefkopf**: RGI-Logo, „Verkauf · Vermietung · Verwaltung", Absenderzeile.
- **Empfängerblock**: Anrede + Vor-/Nachname + Anschrift des Eigentümers.
- **Meta-Tabelle rechts**: Nummer (`a<buildingShort><year><unit4>3112`), erstellt am, Abr. ab/bis, Zeitraum (Tage), Einheit (Nr. + Lage).
- **Titel**: `WEG <Gebäude>` + `Haushaltsnahe Leistungen <Jahr> für die Einheit <Nr>, <Lage>`.
- **Tabelle je Konto** (Header = `<KontoNr.000> <Bezeichnung> – <Verteilerschlüssel-Bezeichnung>`):
  - Spalten **Beleg | Gesamt EUR | Lohnkosten EUR | Gesamtanteil | Ihr Anteil | Ihre Kosten EUR**.
  - „Gesamtanteil" und „Ihr Anteil" werden je Verteilerschlüssel passend formatiert (z. B. `1.000,000 / 185,470` für MEA-Tausendstel; bei `einheit` → `n / 1`; bei `personen`/`qm`/`stellplaetze` → reale Werte; bei `heizk_abr` → Brunata-Anteil in %).
  - Zwischensumme je Konto.
- **Fußtext**: „Die Hausverwaltung teilt die Aufwendungen … Haftung ausgeschlossen."
- **Seitenfuß**: „Seite 1 von 1".

Export-API:
- `generate35aPdf(owner, ctx)` → einzelner Download.
- `generate35aZip(owners, ctx)` → ZIP, sequenziell mit kurzen `await`-Pausen für Stabilität.

## Edge Cases / Regeln

- Buchungen **ohne** `amount_35a` UND ohne `is_35a_relevant=true` werden ignoriert (auch wenn Konto §35a-relevant flagged ist).
- Storno (`status = 'cancelled'`) ausgeschlossen.
- Konto ohne `default_distribution_key` → Default `mea` + Warn-Badge im UI.
- Eigentümer mit Anteil 0 nach Schlüssel → 0,00 € in seiner Spalte (PDF-Zeile bleibt, Wert „0,00").

## Dateien

**Neu**
- `src/components/finance/Paragraph35aCertificatePdf.tsx` – PDF-Renderer + Export-Funktionen.
- `src/components/finance/lib/paragraph35aDistribution.ts` – pure Berechnungs-Helper (`getOwnerShare`, `buildAccountDistribution`, `buildOwnerCertificate`), wiederverwendbar für UI + PDF + spätere Tests.

**Geändert**
- `src/components/finance/Paragraph35aSection.tsx` – neue Datenquelle (Buchungs-basiert), Konto-gruppierte Tabelle, Verteilungsmatrix, Eigentümer-Buttons, ZIP-Aktion, zusätzliche Queries (Heizk., Konten, Stammdaten).

**Unverändert**
- DB-Schema, Edge Functions, RLS, Section35aEditor, Buchungs-Erfassung.

## Out of scope

- Kein Mailversand/DMS-Upload der PDFs.
- Keine Änderungen an Buchungs-Erfassung oder Konten-Flags.
- Keine Migration.
