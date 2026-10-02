# Versammlung als erledigt markieren reparieren

## Ursache
Die App will die Markierung in einer Tabelle speichern, die in der Datenbank nicht existiert. Deshalb kommt beim Speichern die Meldung „Fehler“, und auch das Laden der Markierungen schlägt fehl (die 404-Meldungen in der Konsole).

## Lösung
Die fehlende Tabelle anlegen. Danach funktionieren „Als erledigt markieren“ und das Zurücknehmen ohne weitere Änderungen in der App.

## Technische Details
Neue Tabelle `public.etv_year_exemptions` per Migration:
- `building_id` (uuid, FK auf buildings, on delete cascade), `year` (int), `reason` (text, Prüfung per Trigger auf 'extern'/'sonstiges'), `note` (text, optional), `created_by` (uuid, Standardwert auth.uid()), `created_at`, `updated_at` + Update-Trigger
- Unique (building_id, year) für den bestehenden Upsert
- GRANT SELECT/INSERT/UPDATE/DELETE an authenticated, ALL an service_role
- RLS: verwalten nur mit `user_has_admin_access(auth.uid())` (gleiche Regel wie bei Versammlungen)

Danach den Ablauf in der Vorschau prüfen.
