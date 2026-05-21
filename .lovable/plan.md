# Fix: Ungewollter Logout/Lockout beim Abstimmen

## Ursache (bestätigt)

`supabase/functions/invite-contact-user/index.ts` rotiert für **bereits existierende** Nutzer immer das Passwort (Zeile 134 und 167) — auch wenn der Aufrufer `send_email: false` setzt. Folge:

- Supabase invalidiert beim Passwort-Wechsel serverseitig alle Refresh-Tokens.
- Beim nächsten Token-Refresh fliegt der Nutzer in der App raus (`SIGNED_OUT` Event → unser `useAuth` löscht Session/Profile).
- Sein bekanntes Passwort gilt nicht mehr → Login schlägt fehl, bis Admin „Passwort zurücksetzen" klickt.

Trigger im konkreten Fall: vermutlich ein paralleler Re-Invite/Re-Assignment durch den Admin, während der Eigentümer in der Abstimmung war.

## Lösung (minimal-invasiv, ohne Verhaltensänderung bei „echtem" Einladen)

In `supabase/functions/invite-contact-user/index.ts`:

1. Body-Parameter `force_reset_password?: boolean` einführen.
2. Neue Regel: Passwort eines **bestehenden** Auth-Users wird **nur** rotiert, wenn
   - `force_reset_password === true`, oder
   - der Parameter fehlt und `send_email === true` (also nur wenn die neuen Zugangsdaten via Make-Webhook auch tatsächlich versendet werden).
3. Bei `send_email === false` und keinem expliziten `force_reset_password`: kein `updateUserById({ password })`, keine Webhook-Auslösung. Profil/Rolle/Building-Verknüpfung wird trotzdem aktualisiert.
4. Neuanlage (`createUser`) bleibt unverändert — dort ist ein Passwort technisch erforderlich.

## Was sich für bestehende Aufrufe ändert

| Aufrufer | bisher | nachher |
|---|---|---|
| `AssignContactDialog` Edit + „Einladung senden" angehakt (`send_email=true`) | rotiert + Mail | **unverändert** (rotiert + Mail) |
| `AssignContactDialog` Neuanlage mit Haken (`send_email=true`) | rotiert + Mail | **unverändert** |
| `AssignContactDialog` Neuanlage ohne Haken (`send_email=false`) | rotierte still (Bug) | **nur Account-Verknüpfung, kein Passwort-Wechsel** |
| Andere Auto-Invokes (z. B. Meeting-Publish, falls vorhanden) mit `send_email=true` | rotierte | rotiert weiterhin (Verhalten erhalten) |
| Beliebiger Aufrufer mit `send_email=false` | rotierte | **rotiert nicht mehr** |

Damit ist garantiert: **kein Nutzer wird mehr unbemerkt ausgeloggt**, weil die Zugangsdaten nur dann ungültig werden, wenn er sie auch per E-Mail bekommt.

## Geänderte Datei

- `supabase/functions/invite-contact-user/index.ts` (3 kleine Stellen: Body-Parsing + zwei `if`-Bedingungen vor `updateUserById` + Webhook-Bedingung)

Keine Frontend-Änderungen, keine DB-Migration, keine Auswirkung auf RLS, Realtime, Meetings, Voting, Finance.

## Verifikation

1. Deploy der Edge Function.
2. Test A (Regression): Im Admin „Kontakt zuordnen" → Haken bei „Einladung senden" → existierender Nutzer bekommt wie bisher eine Mail mit neuem Passwort, alte Session läuft aus.
3. Test B (Fix): Im Admin „Kontakt zuordnen" → Haken **nicht** setzen → existierender Nutzer bleibt eingeloggt, Passwort bleibt gültig.
4. Test C: Eigentümer stimmt in der App ab, Admin macht parallel eine harmlose Re-Assignment-Operation ohne „Einladung senden" → kein Logout.
