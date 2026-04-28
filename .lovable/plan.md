## Problem

In `supabase/functions/generate-welcome-letters/index.ts` (Zeile 129–156) prüft die Funktion: Wenn der Kontakt bereits einen `user_id` hat (z.B. weil beim Zuordnen zum Gebäude über `invite-contact-user` schon ein Account erstellt wurde), wird **kein neues Passwort gesetzt** und im Brief erscheint nur `(bereits vergeben)`.

Da bei deinem aktuellen Workflow JEDER Kontakt schon beim Building-Assignment einen Account bekommt (via `AssignContactDialog` → `invite-contact-user`), trifft dieser Fall jetzt für **alle** Briefe zu.

## Lösung

Die Logik in `generate-welcome-letters` umdrehen: Beim Brief-Generieren soll **immer ein neues Initial-Passwort** gesetzt werden — egal ob der Account neu oder schon vorhanden ist. Das ist auch sicherheitstechnisch sauber:

- Der Brief ist der **offizielle Zustellweg** der Login-Daten
- Solange der Empfänger sich noch nicht eingeloggt hat (`must_change_password = true` und `last_sign_in_at = null`), darf das Passwort gefahrlos überschrieben werden
- Hat er sich schon einmal eingeloggt → Passwort NICHT überschreiben (er hat es ja selbst geändert), dann weiterhin "(bereits vergeben)" zeigen

### Änderungen

**1. `supabase/functions/generate-welcome-letters/index.ts`**

In `ensureContactAccount` den Block ab Zeile 129 ersetzen:
- Wenn `contact.user_id` existiert:
  - Auth-User laden (`admin.auth.admin.getUserById`) und prüfen, ob `last_sign_in_at` gesetzt ist
  - **Fall A — noch nie eingeloggt:** Neues `generateNumericPassword(8)` setzen via `updateUserById`, `profiles.must_change_password = true`, `initial_password_set_at = now()`. Username erzeugen falls fehlt. Credentials mit dem neuen Passwort zurückgeben (`created: true`).
  - **Fall B — schon eingeloggt:** Bisheriges Verhalten, "(bereits vergeben)" + Hinweistext.

**2. UI-Hinweistexte anpassen** in `src/components/buildings/BuildingOnboardingTab.tsx` (Zeile 388 + 486):
- Klarstellen: "Initial-Passwort wird beim Brief-Generieren neu gesetzt, solange sich der Empfänger noch nie eingeloggt hat."
- "(bereits vergeben)" erscheint nur noch bei Empfängern, die ihr Passwort bereits selbst geändert haben.

### Optional (empfohlen): „Passwort neu setzen"-Button im Brief-Dialog
Falls ein Eigentümer den Brief verloren hat aber bereits eingeloggt war, kann der Admin manuell ein neues Initial-Passwort erzwingen (Reuse der existierenden `admin-reset-password` Edge Function). Sage Bescheid, falls ich das gleich mit einbauen soll.

## Technische Details

- `admin.auth.admin.getUserById(userId)` liefert `user.last_sign_in_at`
- Passwort-Update: `admin.auth.admin.updateUserById(authUserId, { password })`
- Profile-Update analog zum bestehenden Neu-User-Pfad (Zeilen 202–218)
- Kein DB-Schema-Change nötig
- Keine Auswirkung auf `invite-contact-user` (das bleibt für die separate E-Mail-Einladung zuständig)

## Ergebnis

Jeder generierte Welcome-Brief enthält ein gültiges, frisch gesetztes Initial-Passwort — außer der Empfänger hat sich bereits einmal eingeloggt.