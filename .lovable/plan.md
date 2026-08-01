# Passwortänderung reparieren

## Ursache

Das Auth-Backend läuft mit der Einstellung "aktuelles Passwort erforderlich" (`current_password_required`). Die App schickt beim Speichern aber nur das neue Passwort mit – das eingegebene aktuelle Passwort wird nur für eine separate Anmelde-Prüfung verwendet und nie an den Passwort-Wechsel selbst übergeben. Deshalb lehnt der Server jeden Versuch mit "Current password required when setting new password" ab, auch nach korrekter MFA-Bestätigung.

Bestätigt durch:
- `src/pages/ChangePassword.tsx` (Zeile 107): `updateUser({ password })` ohne `current_password`
- `src/hooks/useAuth.tsx` (Zeile 284): dieselbe Lücke, genutzt in Mieter-/Eigentümer-Einstellungen
- Auth-Logs: `PUT /user` → 400 `current_password_required`, jeweils direkt nach erfolgreicher MFA-Verifizierung

Zweites Problem im selben Flow: vor dem Wechsel wird `signInWithPassword` zur Prüfung des alten Passworts aufgerufen. Das erzeugt eine frische Sitzung auf Stufe AAL1 und erzwingt dadurch überhaupt erst die erneute MFA-Abfrage – sichtbar in den Logs als Login → Challenge → Verify-Kette bei jedem Versuch.

## Änderungen

1. Passwort-Wechsel-Seite (`src/pages/ChangePassword.tsx`)
   - Das aktuelle Passwort wird beim Speichern mitgesendet (`current_password`).
   - Feld "Aktuelles Passwort" wird immer angezeigt, auch beim erzwungenen Erstlogin-Wechsel, da der Server es dort ebenfalls verlangt (das Initialpasswort aus dem Brief/der Einladung).
   - Die vorgeschaltete Neu-Anmeldung mit dem alten Passwort entfällt; die Prüfung übernimmt der Server beim eigentlichen Wechsel. Falsches Passwort wird als klare Meldung "Aktuelles Passwort ist falsch" ausgegeben.
   - MFA-Code-Abfrage bleibt erhalten, wird aber nur noch angefordert, wenn die Sitzung tatsächlich noch nicht auf MFA-Stufe ist (nach Wegfall des Zwangs-Logins in der Regel gar nicht mehr).
   - Ausnahme: Kommt der Nutzer über einen Passwort-vergessen-Link (Recovery-Sitzung), bleibt das Feld ausgeblendet, weil dort kein altes Passwort existiert.

2. Zentrale Hilfsfunktion (`src/hooks/useAuth.tsx`)
   - `updatePassword` nimmt zusätzlich das aktuelle Passwort entgegen und reicht es durch, damit auch die Passwortänderung in den Einstellungsseiten funktioniert.

3. Einstellungsseiten (Mieter- und WEG-Eigentümer-Einstellungen)
   - Feld "Aktuelles Passwort" ergänzen und an `updatePassword` übergeben, damit dort dieselbe Fehlermeldung nicht auftritt.

## Prüfung

- Adminwechsel mit korrektem aktuellem Passwort: Erfolg, Abmeldung, Neuanmeldung mit neuem Passwort.
- Falsches aktuelles Passwort: verständliche Fehlermeldung statt englischer Servermeldung.
- Erzwungener Erstlogin-Wechsel: funktioniert mit dem Initialpasswort.
