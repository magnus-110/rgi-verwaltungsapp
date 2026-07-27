## Problem

Der eingeloggte Admin hat MFA aktiv. Supabase verlangt für `auth.updateUser({ password })` in diesem Fall eine **AAL2-Session**. Aktuell macht die Seite nur `signInWithPassword` als Reauth — das erzeugt aber eine frische **AAL1-Session** (Passwort allein), keine AAL2. Deshalb schlägt der direkt folgende `updateUser` mit `AAL2 session is required to update email or password when MFA is enabled` fehl (siehe Auth-Logs, `error_code: insufficient_aal`).

## Lösung

MFA-Schritt in den Passwort-Ändern-Flow einbauen, damit die Session vor `updateUser` auf AAL2 gehoben wird.

### `src/pages/ChangePassword.tsx`

1. Nach erfolgreichem `signInWithPassword`-Reauth prüfen:
   `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` → wenn `currentLevel !== 'aal2'` und `nextLevel === 'aal2'`, MFA-Challenge nötig.
2. Verifizierte TOTP-Faktoren laden über `supabase.auth.mfa.listFactors()` und den ersten `verified` TOTP-Faktor nehmen.
3. Neuen State `mfaRequired` + `mfaCode` einführen. Sobald AAL2 nötig ist, statt sofortigem `updatePassword` ein zusätzliches Feld „Bestätigungscode aus Authenticator-App (6-stellig)" einblenden und den Submit-Button auf „Bestätigen & Passwort ändern" umschalten.
4. Beim erneuten Submit: `mfa.challenge({ factorId })` → `mfa.verify({ factorId, challengeId, code })`. Bei Erfolg (Session ist jetzt AAL2) `updatePassword(newPassword)` ausführen. Bei Fehler klarer Toast „Code ungültig".
5. Fehlerfall „kein verifizierter Faktor" (sollte nicht passieren, da `mfa_required` gesetzt): Toast mit Hinweis, sich einmal frisch abzumelden und via MFA-Challenge neu anzumelden.
6. Für den erzwungenen Erstlogin (`isForcedChange`) bleibt das Verhalten unverändert — dort existiert typischerweise noch keine MFA-Enrollment.

Keine Änderungen an `useAuth.updatePassword` oder anderen Rollen-Seiten. Das MFA-Feld erscheint nur, wenn Supabase AAL2 verlangt.

## Betroffene Datei

- `src/pages/ChangePassword.tsx` — MFA-Challenge-Zwischenschritt (TOTP-Code) vor `updateUser`.
