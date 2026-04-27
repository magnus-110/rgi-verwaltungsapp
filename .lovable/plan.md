## Ziel

Beim Klick auf „Begrüßungsbriefe erstellen" wird pro Eigentümer-Kontakt automatisch sichergestellt, dass es einen Account gibt. Im Brief stehen dann der echte **Benutzername** und das **Passwort**, plus der **Verwaltungsbeginn**.

## Logik pro Kontakt (Eigentümer)

```text
Hat Kontakt bereits einen verlinkten Account (contacts.user_id != null)?
├── JA  → Username = profiles.username (oder pseudoEmail/echte E-Mail)
│         Passwort = "(bereits vergeben)"  ← wird NICHT überschrieben
│
└── NEIN → Account neu anlegen:
          1. Username generieren (vorname.nachname → eindeutig machen)
          2. Pseudo-E-Mail = username@users.rgi-immobilien.app
             (oder echte E-Mail, falls vorhanden und gewünscht)
          3. Numerisches Passwort (8 Stellen) generieren
          4. supabase.auth.admin.createUser({ email, password, email_confirm: true })
          5. profiles upsert: username, role=weg_owner/tenant, force_password_change=true
          6. contacts.user_id = neuer auth user
          7. weg_owner_buildings bzw. tenants verknüpfen
          → Username + Passwort gehen in den Brief
```

Damit deckt der Brief beide Fälle ab — neue Kontakte (95 %) und Bestandskontakte (5 %).

## Neue Platzhalter im Word-Template

| Platzhalter | Inhalt |
|---|---|
| `{{benutzername}}` | Login-Username |
| `{{passwort}}` | Initial-Passwort, oder „(bereits vergeben)" bei Bestands-Accounts |
| `{{verwaltungsbeginn}}` | Datum, das beim Generieren im UI gewählt wurde (z. B. „1. Mai 2026") |
| `{{verwaltungsbeginn_kurz}}` | „01.05.2026" |
| `{{login_url}}` | `https://rgi-immobilien.app/login` |

Der bisherige `{{magic_link_url}}` und der QR-Code werden **entfernt** (kein Magic-Link mehr).

## UI-Änderungen `BuildingOnboardingTab.tsx`

1. Neuer **Datepicker** „Verwaltungsbeginn" über dem Button „Begrüßungsbriefe erstellen" (Shadcn Calendar in Popover, `pointer-events-auto`).
2. Datum wird beim Klick als `management_start_date` (ISO) an die Edge Function übergeben — wird **nicht** in der DB gespeichert (nur für die Brieferzeugung).
3. Platzhalter-Liste in der Hilfe-Sektion aktualisieren: `{{magic_link_url}}` raus, neue Platzhalter rein.
4. Hinweis-Card unter Buttons: „Für neue Kontakte werden automatisch Login-Accounts mit Initial-Passwort erstellt."

## Edge-Function `generate-welcome-letters`

Komplett überarbeiten:

- QRCode- und ImageModule-Logik **entfernen** (vereinfachte Render-Funktion ohne Image-Modul → keine Render-Crashes mehr).
- Body akzeptiert zusätzlich `management_start_date: string` (ISO).
- Pro Recipient (loadRecipients liefert bereits `contact_id`):
  - Lookup `contacts.user_id`.
  - Falls vorhanden: lade `profiles.username`. Setze `passwort = "(bereits vergeben)"`.
  - Falls nicht: führe oben beschriebenen Account-Erstellungsflow durch (gemeinsamer Helper `ensureContactAccount` analog zu `invite-contact-user`, im selben File). Pseudo-E-Mail wird verwendet wenn Kontakt keine echte E-Mail hat.
- Variablen `benutzername`, `passwort`, `verwaltungsbeginn`, `verwaltungsbeginn_kurz`, `login_url` an `r.vars` mergen und ins DOCX rendern.
- ZIP weiterhin bauen + in DMS unter „Begrüßungsbriefe" ablegen.
- Response enthält zusätzlich `created_accounts: number`.

## Sicherheit

- Initial-Passwörter erscheinen ausschließlich im DOCX, das im DMS als `visibility_role: "intern"` abgelegt wird (nur Admin/Employee sichtbar) — wie heute.
- `force_password_change = true` zwingt User beim ersten Login zur Passwortänderung.
- Bestehende Passwörter werden **nie** überschrieben.

## Geänderte/neue Dateien

- `supabase/functions/generate-welcome-letters/index.ts` (Hauptlogik überarbeiten)
- `src/components/buildings/BuildingOnboardingTab.tsx` (Datepicker, neue Platzhalterliste, Body-Param)
- Keine DB-Migration nötig.
