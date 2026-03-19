

## Adressen-System & Abrechnungsgrundlage

### Status: Iteration 5 abgeschlossen ✅

**Iteration 1** ✅: DB-Migration (7 Tabellen, RLS, SEPA-Generator) + Kontakte-Seite mit CRUD
**Iteration 2** ✅: Gebaeude-Zuordnung (Einheit, Etage, Nutzung, Rolle, Bank-Override, Anteile)
**Iteration 3** ✅: Kosten-Zuordnung komplett (Hausgeld, Ruecklage, Sonderumlage, etc.)
**Iteration 4** ✅: Migration bestehender weg_owners Daten in contacts-System
**Iteration 5** ✅: Nutzer-Einladung bei Gebäude-Zuordnung + System-Bereinigung

## Finanzmodul

### Status: Stufe 1 abgeschlossen ✅

**Stufe 1** ✅: Kontenrahmen + Finanzseite (Grundlage)
- 4 DB-Tabellen: `chart_of_accounts`, `building_account_overrides`, `invoices`, `bookings`
- ~90 Konten aus RGI-Kontenrahmen als Seed-Daten eingefügt
- Finanzseite `/finanzen` mit 4 Tabs (Kontenrahmen, Verteilerschlüssel, Rechnungen, Buchungen)
- Sidebar-Integration + BuildingDashboard Finanz-Tab
- Storage-Bucket `invoices` für PDF-Ablage

### Nächste Schritte
- **Stufe 2**: OCR-Integration (Mistral) für Rechnungsextraktion
- **Stufe 3**: Make.com Webhook für automatische Kontenzuordnung
- **Stufe 4**: Kontoauszugs-Abgleich (CAMT.053 Parser)
- **Stufe 5**: Abrechnungs-Engine (Gesamt-, Einzelabrechnung, Wirtschaftsplan)
