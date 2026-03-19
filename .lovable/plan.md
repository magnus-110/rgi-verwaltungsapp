

# Plan: Nutzer-Einladung bei Gebäude-Zuordnung + System-Bereinigung

## Problem

Kontakte (`contacts` Tabelle) haben keine Verbindung zu Supabase Auth-Nutzern. Wenn ein Kontakt einem Gebäude zugeordnet wird, wird kein Login-Account erstellt und keine Einladungsmail verschickt. Die alte Nutzer-Erstellung (über `admin-create-user` Edge Function + Make.com Webhook) wird umgangen.

Zusätzlich: Die Dokumente-Tab (`BuildingFilesTab`) zeigt "keine Eigentümer", weil sie noch die alten Tabellen (`weg_owner_buildings`, `profiles`) abfragt statt das Kontakt-System.

## Loesung

### 1. Datenbank: `user_id` Spalte zu `contacts` hinzufuegen

- `ALTER TABLE contacts ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`
- Damit wird die Bruecke zwischen Kontakt-System und Auth-System geschlagen

### 2. Edge Function: `invite-contact-user` erstellen

Neue Edge Function die:
1. Prüft ob der Kontakt eine E-Mail in `contact_emails` hat (primär oder erste)
2. Prüft ob bereits ein Auth-User mit dieser E-Mail existiert
3. Falls nein: Erstellt Auth-User mit 6-stelligem Passwort (wie `admin-create-user`)
4. Erstellt/aktualisiert das `profiles`-Record (Rolle basierend auf `management_mode`: `weg_owner` oder `tenant`)
5. Speichert die `user_id` in der `contacts` Tabelle
6. Sendet den Make.com Webhook mit E-Mail + Passwort (bestehende Logik)
7. Falls ja (User existiert): Nur `contacts.user_id` verknüpfen, kein neues Passwort

### 3. Frontend: `AssignContactDialog` erweitern

- Nach erfolgreicher Gebäude-Zuordnung: Automatisch prüfen ob der Kontakt eine E-Mail hat
- Falls ja: Dialog/Checkbox anbieten "Einladung mit Zugangsdaten senden?"
- Bei Bestätigung: `invite-contact-user` Edge Function aufrufen
- Falls keine E-Mail: Hinweis anzeigen dass ohne E-Mail keine Einladung möglich ist

### 4. `BuildingFilesTab` auf Kontakt-System umstellen

- `fetchPersons()` query von `weg_owner_buildings`/`profiles` auf `contact_building_assignments` + `contacts` + `contact_emails` umstellen
- `PersonProfile` Interface anpassen: `contact_id` statt `user_id` verwenden
- Kontakt-Namen und -Emails aus dem Kontakt-System laden

## Technische Details

### Edge Function `invite-contact-user`

```
Input: { contact_id, building_id, management_mode }
Flow:
  1. Lookup contact + primary email from contact_emails
  2. Check existing auth user by email
  3. Create auth user if needed (6-digit password)
  4. Upsert profile record
  5. Update contacts.user_id
  6. Send Make.com webhook (existing MAKE_WEBHOOK_URL secret)
  7. Return { success, user_id, is_new_user, password? }
```

### Dateien die geaendert werden

| Datei | Aenderung |
|-------|-----------|
| Migration SQL | `contacts.user_id` Spalte |
| `supabase/functions/invite-contact-user/index.ts` | Neue Edge Function |
| `supabase/config.toml` | Function config |
| `src/components/contacts/AssignContactDialog.tsx` | Einladungs-Option nach Zuordnung |
| `src/components/buildings/BuildingFilesTab.tsx` | Query auf Kontakt-System umstellen |

