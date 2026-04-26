# Plan: Self-Service Login-E-Mail + vollständige Vorbefüllung der Wohnungsformulare

## Teil A — Self-Service: Login-E-Mail ändern

### 1. Neue Card "Login-Daten" in `src/pages/weg-owner/Settings.tsx`
Oberhalb von "Passwort ändern" eine neue Card einfügen:

- **Titel**: "Login-E-Mail"
- **Aktuelle Login-E-Mail** wird **vorbefüllt** aus `profile.email` (read-only Anzeige als Hinweis)
- **Input "Neue E-Mail"**: leer, der User trägt die neue E-Mail ein
- **Button "E-Mail ändern"**

### 2. Logik
- Aufruf von `supabase.auth.updateUser({ email: newEmail })`
- Supabase versendet automatisch eine Bestätigungs-E-Mail an die **neue** Adresse
- User muss in der neuen E-Mail auf den Link klicken → erst dann wird die Login-E-Mail tatsächlich geändert
- Nach erfolgreicher Bestätigung: Trigger `sync_profile_email` (existiert ggf. schon, sonst neu erstellen) aktualisiert auch `profiles.email`

### 3. Hinweis-Text in der Card
"Ihre Login-E-Mail wird auch für 'Passwort vergessen' verwendet. Nach dem Ändern erhalten Sie eine Bestätigungs-E-Mail an die **neue** Adresse — der Login funktioniert weiterhin mit der alten E-Mail, bis Sie den Link in der Bestätigungs-E-Mail anklicken."

### 4. Sicherheit
- Keine Edge Function nötig — `supabase.auth.updateUser` läuft über die User-Session und ist abgesichert
- Supabase verifiziert automatisch die Identität via aktiver Session

---

## Teil B — Vollständige Vorbefüllung der Wohnungsfelder

### Aktuelles Problem
In `OwnerSelfServiceSection.tsx` werden Override-Felder mit `placeholder` (HTML) angezeigt, aber das Value ist `null/""`. Wenn der User speichert, ohne etwas zu ändern, wird **nichts** gespeichert → bei "Birkenweg 13" sind alle Felder leer.

### Fix
In `setAssignments(...)` beim initialen Laden: Wenn ein Override-Feld `null` ist, lade den **globalen Wert** aus `contact` / `contact_persons` / `contact_phones` / `contact_emails` / `contact_bank_accounts` als initialen Wert in den State.

Konkret:
- `salutation_override` ← `contact.salutation` falls null
- `first_name_override` ← `person.first_name` falls null
- `last_name_override` ← `person.last_name` falls null
- `address_line1_override`, `postal_code_override`, `city_override` ← aus `contact`
- `phones_override` ← aus `contact_phones` der Person, falls leer
- `emails_override` ← aus `contact_emails` der Person, falls leer
- `iban_override` / `iban_holder_override` ← aus `contact_bank_accounts` falls `bank_account_id` gesetzt

→ Alle Felder zeigen jetzt **echte Werte**, der User sieht sofort die geerbten Daten und kann sie bearbeiten. Beim Speichern werden die Werte als Override persistiert (also explizit pro Wohnung gespeichert).

### Konsequenz
Auch wenn der User **nichts** ändert, werden die globalen Werte beim ersten Speichern als Override für die jeweilige Wohnung übernommen → konsistent für alle Gebäude (Beispielgebäude UND Birkenweg 13).

---

## Teil C — Eigentümer-Badge entfernen

In `OwnerSelfServiceSection.tsx` das `<Badge>` mit "Eigentümer" auf der Wohnungs-Card entfernen.

---

## Teil D — Info-Text "Mehrere E-Mails / Login"

Auf der Wohnungs-Card ein kleiner Hinweis (graue Info-Box mit Info-Icon):
> "Diese E-Mail-Adressen werden für Korrespondenz zu **dieser Wohnung** verwendet (z.B. Abrechnungen). Ihre **Login-E-Mail** ändern Sie in den Einstellungen unter 'Login-Daten'."

---

## Dateien, die geändert werden

1. **`src/pages/weg-owner/Settings.tsx`** — neue Card "Login-Daten" mit Self-Service E-Mail-Änderung
2. **`src/components/owner/OwnerSelfServiceSection.tsx`**:
   - Eigentümer-Badge entfernen
   - Vollständige Vorbefüllung aller Override-Felder mit globalen Werten
   - Info-Text zu Korrespondenz-vs-Login-E-Mail
3. **(Optional) Migration**: Trigger `sync_profile_email` prüfen — falls nicht vorhanden, einen Trigger auf `auth.users` UPDATE erstellen, der `profiles.email` synchronisiert (nur falls noch nicht existent)

---

## Was NICHT geändert wird

- `request-password-reset` bleibt unverändert (nutzt weiterhin nur `auth.users.email`)
- `resolve-login-identifier` bleibt unverändert
- Override-E-Mails der Wohnungen bleiben **rein für Korrespondenz** — kein Login-Effekt
