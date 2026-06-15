## Problem

Auth-Logs zeigen den genauen Fehler: Beim Anlegen/Einladen von Thomas Göttinger hat Supabase die Passwort-Aktualisierung mit **HTTP 422** abgelehnt (`PUT /admin/users/...`), aber direkt danach wurde die Make.com-Webhook erfolgreich mit dem (nie gespeicherten) Passwort verschickt. Folge: Der Nutzer bekommt eine E-Mail mit einem Passwort, das im Auth-System gar nicht gesetzt ist → Login schlägt fehl.

### Zwei Ursachen in `supabase/functions/invite-contact-user/index.ts`

1. **Fehler wird verschluckt.** `supabaseAdmin.auth.admin.updateUserById(...)` und `createUser(...)` werden ohne Fehler-Check ausgeführt. Auch wenn der Auth-Server 422 zurückgibt, läuft der Code weiter und sendet die Webhook.
2. **Passwort-Format ist HIBP-anfällig.** `generateNumericPassword()` erzeugt 6-stellige Zahlen. Supabase's "Leaked Password Protection" (HaveIBeenPwned) lehnt viele 6-stellige Zahlen ab (z. B. Geburtsjahre, "123456", etc.) — genau das ist hier passiert.

Das gleiche Muster steckt in `supabase/functions/request-password-reset/index.ts` (auch dort 6-stellig + kein Error-Check beim Webhook).

## Lösung

### 1. `invite-contact-user/index.ts`
- `generateNumericPassword()` ersetzen durch denselben Wort-Generator wie `admin-reset-password` (`Wort-Wort-Wort-NN`): leicht abzutippen aus einem Brief, aber kein HIBP-Treffer.
- Rückgabe von `updateUserById` und `createUser` **prüfen**. Bei Fehler: ein zweites Passwort generieren und retry; wenn es wieder fehlschlägt, mit klarer Fehlermeldung abbrechen und **die Webhook NICHT senden**.
- Webhook nur senden, wenn das Setzen des Passworts nachweislich geklappt hat.

### 2. `request-password-reset/index.ts`
- Gleiche zwei Fixes (Wort-Passwort + Error-Check vor Webhook).

### 3. Hinweis an Nutzer
Für den bereits betroffenen Thomas Göttinger reicht es, in der App nochmal "Einladung senden" zu klicken — nach dem Fix wird das Passwort korrekt gesetzt und die E-Mail enthält dann ein funktionierendes Passwort.

## Technische Details

- Keine DB-Migrations nötig.
- Make.com-Template muss nicht angepasst werden: Es bekommt weiterhin `password` als String aus der Webhook (nur eben jetzt im Format `Brunnen-Wolke-Anker-42`).
- Edge Functions werden nach dem Edit automatisch deployed.
- Keine Frontend-Änderungen.

## Geänderte Dateien

- `supabase/functions/invite-contact-user/index.ts`
- `supabase/functions/request-password-reset/index.ts`
