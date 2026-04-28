## Problem

Beim Löschen einer Zuordnung (`contact_building_assignments`) wirft die DB:
> `update or delete on table "contact_building_assignments" violates foreign key constraint "etv_attendees_assignment_id_fkey" on table "etv_attendees"`

Ursachen:
1. `etv_attendees.assignment_id` und `etv_votes.assignment_id` referenzieren `contact_building_assignments(id)` **ohne `ON DELETE`-Regel** → die DB blockiert das Löschen.
2. Der aktuelle Frontend-Pfad (`BuildingContactsList.removeAssignment`, Zeile 281) macht ein nacktes `DELETE` auf der Assignment-Zeile und kümmert sich weder um ETV-Records noch um den verknüpften Auth-Account.
3. Es gibt aktuell keine Logik, die nach dem Entfernen der Assignment prüft, ob der Kontakt noch andere Building-Assignments hat — und entsprechend den Auth-Account löscht oder erhält.

## Ziel-Verhalten

Beim Entfernen einer Person aus einem Gebäude:

1. **Assignment selbst** + alle abhängigen Sub-Records (Shares, Costs, Bank-Defaults, ETV-Anwesenheiten/Stimmen, Sub-Assignments für Stellplatz/Hobbyraum) löschen.
2. **Auth-Account-Logik** danach:
   - Hat der Kontakt **noch andere** `contact_building_assignments` → Account bleibt; nur `weg_owner_buildings` / `tenants`-Eintrag für **dieses** Gebäude entfernen, damit der User dieses Gebäude nicht mehr sieht.
   - Hat der Kontakt **keine weiteren** Assignments → Auth-User komplett löschen (`auth.admin.deleteUser`), `profiles` per Cascade weg, `contacts.user_id` auf `NULL` setzen. Der **Kontakt selbst bleibt** im Adressbuch erhalten.

## Umsetzung

### 1. DB-Migration: Cascade-Regeln auf ETV-FKs

```sql
ALTER TABLE etv_attendees
  DROP CONSTRAINT etv_attendees_assignment_id_fkey,
  ADD  CONSTRAINT etv_attendees_assignment_id_fkey
       FOREIGN KEY (assignment_id)
       REFERENCES contact_building_assignments(id) ON DELETE CASCADE;

ALTER TABLE etv_votes
  DROP CONSTRAINT etv_votes_assignment_id_fkey,
  ADD  CONSTRAINT etv_votes_assignment_id_fkey
       FOREIGN KEY (assignment_id)
       REFERENCES contact_building_assignments(id) ON DELETE CASCADE;
```

Begründung: Wenn die Person nicht mehr Eigentümer/Mieter ist, sind ihre ETV-Anwesenheits- und Stimmrecords aus diesem Gebäude für diese Liegenschaft ohnehin obsolet. Falls du historische ETV-Stimmen archivieren willst, sage Bescheid — dann nutzen wir stattdessen `ON DELETE SET NULL` + nullable `assignment_id` (größere Anpassung).

### 2. Neue Edge Function `remove-contact-from-building`

Server-seitig (Service Role nötig für `auth.admin.deleteUser`). Ablauf:

```
input: { assignment_id }

1. Lade assignment (contact_id, building_id, parent_assignment_id).
2. DELETE FROM contact_building_assignments WHERE id = assignment_id
   → Cascade entfernt: shares, costs, etv_attendees, etv_votes,
     plus Sub-Assignments via parent_assignment_id (falls ON DELETE
     CASCADE; sonst zuerst children löschen).
3. Lade verbleibende assignments des Kontakts:
   SELECT building_id FROM contact_building_assignments WHERE contact_id = X
4. Wenn leer:
     - contacts.user_id → null setzen
     - auth.admin.deleteUser(user_id)  (Cascade räumt profiles)
   Sonst:
     - DELETE FROM weg_owner_buildings WHERE user_id=… AND building_id=…
     - DELETE FROM tenants            WHERE user_id=… AND building_id=…
     - profiles.building_id ggf. neu setzen, falls es exakt das gelöschte war
       (auf irgendein noch verbleibendes Building oder NULL)
5. return { success, account_deleted: bool }
```

### 3. Frontend `BuildingContactsList.removeAssignment` umbauen

- Statt direktem `supabase.from(...).delete()` → `supabase.functions.invoke("remove-contact-from-building", { body: { assignment_id } })`.
- Bestätigungsdialog erweitern: zeige Hinweis „Account wird gelöscht" vs. „Person verliert nur Zugriff auf dieses Gebäude" (vorab per kleinem Query/RPC zählen, in wie vielen Buildings die Person sonst noch ist).
- Nach Erfolg `refetch()` und passenden Toast.

### 4. Gleiche Funktion auch in `ContactBuildingAssignments.deleteAssignment` (Kontakt-Detail) verwenden, damit beide Pfade konsistent sind.

## Technische Hinweise

- `contact_building_assignments.parent_assignment_id` (Migration vom 28.04.) hat `ON DELETE SET NULL` → Sub-Assignments (Stellplatz/Hobbyraum mit eigener Abrechnung) bleiben verwaist nach Löschen des Hauptkontakts. Ich erweitere die Edge Function so, dass Sub-Assignments **mit** gelöscht werden, wenn das Parent gelöscht wird (oder du sagst, sie sollen am Gebäude bleiben — bitte kurz bestätigen, sonst nehme ich Mit-Löschen).
- `weg_owner_buildings` / `tenants` haben heute keine RLS-Probleme für Service-Role, der direkte Delete reicht.
- Falls beim Auth-Delete ein Fehler auftritt (z. B. User existiert nicht mehr), wird das geloggt aber nicht hart geworfen, damit das Assignment-Delete trotzdem persistiert.

## Ergebnis

- Löschen funktioniert wieder (kein FK-Fehler).
- Auth-Account wird sauber zurückgesetzt: behält Zugriff auf andere Gebäude, oder wird komplett entfernt, wenn dies das letzte war.
- Kontakt bleibt im globalen Adressbuch erhalten.