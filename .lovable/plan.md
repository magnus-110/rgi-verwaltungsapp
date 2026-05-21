# Externe Vollmacht in App übernehmen

Ein Eigentümer, der von einem anderen Eigentümer einen externen Vollmacht-Link erhalten hat, soll diesen direkt in seinem Owner-Portal "einlösen" können – kein Wechsel zwischen App und anonymem Token-Link mehr. Der Vollmachtgeber bleibt jederzeit Herr über seine Vollmacht und kann sie zurückziehen; der Verwalter greift bewusst nicht ein.

## Was gebaut wird

### 1. Neue Edge Function `redeem-proxy-token`
- Input: `token` (UUID) + JWT des eingeloggten Eigentümers
- Validiert: Token existiert, `proxy_token_used = false`, Meeting nicht abgeschlossen
- Ermittelt `contact_id` des eingeloggten Users (über `auth.uid()` → `profiles.contact_id`)
- Update auf `etv_attendees`:
  - `proxy_type = 'owner'`
  - `proxy_contact_id = <eingeloggter Eigentümer>`
  - `proxy_token_used = true` (entwertet den Link → externer Zugriff ab jetzt gesperrt)
  - `checked_in_at = now()`, falls der einlösende Eigentümer selbst bereits anwesend/present ist
- Antwort: Meeting-ID + Anzahl jetzt erhaltener Vollmachten, damit das Frontend direkt zur Versammlung navigieren kann

### 2. Owner-Portal: Button "Externe Vollmacht einlösen"
- Im Versammlungs-Bereich des Owner-Portals (Karte je Meeting) ein neuer Button
- Dialog mit Textfeld: Token ODER kompletter Link einfügbar (Frontend extrahiert UUID per Regex aus `/etv-proxy/<uuid>`)
- Ruft `redeem-proxy-token` auf, zeigt Toast "Vollmacht übernommen" und invalidiert die Queries für erhaltene Vollmachten
- Die bestehende "Erhaltene Vollmachten"-Sektion (siehe Memory *Owner Portal Received Proxies*) zeigt die übernommene Stimme dann automatisch mit – inkl. evtl. vorhandener `pre_vote_instructions`

### 3. Auto-Erkennung auf `/etv-proxy/:token`
- `EtvProxy.tsx` prüft beim Mount, ob eine aktive Supabase-Session existiert
- Wenn ja: Banner oben einblenden – "Du bist als <Name> eingeloggt. Möchtest du diese Vollmacht direkt in dein Konto übernehmen?" → Button ruft dieselbe Edge Function und leitet danach auf das Owner-Portal-Meeting weiter
- Wenn nein: bisheriger anonymer Token-Flow bleibt unverändert

### 4. Rückziehen durch den Vollmachtgeber
- Im Owner-Portal existiert bereits die Übersicht "Erteilte Vollmachten" pro Versammlung. Dort wird ein Button "Vollmacht zurückziehen" ergänzt – auch dann verfügbar, wenn die Vollmacht bereits eingelöst wurde (solange das Meeting noch nicht abgeschlossen ist)
- Neue Edge Function `revoke-proxy` (oder direkter Update via RLS, je nach bestehender Policy-Lage): setzt `proxy_type`, `proxy_contact_id`, `proxy_token`, `proxy_token_used` zurück und `attendance_type = 'absent'`; löscht ggf. bereits abgegebene Stimmen des Bevollmächtigten für diesen Geber, falls Wahlgänge noch nicht abgeschlossen sind
- Verwalter-UI (`AttendeeManager`) bekommt **bewusst keine** Rückziehen-Funktion – Read-only-Anzeige des Status genügt

## Technische Details

**Geänderte/neue Dateien:**
- `supabase/functions/redeem-proxy-token/index.ts` (neu) – CORS, JWT-Validierung, Token-Einlösung
- `supabase/functions/revoke-proxy/index.ts` (neu) – Rückziehen durch Geber
- `src/components/owner/...` – neuer Dialog "Vollmacht einlösen" + Erweiterung der "Erteilte Vollmachten"-Karte um Rückziehen-Button
- `src/pages/EtvProxy.tsx` – Session-Check + "In Konto übernehmen"-Banner
- Optional: kleine SQL-Migration für eine RLS-Policy "Vollmachtgeber darf eigenes attendee-Record zurücksetzen", falls nicht via Edge Function gelöst

**Sicherheitslogik:**
- Token = Berechtigungsnachweis fürs Einlösen (wie heute beim externen Voten)
- Nach Einlösung: `proxy_token_used = true` → `EtvProxy.tsx` zeigt der externen Link-Variante "Diese Vollmacht wurde bereits übernommen"
- Rückziehen prüft serverseitig, dass `auth.uid()` zum `contact_id` des ursprünglichen Vollmachtgebers (`assignment_id → contact`) gehört

**Edge Cases:**
- Token gehört zu Meeting, an dem der Einlösende nicht teilnahmeberechtigt ist → Fehler "Du bist kein Eigentümer dieser Versammlung"
- Token bereits eingelöst → Fehler mit Hinweis "Bitte beim Vollmachtgeber neuen Link anfordern"
- Meeting im Status `completed`/`closed` → kein Einlösen/Rückziehen mehr möglich

## Aufwand-Einschätzung
Klein bis mittel: 2 Edge Functions, 1 Dialog, kleine Anpassung an `EtvProxy.tsx` und der "Erteilte Vollmachten"-UI. Datenmodell bleibt unverändert.
