

## Adressen-System & Abrechnungsgrundlage

### Status: Iteration 3 abgeschlossen ✅

**Iteration 1** ✅: DB-Migration (7 Tabellen, RLS, SEPA-Generator) + Kontakte-Seite mit CRUD
**Iteration 2** ✅: Gebaeude-Zuordnung (Einheit, Etage, Nutzung, Rolle, Bank-Override, Anteile)
**Iteration 3** ✅: Kosten-Zuordnung komplett:
- Kosten-CRUD im Kontakt-Detail (Gebaeude-Tab, pro Zuordnung)
- Kostenarten: Hausgeld, Ruecklage, Sonderumlage, Heizkosten, Nebenkosten, Miete, Stellplatz, Garage
- Intervalle: monatlich, quartal, jaehrlich
- Kosten-Anzeige in BuildingContactsList (Gebaeude Personen-Tab) als Badge
- Hausgeld-Badge in kompakter Kontakt-Header-Ansicht

### Naechste Schritte (optional)

**Iteration 4**: Migration bestehender tenants/weg_owners Daten in contacts-System
**Danach**: Abrechnungs-Engine, Wirtschaftsplan-Generator, E-Mail-Integration
