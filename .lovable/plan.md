
# Plan: Nova mit Verwalter-Kontaktdaten erweitern

## Ziel
Nova soll automatisch wissen, wer der Verwalter eines Gebäudes ist und dessen Kontaktdaten (Name, E-Mail, Telefon) bereitstellen können.

## Aktuelle Datenbankstruktur

Die benötigten Tabellen existieren bereits:
- **building_managers**: Verknüpft `building_id` mit `user_id` (Admin)
- **profiles**: Enthält `first_name`, `last_name`, `email`, `phone` der Admins

## Implementierung

### Edge Function anpassen (chat-with-ai/index.ts)

**Für Mieter (rent mode):**
```
Aktuell: Gebäudedaten werden geladen (Name, Adresse, Typ)
Neu: Zusätzlich Verwalter-Kontaktdaten über building_managers abrufen
```

**Für WEG-Eigentümer (weg mode):**
```
Aktuell: Gebäude werden aufgelistet, spezifisches Gebäude bei buildingId
Neu: Für jedes zugewiesene Gebäude den zuständigen Verwalter mit Kontaktdaten
```

### Neue Datenbankabfrage

Nach dem Laden der Gebäudedaten wird eine zusätzliche Abfrage durchgeführt:

```typescript
// Verwalter für Gebäude abrufen
const { data: managers } = await supabase
  .from('building_managers')
  .select(`
    building_id,
    profiles!user_id (
      first_name,
      last_name,
      email,
      phone
    )
  `)
  .eq('building_id', buildingId);
```

### Kontext für Nova

Der Kontext wird erweitert um:

```
Ihr zuständiger Verwalter:
Name: Maximilian Mustermann
E-Mail: max@rgi-immobilien.de
Telefon: 08363 12345
```

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/chat-with-ai/index.ts` | Verwalter-Abfrage hinzufügen, Kontext erweitern |

### Ablauf

```
Nutzer stellt Frage
        |
        v
  Edge Function
        |
        v
  Lade Profil + Gebäude
        |
        v
  NEU: Lade Verwalter für Gebäude
  aus building_managers + profiles
        |
        v
  Baue Kontext mit Verwalter-Info
        |
        v
  Nova antwortet mit korrekten Daten
```

### Beispielantwort von Nova

**Frage:** "Wer ist mein Verwalter?"

**Antwort:** "Ihr zuständiger Verwalter für das Gebäude Am Jürgenfeld 5 ist Maximilian Mustermann. Sie erreichen ihn unter max@rgi-immobilien.de oder telefonisch unter 08363 12345."
