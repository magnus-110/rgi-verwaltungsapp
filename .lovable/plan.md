

## Adressen-System & Abrechnungsgrundlage

### Bewertung deines Vorschlags

Dein Konzept ist durchdacht und bildet exakt die Realitaet der WEG-Verwaltung ab. Besonders gut:
- Trennung von Stammadresse (global) und gebaeudespezifischen Daten (Einheit, MEA, Nutzung)
- Mehrfach-Telefon und -Email
- SEPA-Mandatsnummer fuer Lastschriften
- Verteilerschluessel als separate Zuordnung

### Optimierungsvorschlaege

1. **Anreden als eigene Tabelle** statt Enum -- damit spaeter weitere hinzugefuegt werden koennen ohne Migration
2. **Bankverbindungen als eigene Tabelle** -- eine Person kann mehrere Bankverbindungen haben (z.B. eine pro Gebaeude). IBAN-Validierung clientseitig.
3. **Kostenarten (cost_types)** als konfigurierbare Tabelle -- damit Hausgeld, Ruecklagen, etc. flexibel definiert werden koennen
4. **Verteilerschluessel-Typen** als Tabelle -- MEA, Einheit, qm, Personen, etc. koennen pro Gebaeude konfiguriert werden
5. **Historisierung**: `valid_from`/`valid_to` auf gebaeudespezifischen Daten, damit Eigentuemerwechsel nachvollziehbar sind (spaeter fuer Abrechnung kritisch)

### Datenbankstruktur

```text
contacts                          # Stammdaten (global)
├── id, salutation, first_name, last_name, company_name
├── address_street, address_zip, address_city
├── notes
├── created_at, updated_at
│
├── contact_phones              # 1:n Telefonnummern
│   ├── phone_number, label (Mobil, Festnetz, Buero...)
│
├── contact_emails              # 1:n E-Mail-Adressen
│   ├── email, label, is_primary
│
└── contact_bank_accounts       # 1:n Bankverbindungen
    ├── account_holder, bank_name, iban, bic
    ├── sepa_mandate_ref (auto-generiert), sepa_mandate_date
    ├── is_default

contact_building_assignments    # Zuordnung Kontakt <-> Gebaeude
├── contact_id, building_id
├── unit_number, floor_location (Freitext)
├── usage_type (enum: selbstbewohnt, zweitwohnsitz, vermietet, fewo, leerstand)
├── usage_since (date)
├── role_in_building (enum: eigentuemer, mieter, verwalter, beirat)
├── bank_account_id (FK -> contact_bank_accounts, optional Override)
├── notes
├── is_active, valid_from, valid_to

contact_building_shares         # Anteile/Verteilerschluessel
├── assignment_id (FK -> contact_building_assignments)
├── share_type (enum: mea, einheit, qm, personen, garagen, stellplaetze, wasser, warmwasser, heizkosten)
├── share_value (numeric)

contact_building_costs          # Kosten-Zuordnung
├── assignment_id (FK -> contact_building_assignments)
├── cost_type (text: hausgeld, ruecklage, etc.)
├── amount (numeric)
├── interval (enum: monatlich, quartal, jaehrlich)
├── valid_from, valid_to
```

### Warum diese Struktur fuer Abrechnungen funktioniert

- **Wirtschaftsplan**: `contact_building_costs` (Soll-Werte) + `contact_building_shares` (Verteilerschluessel) ermoeglichen automatische Berechnung
- **Hausgeldabrechnung**: Ist-Kosten des Gebaeudes werden ueber Verteilerschluessel auf Eigentuemer verteilt. Die `share_value` pro `share_type` ist der Schluessel
- **SEPA-Lastschrift**: `sepa_mandate_ref` + IBAN aus `contact_bank_accounts` (oder Override per Gebaeude)
- **KI-lesbar**: Alle Daten sind normalisiert, relational, und ueber einfache JOINs abfragbar -- ideal fuer LLM-basierte Abfragen

### UI-Design

**Neue Seite: `/contacts`** (Navigation: "Adressen" mit ContactsBook-Icon)

Master-Detail-Layout (wie Gebaeude):
- Links: Kontaktliste mit Suche, alphabetisch sortiert
- Rechts: Kontaktdetail mit Tabs (Stammdaten, Gebaeude-Zuordnungen, Bankverbindungen)

**Im Gebaeude-Dashboard (Personen-Tab)**:
- "Person zuordnen" oeffnet Dialog zum Auswaehlen eines bestehenden Kontakts oder Erstellen eines neuen
- Pro Person wird angezeigt: Name, Einheit, MEA, Hausgeld -- kompakt
- Klick klappt Details auf: Nutzungsart, Bankverbindung, alle Anteile, Kosten, Notizen

### Migrationsplan

1. Neue Tabellen erstellen (contacts, contact_phones, contact_emails, contact_bank_accounts, contact_building_assignments, contact_building_shares, contact_building_costs)
2. RLS-Policies (Admin/Employee: ALL, spaeter ggf. Eigentuemer: SELECT auf eigene Daten)
3. SEPA-Mandatsnummer-Generator als DB-Funktion

### Implementierungs-Iterationen

**Iteration 1**: DB-Migration + Kontakte-Seite (CRUD Stammdaten, Telefon, Email, Bankverbindungen)
**Iteration 2**: Gebaeude-Zuordnung (Assignment-Dialog, Einheit/Etage/Nutzung, Anteile)
**Iteration 3**: Kosten-Zuordnung + Uebersicht im Gebaeude-Dashboard
**Iteration 4**: Migration bestehender tenants/weg_owners Daten in das neue contacts-System (optional, Kompatibilitaet)

### Vorbereitung fuer E-Mail & Abrechnung

- `contact_emails` mit `is_primary` ist direkt nutzbar fuer spaeteres E-Mail-Modul (Zuordnung eingehender Mails zu Kontakten)
- Kostenstruktur + Verteilerschluessel sind die Basis fuer Abrechnungs-Engine
- `valid_from/valid_to` ermoeglicht zeitraumbezogene Abrechnungen bei Eigentuemerwechsel

### Navigation (aktualisiert)

```text
Dashboard | NOVA | Aufgaben | Kalender | Meldungen | Gebaeude | Adressen | Chatbot | Einstellungen
```

