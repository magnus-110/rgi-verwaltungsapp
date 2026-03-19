

## Adressen-System & Abrechnungsgrundlage

### Status: Iteration 5 abgeschlossen ✅

**Iteration 1** ✅: DB-Migration (7 Tabellen, RLS, SEPA-Generator) + Kontakte-Seite mit CRUD
**Iteration 2** ✅: Gebaeude-Zuordnung (Einheit, Etage, Nutzung, Rolle, Bank-Override, Anteile)
**Iteration 3** ✅: Kosten-Zuordnung komplett (Hausgeld, Ruecklage, Sonderumlage, etc.)
**Iteration 4** ✅: Migration bestehender weg_owners Daten in contacts-System
**Iteration 5** ✅: Nutzer-Einladung bei Gebäude-Zuordnung + System-Bereinigung:
- `contacts.user_id` Spalte (Brücke Kontakt ↔ Auth-System)
- `invite-contact-user` Edge Function (Auth-User + Profil + Make.com Webhook)
- AssignContactDialog: Checkbox "Einladung mit Zugangsdaten senden"
- BuildingFilesTab: Query auf `contact_building_assignments` umgestellt (statt Legacy-Tabellen)

### Naechste Schritte (optional)

**Danach**: Abrechnungs-Engine, Wirtschaftsplan-Generator, E-Mail-Integration
