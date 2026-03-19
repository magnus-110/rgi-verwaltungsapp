

## Adressen-System & Abrechnungsgrundlage

### Status: Iteration 2 abgeschlossen ✅

**Iteration 1** ✅: DB-Migration (7 Tabellen, RLS, SEPA-Generator) + Kontakte-Seite mit CRUD
**Iteration 2** ✅: Gebaeude-Zuordnung komplett:
- Neuer "Gebaeude"-Tab in Kontaktdetail mit Zuordnung, Einheit/Etage/Nutzung, Rolle, Bank-Override, Anteile
- BuildingContactsList im Gebaeude-Dashboard Personen-Tab (kompakte Ansicht mit aufklappbaren Details)
- AssignContactDialog zum Zuordnen bestehender oder neuer Kontakte
- Anteile/Verteilerschluessel (MEA, qm, Personen, etc.) pro Zuordnung

### Naechste Iterationen

**Iteration 3**: Kosten-Zuordnung (Hausgeld etc.) im Contact-Building-Assignment + Uebersicht
**Iteration 4**: Migration bestehender tenants/weg_owners Daten (optional)
