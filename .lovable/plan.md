## Kurz: Ja, geht — mit einem kleinen Trick.

Das Problem war nicht "6-stellig numerisch" an sich, sondern dass Supabase's **Leaked Password Protection** (HaveIBeenPwned) viele bekannte 6-stellige Zahlen (z. B. `123456`, `111111`, Geburtsjahre) ablehnt. Bei Thomas ist genau das passiert: Passwort wurde generiert, Supabase hat es mit 422 abgelehnt, die E-Mail ging trotzdem raus.

Mit der **Retry-Logik aus dem letzten Fix** können wir problemlos zurück zu 6-stelligen Ziffern: Wenn eines abgelehnt wird, wird einfach ein neues generiert (bis zu 3 Versuche). Die meisten zufälligen 6-Ziffern-Kombis sind **nicht** in HIBP geleakt, also klappt es praktisch immer beim 1. oder 2. Versuch.

## Änderung

Nur `generateFriendlyPassword()` durch `generateNumericPassword()` (6 Ziffern, 100000–999999) ersetzen in:
- `supabase/functions/invite-contact-user/index.ts`
- `supabase/functions/request-password-reset/index.ts`

Die Retry-Schleifen und Fehler-Checks bleiben — die fangen den seltenen HIBP-Treffer ab. Webhook wird weiterhin nur gesendet, wenn das Setzen tatsächlich geklappt hat.

## Geänderte Dateien

- `supabase/functions/invite-contact-user/index.ts`
- `supabase/functions/request-password-reset/index.ts`
