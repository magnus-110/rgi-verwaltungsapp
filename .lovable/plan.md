

# Plan: Adresssystem mit Personen als Kernelement umbauen

## Konzept

Eine **Adresse** (contact) wird zum Container, der mehrere **Personen** mit jeweils eigenen Kontaktdaten (Telefon, E-Mail, Bankverbindung) enthaelt. Unterscheidung nach Typ: Firma, Eigentuemer, Dienstleister, etc.

```text
┌─────────────────────────────────────┐
│ Adresse (contacts)                  │
│ - Typ: Firma / Eigentuemer / ...    │
│ - Kurzname, Firmenname              │
│ - Postadresse                       │
│ - Notizen                           │
│                                     │
│  ┌───────────────────────────┐      │
│  │ Person 1 (Hauptkontakt)  │      │
│  │ - Anrede, Vor-/Nachname  │      │
│  │ - Position / Rolle       │      │
│  │ - Telefone (1..n)        │      │
│  │ - E-Mails (1..n)         │      │
│  │ - Bankverbindungen (0..n)│      │
│  └───────────────────────────┘      │
│  ┌───────────────────────────┐      │
│  │ Person 2                  │      │
│  │ - (gleiche Felder)        │      │
│  └───────────────────────────┘      │
└─────────────────────────────────────┘
```

## Datenbank-Aenderungen

### 1. Neuer Enum `contact_type`
Werte: `person`, `company`, `owner_group`, `service_provider`

### 2. Tabelle `contacts` erweitern
- Neues Feld `contact_type` (default `person`)
- Felder `first_name`, `last_name`, `salutation` bleiben vorerst bestehen (Abwaertskompatibilitaet), werden aber in der UI nicht mehr direkt bearbeitet

### 3. Tabellen `contact_phones`, `contact_emails`, `contact_bank_accounts` erweitern
- Neues optionales Feld `person_id UUID REFERENCES contact_persons(id) ON DELETE CASCADE`
- Daten koennen so einer bestimmten Person zugeordnet werden (oder weiterhin nur dem Kontakt global, falls `person_id IS NULL`)

### 4. Datenmigration
- Fuer bestehende Kontakte mit `first_name`/`last_name` aber ohne `contact_persons`-Eintraege: Automatisch eine `contact_person` erstellen und bestehende Phones/Emails/Banks dieser Person zuordnen
- `contact_type` anhand `company_name` setzen (`company` wenn vorhanden, sonst `person`)

## UI-Aenderungen

### ContactDetail.tsx - Kompletter Umbau
- **Tab "Stammdaten"**: Zeigt nur noch Adress-Typ (Dropdown), Kurzname, Firmenname (nur bei Firma/Dienstleister), Postadresse, Notizen
- **Tab "Personen"** wird zum Haupt-Tab: Jede Person hat aufklappbare Bereiche fuer:
  - Name/Anrede/Position
  - Telefonnummern (dynamische Liste wie bisher, aber pro Person)
  - E-Mails (pro Person)
  - Bankverbindungen (pro Person)
- Tabs "Kommunikation" und "Bank" entfallen (sind jetzt pro Person)
- Tab "Gebaeude" bleibt

### ContactList.tsx
- Anzeige des Adress-Typs als kleines Badge (Firma, Eigentuemer, etc.)
- Anzeige des Hauptkontakt-Namens unter dem Adressnamen

### CreateContactDialog.tsx
- Typ-Auswahl ganz oben
- Mindestens eine Person muss angelegt werden
- Phones/Emails/Banks werden der ersten Person zugeordnet

### Email-System (Inbox.tsx)
- Beim Matching/Erstellen von Kontakten: Person wird zugeordnet, nicht nur der Kontakt
- Badge zeigt Firmenname + Personenname

### Gebaeude-System
- `contact_building_assignments` bleibt unveraendert (referenziert weiterhin `contact_id`)
- Anzeigelogik passt sich an: Zeigt Hauptkontakt-Person des zugeordneten Kontakts

## Dateien

| Datei | Aenderung |
|---|---|
| Migration SQL | Enum, Spalten, Datenmigration |
| `src/components/contacts/ContactDetail.tsx` | Personen-zentriertes Layout mit Phones/Emails/Banks pro Person |
| `src/components/contacts/ContactList.tsx` | Typ-Badge, Hauptkontakt-Anzeige |
| `src/components/contacts/CreateContactDialog.tsx` | Typ-Auswahl, Personen-basierte Erfassung |
| `src/pages/Contacts.tsx` | Contact-Interface um `contact_type` erweitern |
| `src/pages/Inbox.tsx` | Kontakt-Matching an neues Schema anpassen |

