
# Nächtlicher Auto-Logout (02:00) + TOTP-Pflicht für Admin/Employee

## Ziel
- Jeden Tag um 02:00 Uhr werden alle Admin- und Employee-Sessions serverseitig invalidiert.
- Beim nächsten Login müssen Admin/Employee zwingend einen TOTP-Code eingeben.
- Wer noch kein TOTP eingerichtet hat, durchläuft beim Login einen Enrollment-Wizard (QR-Code scannen + 6-stelliger Code).
- Eigentümer/Mieter bleiben unverändert (kein nächtlicher Logout, kein TOTP-Zwang).

## Voraussetzung (manuell durch Nutzer)
Im Supabase Dashboard unter **Authentication → Providers → Multi-Factor Authentication** muss **TOTP** aktiviert sein. (Ein-Klick-Schalter; ist bei neuen Projekten meist schon an. Ich kann das nicht per Migration toggeln.)

## Umsetzung

### 1. Datenbank-Migration
- Neue Spalte `profiles.mfa_required boolean default false` — automatisch `true` bei `role in ('admin','employee')` via Trigger.
- Bestehende Admin/Employee-Profile werden per UPDATE auf `mfa_required = true` gesetzt.
- RPC `public.is_mfa_required(uid)` → liest die Spalte (SECURITY DEFINER, search_path = public), wird vom Frontend aufgerufen.

### 2. Edge Function `nightly-admin-logout` (pg_cron, 02:00 Europe/Berlin)
- Holt alle `user_id`s mit Rolle admin/employee aus `profiles`.
- Ruft pro User `supabase.auth.admin.signOut(userId, 'global')` mit dem `SUPABASE_SERVICE_ROLE_KEY` auf → invalidiert alle Refresh-Tokens sofort.
- pg_cron Job über `supabase--insert` (nicht Migration, da URL/Anon-Key projektspezifisch).
- Cron-Ausdruck: `0 1 * * *` UTC (= 02:00 Berlin Winter; im Sommer 03:00 — siehe „Offene Frage" unten).

### 3. Frontend `src/hooks/useAuth.tsx`
- Nach `SIGNED_IN` / `INITIAL_SESSION`: wenn `profile.mfa_required === true`, prüfen via `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`:
  - `currentLevel === 'aal1'` und `nextLevel === 'aal2'` → User hat TOTP-Faktor, hat ihn aber noch nicht für diese Session verifiziert → redirect nach `/mfa-challenge`.
  - `currentLevel === 'aal1'` und `nextLevel === 'aal1'` → kein Faktor vorhanden → redirect nach `/mfa-enroll`.
  - `currentLevel === 'aal2'` → alles ok, normales Routing.
- Solange der User nicht AAL2 hat, blockiert ein `RequireMfa`-Wrapper alle Admin-Routen.

### 4. Neue Seiten
- `src/pages/MfaEnroll.tsx`: zeigt QR-Code (aus `supabase.auth.mfa.enroll({factorType: 'totp'})`), Eingabefeld für 6-stelligen Code, ruft `supabase.auth.mfa.challenge` + `verify`. Bei Erfolg → `/`.
- `src/pages/MfaChallenge.tsx`: zeigt nur das Eingabefeld für den 6-stelligen Code (User hat schon Faktor), ruft `challenge` + `verify`, dann `/`.
- Beide Seiten in `src/App.tsx` als public Routes registrieren.

### 5. Settings-Erweiterung
- In `src/pages/Settings.tsx` neuer Block „Zwei-Faktor-Authentifizierung" mit Anzeige des aktiven Faktors und „Faktor entfernen / neu einrichten"-Button (`supabase.auth.mfa.unenroll`). So können Admins ihr Gerät wechseln.

## Technische Details

### pg_cron SQL (via supabase--insert)
```sql
select cron.schedule(
  'nightly-admin-logout',
  '0 1 * * *',
  $$ select net.http_post(
    url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/nightly-admin-logout',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
```

### Edge Function Skeleton
```ts
// supabase/functions/nightly-admin-logout/index.ts
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const { data: users } = await admin.from('profiles')
  .select('user_id').in('role', ['admin','employee']);
for (const u of users) {
  await admin.auth.admin.signOut(u.user_id, 'global');
}
```

### Frontend MFA-Check (Auszug)
```ts
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if (profile.mfa_required) {
  if (aal.nextLevel === 'aal2' && aal.currentLevel === 'aal1') navigate('/mfa-challenge');
  else if (aal.nextLevel === 'aal1') navigate('/mfa-enroll');
}
```

## Offene Frage zur Sommerzeit
pg_cron läuft in UTC. `0 1 * * *` = 02:00 Winterzeit / 03:00 Sommerzeit. Alternative: zwei Cron-Jobs (`0 0 * * *` Sommer, `0 1 * * *` Winter — beide nehme ich, der zusätzliche Logout um 01:00 lokal ist halb so wild). **Vorschlag:** wir nehmen einfach `0 1 * * *` (= 02:00 / 03:00 lokal). Falls du strikt 02:00 ganzjährig willst, sag Bescheid, dann nehme ich beide Slots.

## Geänderte/neue Dateien
- **neu**: `supabase/functions/nightly-admin-logout/index.ts`
- **neu**: `src/pages/MfaEnroll.tsx`, `src/pages/MfaChallenge.tsx`
- **neu**: `src/components/RequireMfa.tsx`
- **edit**: `src/hooks/useAuth.tsx` (AAL-Check + Redirect-Logik)
- **edit**: `src/App.tsx` (neue Routes)
- **edit**: `src/components/AdminLayout.tsx` (RequireMfa-Wrapper)
- **edit**: `src/pages/Settings.tsx` (TOTP-Verwaltung)
- **Migration**: `profiles.mfa_required` + Trigger + Backfill
- **pg_cron-Job** via supabase--insert
