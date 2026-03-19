

## Adressen-System & Abrechnungsgrundlage

### Status: Iteration 1 abgeschlossen ✅

**Umgesetzte Aenderungen:**

1. **DB-Migration**: 7 neue Tabellen erstellt (contacts, contact_phones, contact_emails, contact_bank_accounts, contact_building_assignments, contact_building_shares, contact_building_costs)
2. **Enums**: contact_usage_type, contact_building_role, share_type, cost_interval
3. **RLS**: Admin/Employee ALL auf allen Tabellen
4. **SEPA-Generator**: Trigger generiert automatisch Mandatsreferenzen (RGI-SEPA-000001)
5. **Kontakte-Seite** (`/contacts`): Master-Detail Layout mit Suche, CRUD fuer Stammdaten, Telefon, Email, Bankverbindungen
6. **Navigation**: "Adressen" mit BookUser-Icon in AdminSidebar

### Naechste Iterationen

**Iteration 2**: Gebaeude-Zuordnung (Assignment-Dialog, Einheit/Etage/Nutzung, Anteile)
**Iteration 3**: Kosten-Zuordnung + Uebersicht im Gebaeude-Dashboard (Personen-Tab)
**Iteration 4**: Migration bestehender tenants/weg_owners Daten (optional)
