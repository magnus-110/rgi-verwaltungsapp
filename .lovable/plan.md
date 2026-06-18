## Befund (geprüft in Auth + Kontakten)

Achweg 3-5 → die 6 Einheiten teilen sich nur **zwei** Kontakte:

| Einheiten | Kontakt | aktuelle Primär-Mail (Login) | gewünschte Mail |
|---|---|---|---|
| 0005, 0006, 0010, 0021, 0026 | Lothar Schüttler | `gecarroll@outlook.com` ✗ | `lschuettler@outlook.com` |
| 0025 | Sandra Bronold | `sandra.bronold@t-online.de` ✗ | `tina.bronold@broki.de` |

Beide gewünschten Adressen sind als **Privat / nicht primär** beim Kontakt hinterlegt. Die alten Adressen sind als „Geschäftlich / primär" markiert und es existieren bereits **Auth-Accounts** dafür (beide haben sich noch **nie eingeloggt**, `last_sign_in_at = null`). `contact.user_id` zeigt jeweils auf diese alten Accounts.

Die Edge Function `invite-contact-user` nimmt immer den `is_primary = true`-Eintrag und versendet die Zugangsdaten dorthin → ohne Korrektur würden die Einladungen weiter an die falschen Adressen gehen, und selbst wenn man die Primär-Mail nur am Kontakt umflaggt, würde der Login weiterhin auf die alte Auth-Mail laufen.

## Korrektur (zwei Schritte, dann Versand)

**Schritt 1 — Datenbank in einen konsistenten Zustand bringen** (per `supabase--insert`, da nur Daten-Updates, kein Schema):

1. `contact_emails`: Primär-Flag umsetzen
   - Schüttler: `lschuettler@outlook.com` → `is_primary = true`, `gecarroll@outlook.com` → `false`
   - Bronold: `tina.bronold@broki.de` → `is_primary = true`, `sandra.bronold@t-online.de` → `false`
   - Alte Adressen bleiben am Kontakt (nur demoten, nicht löschen).
2. `auth.users` für die beiden bereits angelegten User-IDs:
   - `ec3c0dbc-…` (Schüttler) → `email = 'lschuettler@outlook.com'`, `email_confirmed_at = now()`
   - `acb3fc73-…` (Bronold) → `email = 'tina.bronold@broki.de'`, `email_confirmed_at = now()`
   - Sicher, weil noch nie eingeloggt.
3. `profiles.email` analog auf die neuen Adressen setzen, damit Profil/Auth synchron sind.

**Schritt 2 — Verifikation** per `read_query`:
- `auth.users` + `profiles` + `contact_emails` für beide Kontakte gegenprüfen (neue Mail = primär + Auth + Profil).

**Schritt 3 — Einladung versenden** (durch dich im UI in Achweg 3-5):
- Pro Kontakt einmal „Einladen / Zugangsdaten senden" auslösen — die Funktion findet den bestehenden Auth-User, rotiert das Passwort und versendet Login + neues Passwort an die jetzt korrekte Primär-Mail. Für Einheiten desselben Kontakts (Schüttler hat 5 Einheiten) reicht **ein** Versand.

## Technische Hinweise
- Keine neue Migration nötig — reine Daten-Updates über `supabase--insert` (Update-Statements).
- Keine Code-Änderung an `invite-contact-user` nötig: die Logik ist korrekt, nur die Daten waren es nicht.
- Falls du die alten Adressen ganz vom Kontakt entfernen willst, sag Bescheid — standardmäßig lasse ich sie als Sekundär-Mail stehen.

OK, dann setze ich Schritt 1 + 2 um, und du löst danach den Versand im UI aus?
