

## Adressen-System & Abrechnungsgrundlage

### Status: Iteration 4 abgeschlossen ✅

**Iteration 1** ✅: DB-Migration (7 Tabellen, RLS, SEPA-Generator) + Kontakte-Seite mit CRUD
**Iteration 2** ✅: Gebaeude-Zuordnung (Einheit, Etage, Nutzung, Rolle, Bank-Override, Anteile)
**Iteration 3** ✅: Kosten-Zuordnung komplett (Hausgeld, Ruecklage, Sonderumlage, etc.)
**Iteration 4** ✅: Migration bestehender weg_owners Daten in contacts-System:
- 21 Kontakte migriert (aus weg_owners)
- 21 E-Mail-Adressen, 16 Telefonnummern uebernommen
- 3 Gebaeude-Zuordnungen als Eigentuemer erstellt
- Bestehende weg_owner IDs als contact IDs wiederverwendet (Traceability)

### Naechste Schritte (optional)

**Danach**: Abrechnungs-Engine, Wirtschaftsplan-Generator, E-Mail-Integration

