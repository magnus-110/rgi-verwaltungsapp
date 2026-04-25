
# 📋 Implementierungsplan: Onboarding-Wizard „Verwaltungsübernahme"

## 🎯 Ziel

Ein interaktiver, mobile-first Onboarding-Wizard für WEG-Eigentümer, der bei der Verwaltungsübernahme:
- Stammdaten/SEPA direkt sammelt (sofort live)
- Wohnungs-, Gebäude-, Dienstleister- und Bewertungsdaten zur Verwalter-Freigabe einreicht
- Bestandseigentümer (Multi-Property) automatisch erkennt und ihnen einen verkürzten Flow bietet
- Begrüßungsbriefe mit Login-Daten als Word-Serienbrief generiert (Username + QR-Code + Initialpasswort)
- Username-basiertes Login für Eigentümer ohne E-Mail-Adresse ermöglicht

---

## 1. Username-Login-System (Pseudo-E-Mail-Strategie)

### Datenmodell

**`profiles` erweitern:**
- `username TEXT UNIQUE` — vom Eigentümer nutzbarer Login-Name (z. B. `hans.mueller`)
- `auth_pseudo_email TEXT UNIQUE` — interner Supabase-Auth-Identifier (`hans.mueller@users.rgi-immobilien.app`)
- `must_change_password BOOLEAN DEFAULT false` — erzwingt Passwort-Änderung beim ersten Login
- `initial_password_set_at TIMESTAMPTZ` — Audit-Spur

### Edge Functions

**`generate-username`** (intern aufgerufen von `invite-contact-user`):
- Input: `first_name`, `last_name`, optional `company_name`
- Normalisiert (lowercase, Umlaute, keine Sonderzeichen): `hans.mueller`
- Prüft Eindeutigkeit, hängt ggf. `.2`, `.3` an
- Reservierte Begriffe geblockt (admin, root, support, …)

**`resolve-login-identifier`** (öffentlich, vor `signInWithPassword`):
- Input: `identifier` (Username oder E-Mail), `password`
- Wenn `@` enthalten → direkt durchreichen
- Sonst Username-Lookup in `profiles.username` → liefert `auth_pseudo_email` ODER echte E-Mail
- Frontend ruft danach `supabase.auth.signInWithPassword({ email: resolvedEmail, password })`

**`admin-reset-password`** (admin-only):
- Setzt neues (ggf. generiertes) Initialpasswort für einen Auth-User
- Setzt `must_change_password = true`

**`generate-onboarding-magic-link`**:
- Erzeugt One-Time-Token (24 h gültig) für QR-Code im Begrüßungsbrief
- Tabelle `onboarding_magic_links (token, user_id, expires_at, used_at)`
- Edge Function `consume-magic-link` validiert Token, signt User via Admin-API ein, redirected auf Passwort-Setzen-Seite

### Frontend-Anpassungen

- **Login-Seite (`Login.tsx`):** Feld-Label „Benutzername oder E-Mail", ruft vor Auth `resolve-login-identifier`
- **Erst-Login-Guard:** Wenn `must_change_password = true` → Modal „Bitte legen Sie ein neues Passwort fest" (nicht wegklickbar)
- **Magic-Link-Route:** `/login/magic/:token` → Edge Function aufrufen → einloggen → Passwort-Set-Modal

---

## 2. Datenbank-Schema (neue Tabellen)

```sql
-- Aktivierungs-Schalter pro Liegenschaft (Verwalter-Trigger)
CREATE TABLE onboarding_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  activated_by UUID REFERENCES auth.users(id),
  activated_at TIMESTAMPTZ DEFAULT now(),
  deactivated_at TIMESTAMPTZ,
  UNIQUE(building_id)
);

-- Fortschritt pro Eigentümer (Auto-Save in JSONB)
CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  current_step INT DEFAULT 1,
  step_data JSONB DEFAULT '{}',                -- alle Eingaben aller Schritte
  step1_completed_at TIMESTAMPTZ,              -- Stammdaten/SEPA (Pflicht)
  step2_completed_at TIMESTAMPTZ,              -- Wohnungsdaten
  step3_completed_at TIMESTAMPTZ,              -- Gebäudeinformationen
  step4_completed_at TIMESTAMPTZ,              -- Dienstleister
  step5_completed_at TIMESTAMPTZ,              -- Einschätzung
  fully_completed_at TIMESTAMPTZ,
  fab_dismissed_at TIMESTAMPTZ,
  is_repeat_owner BOOLEAN DEFAULT false,       -- Bestandskunde mit anderem Building
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, building_id)
);

-- Inbox für freigabepflichtige Eingaben (Schritte 2–5)
CREATE TABLE onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  building_id UUID NOT NULL REFERENCES buildings(id),
  category TEXT NOT NULL,                       -- 'unit_data' | 'building_info' | 'service_provider' | 'assessment'
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',                -- 'pending' | 'approved' | 'rejected' | 'merged'
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Magic-Links für QR-Code-Login
CREATE TABLE onboarding_magic_links (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Erweiterungen bestehender Tabellen:**
- `buildings.heating_type TEXT` (Gas / Fernwärme / Pellets / Öl / Sonstige) — falls noch nicht vorhanden
- `contact_persons.onboarding_expectations TEXT`
- `contact_persons.willing_cash_audit BOOLEAN`
- `contacts.suggest_in_onboarding BOOLEAN DEFAULT false` — Pflege-Pool für Dienstleister-Vorschläge
- `contacts.onboarding_category TEXT` — z. B. 'hausmeister' | 'heizung' | 'reinigung' | 'winterdienst' | 'sonstige'

**RLS-Policies:**
- Eigentümer: nur eigene `onboarding_progress` (RW), eigene `onboarding_submissions` (Insert + eigene Read)
- Admin/Employee: alles in zugewiesenen Liegenschaften (via `user_can_access_building`)
- `onboarding_activations`: Read für Eigentümer, Write nur Admin
- `onboarding_magic_links`: kein direkter Zugriff, nur via Edge Function (SECURITY DEFINER)

---

## 3. Wizard-UI (Eigentümer-Sicht, mobile-first)

### Komponenten in `src/components/onboarding/`

**`OnboardingWizardModal.tsx`** — Vollbild-Dialog:
- Öffnet automatisch wenn `onboarding_activations.is_active = true` UND `onboarding_progress.fully_completed_at IS NULL`
- Stepper oben (5 Schritte, abgeschlossene grün, aktueller blau)
- **Hard-Block auf Schritt 1:** Kein „X" zum Schließen, „Weiter"-Button disabled bis Zod-Validation grün
- Ab Schritt 2: „Speichern & schließen" + „Überspringen" verfügbar
- Auto-Save bei jedem Feld (debounced 500ms) → `onboarding_progress.step_data` JSONB
- Resume: öffnet immer beim zuletzt aktiven Schritt

**`OnboardingFAB.tsx`** — Floating Action Button:
- Sichtbar wenn Modal nicht offen UND (`step1_completed_at IS NULL` ODER `step1_completed_at > now() - interval '30 days'`)
- Zeigt „X von 5 Schritten erledigt"
- Klick → öffnet Modal beim aktuellen Schritt

**`OnboardingDashboardBanner.tsx`** — Banner auf `/weg-owner/dashboard`:
- Sichtbar nach Schritt 1, solange `fully_completed_at IS NULL`
- Text: „Hilf uns, dein Haus besser zu betreuen — noch X kurze Schritte"

### Step-Komponenten

**`Step1Stammdaten.tsx`** (PFLICHT):
- Adresse, Telefon (mit `BigChoiceCards` für Telefontyp: Privat/Mobil/Geschäftlich)
- E-Mail (optional, aber empfohlen mit Hinweis „für Passwort-Reset & Benachrichtigungen")
- SEPA: IBAN-Eingabe mit Live-Validierung, Mandatsreferenz wird via Trigger generiert
- Ansprechpartner-Benennung (`BigChoiceCards`: „Ich" / „Andere Person" — bei „Andere" Eingabefeld)
- Wunsch/Erwartung (Textarea)
- **Bei `is_repeat_owner = true`:** komplett übersprungen, automatisch als completed markiert mit Toast

**`Step1bSepaPerBuilding.tsx`** (nur bei Bestandskunde):
- `BigChoiceCards`: „Selbes SEPA-Mandat wie für [andere Liegenschaft]" / „Neues Mandat"

**`Step2Wohnungsdaten.tsx`** (Optional):
- Hausgeld (€-Eingabe, große Zahlen-Tastatur auf Mobile)
- MEA-Anteile (z. B. „125/1000")
- Quadratmeter

**`Step3Gebaeude.tsx`** (Optional):
- Heizungsform: 5 große `BigChoiceCards` (Gas / Fernwärme / Pellets / Öl / Sonstige) mit Icons
- Bei „Sonstige" → Freitext
- Wer informiert bei Nachbestellung? (Freitext mit Auto-Suggest aus Kontakten der Liegenschaft)
- ETV-Ort (Freitext)
- Besonderheiten (Textarea)

**`Step4Dienstleister.tsx`** (Optional):
- 4 Kategorien als Akkordeon: Hausmeister / Heizung-Sanitär / Reinigung / Winterdienst
- Pro Kategorie: Liste der `contacts WHERE suggest_in_onboarding = true AND onboarding_category = 'X'`
  + zusätzlich: andere Eigentümer derselben Liegenschaft, die bereits Vorschlag eingereicht haben (`onboarding_submissions WHERE category = 'service_provider'` mit Hinweis „2x von Nachbarn genannt")
- Multi-Select mit großen Tap-Targets, Suchfeld oben
- „+ Eigenen hinzufügen" → modaler Mini-Dialog mit Name + Telefon
- Besonderheiten (Textarea)

**`Step5Einschaetzung.tsx`** (Optional):
- Kassenprüfung: 2 große `BigChoiceCards` (Ja / Nein)
- Hauszustand: `StarScale` (1–5 Sterne, mit Beschriftung „Sehr schlecht" → „Sehr gut")
- Hinweise (Textarea)

**`OnboardingComplete.tsx`** — Abschluss:
- Konfetti-Animation
- „PDF meiner Eingaben herunterladen" (via Edge Function `onboarding-export-pdf`)
- Dankesnachricht

### Reusable UI-Bausteine

**`BigChoiceCard.tsx`** — Große Auswahlkarte (min 80px hoch, Icon links, Text rechts, Haken bei Auswahl)
**`StarScale.tsx`** — 5 Sterne mit Hover/Tap-Feedback, große Touch-Targets (min 56px)
**`ServiceProviderPicker.tsx`** — Suchbarer Multi-Select mit Vorschlagsbadges („von 2 Nachbarn genannt")

---

## 4. Daten-Übernahme (Hybrid-Logik)

### Schritt 1: SOFORT live

`onboarding-submit-step1` Edge Function:
- Validiert mit Zod
- Schreibt direkt in `contacts` (Adresse), `contact_persons` (Telefon, E-Mail, Erwartung), `contact_bank_accounts` (SEPA)
- Setzt `step1_completed_at = now()`
- Bei E-Mail-Hinterlegung: ruft `admin-update-email` auf, damit Login auch mit echter Mail klappt

### Schritte 2–5: Verwalter-Freigabe

`onboarding-submit-step` Edge Function:
- Schreibt in `onboarding_submissions` mit `status = 'pending'`
- Setzt entsprechendes `stepN_completed_at`
- Verwalter sieht es im Cockpit

`onboarding-approve-submission` Edge Function (admin-only):
- Übernimmt Daten in Zieltabellen:
  - `unit_data` → `building_contact_assignments` (MEA, m², Hausgeld)
  - `building_info` → `buildings.heating_type`, ggf. neue Felder
  - `service_provider` → `building_service_providers` ODER neuer `contacts`-Eintrag (wenn Verwalter „als globalen Kontakt anlegen" wählt)
  - `assessment` → `contact_persons.willing_cash_audit`, neue Tabelle `building_assessments` für aggregierte Bewertungen
- Setzt `status = 'approved'`, `reviewed_by`, `reviewed_at`

---

## 5. Verwalter-Cockpit (Building Hub Tab „Onboarding")

**Neuer Tab in `BuildingHub`:** `BuildingOnboardingTab.tsx`

### Sektion 1: Aktivierungsstatus
- Karte mit `Switch`: „Onboarding aktiv für diese Liegenschaft"
- Bei Aktivierung: Button „Begrüßungsbriefe für alle Eigentümer generieren" wird sichtbar
- Anzeige: „Aktiviert am 24.04.2026 von Max Mustermann"

### Sektion 2: Fortschrittsübersicht
- Progress-Bar: „4 von 8 Eigentümern haben Schritt 1 abgeschlossen"
- Tabelle pro Eigentümer mit 5 Status-Icons (✅/⬜) pro Schritt + Spalte „Letzte Aktivität"
- Zeile klickbar → Detail-Sheet mit allen Eingaben des Eigentümers

### Sektion 3: Onboarding-Inbox (Freigaben)
- Liste aller `onboarding_submissions WHERE status = 'pending'`
- Pro Eintrag: Eigentümer-Name, Kategorie-Badge, Vorschlag vs. aktueller Wert (Diff-Ansicht)
- Buttons: „Übernehmen" / „Bearbeiten & Übernehmen" / „Ablehnen" (mit optionaler Notiz)
- Bei Service Providers: Checkbox „Auch als globalen Vorschlag für andere Liegenschaften markieren" (setzt `suggest_in_onboarding = true`)

### Sektion 4: Aggregierte Insights
- „Hauszustand Ø: 4,2 / 5 (3 Bewertungen)"
- „Top-Dienstleister-Nennungen: Hausmeister Müller GmbH (3x), Bayer Sanitär (2x)"
- ⚠️ „Konflikt: 2 verschiedene Heizungsangaben — Gas (3x), Fernwärme (1x)"

### Sektion 5: Briefe & Verlauf
- Liste aller versendeten Begrüßungsbriefe pro Eigentümer mit Datum + Status
- Button „Brief erneut generieren" pro Zeile (z. B. wenn Brief verloren ging — invalidiert altes Initialpasswort/Magic-Link)

---

## 6. Dienstleister-Pool-Verwaltung

**Neue Sektion in `Settings.tsx` → „Onboarding-Vorschläge":**
- Liste aller `contacts` mit Toggle „Im Onboarding vorschlagen"
- Dropdown für Kategorie (Hausmeister/Heizung/Reinigung/Winterdienst/Sonstige)
- Filter: nur vorgeschlagene anzeigen
- Bulk-Aktion: mehrere markieren

---

## 7. Begrüßungsbriefe (Serienbrief mit App-Zugang)

### Standard-Vorlage „Verwaltungsübernahme-Begrüßung"

Eine `.docx`-Datei wird beim ersten Setup als globale Vorlage in Storage abgelegt mit allen Platzhaltern:
- `{{anrede}}`, `{{vorname}}`, `{{nachname}}`, `{{strasse}}`, `{{plz}}`, `{{ort}}`
- `{{liegenschaft_name}}`, `{{liegenschaft_adresse}}`, `{{wohnung_nr}}`, `{{mea}}`
- `{{username}}`, `{{initial_password}}` (nur bei neuen Usern), `{{app_url}}`
- `{{login_qr_code}}` (QR-Code-Bild als base64 eingebettet)
- `{{is_existing_user}}` — Boolean-Flag für Word-Conditional-Sections
- `{{verwalter_name}}`, `{{verwalter_telefon}}`, `{{verwalter_email}}`

**Conditional-Logic in der Vorlage** (via docxtemplater):
- Wenn `is_existing_user = true`: Textblock „Ihre neue Wohnung wurde Ihrem bestehenden Konto hinzugefügt. Loggen Sie sich einfach mit Ihren gewohnten Zugangsdaten ein."
- Wenn `is_existing_user = false`: Textblock „Ihre Zugangsdaten: Benutzername **{{username}}**, Initialpasswort **{{initial_password}}** (bitte beim ersten Login ändern). Alternativ scannen Sie den QR-Code unten."

### Edge Function `comm-render-onboarding-letters`

Erweitert die existierende `comm-render-letters` um Onboarding-spezifische Logik:
1. Empfänger-Liste: alle Eigentümer der Liegenschaft mit `role_in_building = 'eigentuemer'`
2. Pro Eigentümer:
   - Wenn `contacts.user_id IS NULL` (neuer User):
     - `invite-contact-user` aufrufen → erzeugt Auth-User mit Pseudo-Mail
     - `generate-username` → `username`
     - Sicheres Initialpasswort generieren (3 Wörter + Zahl, z. B. „Apfel-Brücke-Wald-47")
     - Via `admin-reset-password` setzen, `must_change_password = true`
     - Magic-Link generieren (24 h) → QR-Code als base64-PNG
   - Wenn `contacts.user_id IS NOT NULL` (Bestandskunde):
     - Username aus `profiles.username` laden
     - Kein neues Passwort, kein QR-Code
     - `is_existing_user = true` setzen
3. `.docx` pro Eigentümer mit docxtemplater rendern, in ZIP packen
4. ZIP in Storage `comm-assets/onboarding-letters/{building_id}/{timestamp}.zip` ablegen
5. ZIP zusätzlich automatisch in **Dokumentenarchiv → Serienbriefe** der Liegenschaft ablegen
6. Eintrag in `comm_campaigns` mit `type = 'onboarding_welcome'`
7. Pro Eigentümer Eintrag in neuer Tabelle `onboarding_letter_log` (für Verlauf + „erneut generieren"-Button)

### Sicherheit

- Klartext-Initialpasswort wird **nirgendwo** in DB gespeichert — nur kurz im RAM während Brief-Rendering
- Magic-Link-Token sind 24 h gültig, nach Verbrauch invalidiert
- „Brief erneut generieren": altes Initialpasswort wird via `admin-reset-password` durch neues ersetzt, alter Magic-Link `used_at = now()` markiert

---

## 8. Bestandskunden-Logik (zusammengefasst)

Da Verwalter den Bestandskontakt **vor** Onboarding-Aktivierung manuell zuweist (kein Duplikat-Suchsystem nötig), ist die Logik schlank:

1. Beim Start des Wizards prüft Frontend: `SELECT user_id FROM contacts WHERE id = X AND user_id IS NOT NULL` → wenn vorhanden, ist es Bestandskunde
2. `onboarding_progress.is_repeat_owner = true` setzen
3. Schritt 1 wird übersprungen (auto-completed mit Toast „Stammdaten bereits hinterlegt")
4. Schritt 1b SEPA-Wiederverwendung wird angezeigt
5. Brief-Generator nutzt `is_existing_user = true` → kein neues Passwort, kein QR-Code

---

## 9. Sichtbarkeitslogik FAB (Reminder ohne Mails)

Frontend-Logik im `WegOwnerLayout`:
```
zeigeFAB =
  onboarding_activations.is_active === true
  AND fully_completed_at === null
  AND (
    step1_completed_at === null
    OR step1_completed_at > now() - 30 Tage
  )
  AND fab_dismissed_at === null
```

Bedeutet:
- Solange Schritt 1 fehlt → FAB **immer** sichtbar
- Sobald Schritt 1 erledigt → FAB noch 30 Tage sichtbar, dann automatisch weg
- Keine Mails, keine Push-Notifications

---

## 10. Lieferumfang Phase 1

✅ DB-Migration: alle 4 neuen Tabellen + Spalten-Erweiterungen + RLS
✅ Username-System: 4 Edge Functions (`generate-username`, `resolve-login-identifier`, `admin-reset-password`, `consume-magic-link`)
✅ Login-Anpassung (Username ODER E-Mail)
✅ Erst-Login-Passwort-Änderungs-Modal
✅ Wizard-Modal mit allen 5 Schritten + Hard-Block auf Schritt 1
✅ Reusable UI: `BigChoiceCard`, `StarScale`, `ServiceProviderPicker`
✅ Auto-Save + Resume + Bestandskunden-Verkürzung
✅ FAB + Dashboard-Banner mit korrekter Sichtbarkeitslogik
✅ Verwalter-Cockpit als neuer „Onboarding"-Tab im Building Hub
✅ Onboarding-Inbox mit Freigabe-Workflow
✅ Dienstleister-Pool-Verwaltung in Settings
✅ Standard-Word-Vorlage „Verwaltungsübernahme-Begrüßung" mit allen Platzhaltern
✅ `comm-render-onboarding-letters` Edge Function (Username-Gen, Initialpasswort, QR-Code)
✅ Brief-Verlauf + „Erneut generieren"-Button im Cockpit

## Bewusst nicht in Phase 1
- KI-gestützte Konflikt-Auflösung (jetzt nur visuelle Markierung)
- Mistral-Aggregation der Freitexte zu Zusammenfassungen
- Verknüpfung zum „WEG-Neuaufnahme"-Prozess (kommt später, wenn Prozessmodul erweitert wird)
- Automatischer Brief-Versand per Post-API (Pin AG / Letterxpress) — Phase 1 nur ZIP zum Selber-Drucken

---

## 11. Sicherheits-Audit-Punkte

- ✅ RLS auf allen neuen Tabellen
- ✅ Pseudo-E-Mail-Domain ist intern, keine externen Mails versendbar
- ✅ Initialpasswort nie persistent in DB
- ✅ Magic-Links 24 h TTL + One-Time-Use
- ✅ Username-Generation mit Reservierten-Liste (admin/root/support/…)
- ✅ Validation triggers (kein CHECK constraint mit `now()`)
- ✅ Edge Functions mit Zod-Validation auf allen Inputs
- ✅ Admin-only Functions prüfen Caller-Rolle via `has_role(auth.uid(), 'admin')`

---

## ⚠️ Wichtige Voraussetzungen (Status)

- ✅ Lovable Cloud / Supabase angebunden
- ✅ `comm-render-letters` & `LetterCampaignWizard` existieren bereits (werden erweitert)
- ✅ `invite-contact-user` Edge Function existiert (wird Username-aware gemacht)
- ✅ `contacts` + `contact_persons` + `contact_building_assignments` Schema existiert
- ⚠️ Pseudo-E-Mail-Domain: keine echten DNS-Records nötig (Mails werden nie versendet), aber sollte **nicht** mit verifizierter Sender-Domain (`notify.rgi-immobilien.app`) kollidieren — wir nehmen `users.rgi-immobilien.app` als rein interne Schlüssel-Domain

---

**Bei Freigabe baue ich Phase 1 vollständig um — DB-Migration zuerst, dann Edge Functions, dann Frontend, am Ende die Word-Vorlage.**

---

## 📊 Umsetzungsstatus

- ✅ **Phase 1 — Datenbank-Schema** (Migration deployed):
  `onboarding_activations`, `onboarding_progress`, `onboarding_submissions`,
  `onboarding_magic_links`, `onboarding_letter_log` + RLS, Trigger,
  `profiles.username/auth_pseudo_email/must_change_password`,
  `contacts.suggest_in_onboarding/onboarding_category`, `buildings.heating_type`.

- ✅ **Phase 2 — Edge Functions** (deployed):
  - `generate-username` — eindeutige Username-Vorschläge aus Name/Firma
  - `resolve-login-identifier` — Username ↔ E-Mail Auflösung vor `signInWithPassword`
  - `admin-reset-password` — Initialpasswort-Generator (4-Wort-Format) mit `must_change_password`-Flag
  - `generate-onboarding-magic-link` — 24h-Token für QR-Code im Begrüßungsbrief
  - `consume-magic-link` — Token-Validierung + Auth-Session-Erzeugung
  - `save-onboarding-step` — Auto-Save (JSONB-Merge) für Wizard-Eingaben
  - `submit-onboarding-step` — Schritt abschließen (Step 1 live, Step 2-5 → Submission-Inbox)

- 🔜 **Phase 3** — Login-Frontend (Username/E-Mail, Erst-Login-Modal, Magic-Link-Route)
- 🔜 **Phase 4** — Wizard-UI (`OnboardingWizardModal`, `BigChoiceCard`, `StarScale`, FAB)
- 🔜 **Phase 5** — Admin-Cockpit (Onboarding-Tab im Building-Hub: Aktivierung, Fortschritt, Inbox)
- 🔜 **Phase 6** — Word-Vorlage + Serienbrief (Username/Initialpasswort/QR-Platzhalter)

