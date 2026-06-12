## Bidirektionaler Name in Begrüßung

### Problem
- Dashboards (`weg-owner/Dashboard.tsx`, `tenant/Dashboard.tsx`) zeigen `profile.first_name` aus der `profiles`-Tabelle.
- Stammdaten werden aber im **Kontakt** gepflegt: Admin über `ContactDetail`, Eigentümer über `OwnerSelfServiceSection`. Diese schreiben in `contacts.first_name` bzw. `contact_building_assignments.first_name_override` — nie in `profiles`. Daher veraltet die Anzeige.

### Lösung — Single Source of Truth = `contacts`
Die Begrüßung liest den Vornamen direkt aus dem an den User gekoppelten Kontakt (`contacts.user_id = auth.uid()`). Beide Editier-Pfade (Admin & Owner) schreiben dorthin → automatisch bidirektional.

#### 1. Neuer Hook `useStammdatenName`
`src/hooks/useStammdatenName.ts`
- Liest `contacts.first_name, last_name` für `user_id = profile.user_id`.
- Realtime-Subscription auf `contacts`-Zeile (UPDATE) → Anzeige aktualisiert sich live, wenn Admin Änderungen speichert oder der User selbst speichert (in anderem Tab).
- Fallback-Kette: `contacts.first_name` → `profile.first_name` → leer.

#### 2. Dashboards umstellen
- `src/pages/weg-owner/Dashboard.tsx` Zeile 175 — `profile?.first_name` → `useStammdatenName().firstName`.
- `src/pages/tenant/Dashboard.tsx` Zeile 142 — analog.

#### 3. Owner-Self-Service: globale Stammdaten editierbar
`src/components/owner/OwnerSelfServiceSection.tsx`
- Neue Card oben „Meine Stammdaten" mit Anrede / Vorname / Nachname / Firmenname / Adresse, die auf `contacts` (per `user_id`) schreibt.
- Die bisherigen Pro-Wohnungs-Overrides bleiben unverändert (für abweichende Anschrift pro Objekt).
- Speichern via vorhandener Edge Function-Logik oder direkter `supabase.from("contacts").update(...)` — RLS erlaubt UPDATE auf den eigenen Kontakt (`user_id = auth.uid()`); falls Policy fehlt, in derselben Aufgabe ergänzen.

#### 4. RLS-Check (Migration falls nötig)
- Vor Implementierung prüfen, ob `contacts` eine UPDATE-Policy `user_id = auth.uid()` für `authenticated` hat. Falls nicht → Migration mit Policy nur für die Felder, die Stammdaten betreffen (Postgres erlaubt keine spaltenscoped Policies; daher Update auf ganze Zeile + zusätzliche Trigger-Validierung verhindert Änderungen an Schutzspalten wie `user_id`).

### Nicht im Scope
- Kein Sync zurück nach `profiles.first_name` (bleibt nur für Auth-Anzeige in Settings).
- Keine Änderung am Onboarding-Flow.
- Keine Migration der bestehenden Pro-Wohnungs-Overrides.

### Dateien
- Neu: `src/hooks/useStammdatenName.ts`
- Edit: `src/pages/weg-owner/Dashboard.tsx`, `src/pages/tenant/Dashboard.tsx`
- Edit: `src/components/owner/OwnerSelfServiceSection.tsx` (neue Stammdaten-Card)
- Ggf. Migration: UPDATE-Policy + Trigger für geschützte Spalten auf `contacts`
