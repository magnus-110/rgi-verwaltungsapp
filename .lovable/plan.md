## Ziel

E-Mail-Wechsel-Bestätigung über Make.com versenden — analog zum bereits funktionierenden Passwort-Reset-Flow. Damit umgehen wir die Supabase-Default-Mails und brauchen **keine DNS-Änderungen bei Strato**. Die Strato-Standard-Mailfunktion bleibt unangetastet.

## Funktionsweise

Statt Supabase Auth direkt die Bestätigungs-E-Mail verschicken zu lassen (was eine eigene Mail-Domain nötig macht), nutzen wir das gleiche Muster wie beim Passwort-Reset:

```text
Eigentümer trägt neue E-Mail ein
        ↓
Edge Function "request-email-change"
        ↓
1. Validiert Eingabe (gültige E-Mail, nicht aktuelle, nicht vergeben)
2. Erzeugt sicheren Token (UUID + Ablaufzeit 24h)
3. Speichert Token + neue E-Mail in DB-Tabelle
4. Schickt Webhook an Make.com mit:
   - Vorname, Nachname
   - Neue E-Mail (Empfänger)
   - Bestätigungslink (https://app/confirm-email-change/{token})
        ↓
Make.com schickt deine RGI-Branded HTML-Mail an die neue Adresse
        ↓
Eigentümer klickt Link
        ↓
Edge Function "confirm-email-change" (öffentlich)
        ↓
1. Token prüfen (gültig, nicht abgelaufen, nicht benutzt)
2. supabase.auth.admin.updateUserById → E-Mail ändern
3. Token als "used" markieren
4. Redirect auf Login mit Erfolgs-Toast
```

## Was gebaut wird

**1. Datenbank-Migration**
- Neue Tabelle `email_change_requests`: id, user_id, new_email, token, expires_at, used_at, created_at
- RLS: nur Service-Role-Zugriff (Tokens sind sicherheitskritisch)
- Index auf token für schnelles Lookup

**2. Edge Function `request-email-change`** (authentifiziert)
- Empfängt: `{ new_email }`
- Holt aktuellen User aus JWT
- Prüft: gültige E-Mail, ≠ aktuelle, nicht in `auth.users` vergeben
- Erzeugt Token (crypto.randomUUID), 24h gültig
- Speichert in `email_change_requests`
- Holt Profil (first_name, last_name)
- Schickt an Make-Webhook (gleiche `MAKE_WEBHOOK_URL` wie Passwort-Reset, mit `event: 'email_change_request'`):
  ```json
  {
    "event": "email_change_request",
    "first_name": "...",
    "last_name": "...",
    "new_email": "...",
    "old_email": "...",
    "confirmation_url": "https://rgi-immobilien.app/confirm-email-change/{token}",
    "expires_at": "..."
  }
  ```

**3. Edge Function `confirm-email-change`** (öffentlich, kein JWT)
- Empfängt: `{ token }`
- Prüft Token gültig + nicht abgelaufen + nicht benutzt
- `supabase.auth.admin.updateUserById(user_id, { email: new_email, email_confirm: true })`
- Markiert Token als `used_at = now()`
- Gibt `{ success: true }` zurück

**4. Frontend-Anpassungen**
- `src/pages/weg-owner/Settings.tsx`: `handleEmailChange` ruft jetzt `request-email-change` Edge Function statt `supabase.auth.updateUser` — Toast-Text bleibt gleich ("Bestätigungs-E-Mail versendet")
- Neue Page `src/pages/ConfirmEmailChange.tsx`: konsumiert Token aus URL, ruft `confirm-email-change`, zeigt Erfolg/Fehler, leitet auf Login
- Route in `src/App.tsx`: `/confirm-email-change/:token`

**5. Make.com (musst du einrichten)**
Im bestehenden Make-Szenario einen neuen Branch hinzufügen (Router auf `event`-Feld):
- `event = "password_reset"` → bestehender Passwort-Reset-Flow
- `event = "email_change_request"` → neue Mail mit deinem RGI-HTML-Template
  - Empfänger: `{{new_email}}`
  - Variablen im Template: `{{first_name}}`, `{{last_name}}`, `{{confirmation_url}}`
  - Betreff-Vorschlag: "Bestätigung Ihrer neuen Login-E-Mail bei RGI Immobilien"

Ich liefere dir nach der Implementierung das fertige HTML-Template (im gleichen Stil wie deine Passwort-Reset-Mail) zum Einfügen in Make.

## Vorteile

- **Keine DNS-Änderungen** bei Strato — Mailfunktion bleibt intakt
- **Einheitliches Branding** — gleiche HTML-Struktur wie Passwort-Reset
- **Kein Lovable Email Setup** nötig
- **Token-Sicherheit** — 24h Ablauf, einmalige Verwendung, Service-Role-Schutz
- **Funktioniert sofort** — sobald du den Make-Branch eingerichtet hast

## Nicht im Scope

- Andere Auth-Mails (Magic Link, Signup-Bestätigung) — diese werden derzeit nicht aktiv genutzt; falls später nötig, gleiches Muster anwendbar
- Lovable Email Domain Setup wird **nicht** initiiert
