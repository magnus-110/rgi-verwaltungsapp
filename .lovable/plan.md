## Problem

Auf `/admin/change-password` (Seite `src/pages/ChangePassword.tsx`) gibt es nur zwei Felder: „Neues Passwort" und „Passwort bestätigen". Beim Speichern ruft `updatePassword` → `supabase.auth.updateUser({ password })`. Supabase verlangt für Passwort-Änderungen bei „normal" eingeloggten Nutzern eine kürzlich bestätigte Anmeldung (Reauthentication) und liefert sonst einen Fehler wie „Auth session missing / require reauth". Das erklärt die Meldung „altes Passwort nötig" ohne Eingabefeld.

## Lösung

1. `src/pages/ChangePassword.tsx`
   - Neues Feld „Aktuelles Passwort" (mit Show/Hide-Toggle) oberhalb von „Neues Passwort" hinzufügen — nur anzeigen, wenn `profile.force_password_change` und `profile.must_change_password` **beide falsy** sind (bei Erstlogin ist kein altes Passwort bekannt).
   - Vor `updatePassword(newPassword)` eine Reauth via `supabase.auth.signInWithPassword({ email: profile.email, password: currentPassword })` durchführen. Bei Fehler klare Toast-Meldung „Aktuelles Passwort ist falsch" und abbrechen.
   - Nach erfolgreichem `signInWithPassword` das neue Passwort setzen und Erfolgs-Toast + Redirect je nach Rolle (`/admin`, `/weg-owner`, `/tenant`).

2. Keine Änderungen an `useAuth.updatePassword` oder anderen Rollen-Seiten nötig — das Feld erscheint nur, wenn kein Force-Change vorliegt, und deckt damit Admin, WEG-Owner und Tenant im normalen Betrieb ab.

## Betroffene Datei

- `src/pages/ChangePassword.tsx` — Feld + State + Reauth-Logik.
