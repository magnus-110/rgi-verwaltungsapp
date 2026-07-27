## Ziel
Die Passwortänderung soll wirklich das Supabase-Auth-Passwort aktualisieren und danach eindeutig funktionieren, statt durch Re-Login/MFA-Sessionwechsel scheinbar erfolgreich zu sein.

## Befund
- In `ChangePassword.tsx` wird zur Prüfung des alten Passworts `signInWithPassword()` aufgerufen.
- Bei MFA-Konten erzeugt dieser Re-Login wieder eine AAL1-Session und kann die vorherige Session/den Auth-State überschreiben.
- Danach wird zwar der MFA-Code abgefragt, aber der Ablauf ist fragil: UI-Erfolg und tatsächliche Passwortänderung können auseinanderlaufen, besonders durch Sessionwechsel während der laufenden Änderung.

## Plan
1. **Passwortänderung in einem klaren Ablauf kapseln**
   - In `ChangePassword.tsx` nach der alten Passwortprüfung die aktuelle Session stabilisieren.
   - Nach MFA-Verify explizit prüfen, ob die Session wirklich `aal2` ist, bevor `updateUser({ password })` ausgeführt wird.

2. **Keine irreführende Erfolgsmeldung mehr**
   - Erfolg nur anzeigen, wenn `supabase.auth.updateUser({ password })` ohne Fehler zurückkommt.
   - Bei Fehlern eine konkrete Meldung anzeigen, z. B. wenn weiter `AAL2` fehlt.

3. **Nach erfolgreicher Änderung sauber neu anmelden lassen**
   - Nach erfolgreichem Passwortwechsel globale Abmeldung/Session-Cleanup durchführen und zur Login-Seite leiten.
   - Hinweis anzeigen: „Passwort geändert. Bitte mit dem neuen Passwort anmelden.“
   - Dadurch wird verhindert, dass alte Refresh-Tokens oder MFA-Zwischenzustände den Test verfälschen.

4. **Admin-/Owner-/Tenant-Pfade unverändert lassen**
   - Nur die gemeinsame Passwortänderungslogik anfassen.
   - Keine Änderungen an Rollen, Profilen oder Datenbank.

## Technische Details
- Änderung primär in `src/pages/ChangePassword.tsx`.
- `useAuth.updatePassword()` in `src/hooks/useAuth.tsx` ggf. so erweitern, dass es keine Erfolgsmeldung ausgibt, bevor die Seite den Gesamtprozess abgeschlossen hat, oder optional eine silent-Variante bekommt.
- MFA-Flow: `challenge()` → `verify()` → `getAuthenticatorAssuranceLevel()` → erst dann `updateUser({ password })`.