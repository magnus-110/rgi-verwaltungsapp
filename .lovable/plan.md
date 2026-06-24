# Plan: Telefonie-Historie „Telefonate"

## 1. Datenbank – Migration `call_logs`

Neue Tabelle `public.call_logs`:
- `id uuid pk default gen_random_uuid()`
- `direction text check in ('incoming','outgoing')`
- `status text default 'verpasst'` (`'verpasst'|'angenommen'`)
- `number_raw text`, `number_e164 text`
- `contact_id uuid references contacts(id) on delete set null`
- `building_id uuid references buildings(id) on delete set null`
- `started_at timestamptz default now()`, `connected_at timestamptz`, `ended_at timestamptz`
- `duration_seconds int default 0`
- `note text`, `transcript text`
- `handled boolean default false`, `handled_at timestamptz`
- `created_by uuid`, `created_at timestamptz default now()`

Indizes: `contact_id`, `started_at desc`, `(status, handled)`.

GRANTS (`authenticated`, `service_role`), RLS aktiv. Policies: SELECT/INSERT/UPDATE/DELETE nur, wenn `has_role(auth.uid(),'admin')` ODER `has_role(auth.uid(),'employee')` (analog zu bestehenden internen Tabellen; falls `employee` nicht existiert, nur admin + alle authentifizierten Mitarbeiter über bestehende Rollen-Konvention prüfen).

Helper-Funktion `public.normalize_phone_last8(text) returns text` (alle Nicht-Ziffern raus, letzte 8). Wird sowohl in Edge Function als auch Client verwendet (gleiche Logik wie `find_contact_by_phone`).

Secret `CALL_EVENT_SECRET` via `add_secret` anlegen.

## 2. Edge Function `call-event`

Öffentlich (`verify_jwt = false`), CORS offen, Service-Role-Client.

Body: `{ event: 'incoming'|'connected'|'ended', number: string, secret: string }`.
- Prüft `secret === CALL_EVENT_SECRET`, sonst 401.
- `incoming`: Insert mit `direction='incoming'`, `status='verpasst'`, `started_at=now()`. Kontakt via `find_contact_by_phone` (erste Trefferzeile) → `contact_id` setzen; `building_id` aus erstem aktiven `contact_building_assignments` des Kontakts.
- `connected`: jüngsten offenen Eintrag (`ended_at is null`) mit passendem Last-8-Match → `status='angenommen'`, `connected_at=now()`.
- `ended`: jüngsten offenen Eintrag schließen → `ended_at=now()`, `duration_seconds = ended_at - connected_at` (sonst 0). Status bleibt unverändert.

Eintrag in `supabase/config.toml`.

## 3. Ausgehende Anrufe protokollieren

In `BuildingContactsList.tsx` und `src/components/contacts/ContactDetail.tsx` (sowie wo `toTelHref` als `<a href>` verwendet wird):
- onClick zusätzlich `supabase.from('call_logs').insert({ direction:'outgoing', status:'verpasst', number_raw, number_e164, contact_id, building_id?, created_by: auth.uid })`.
- tel:-Link weiterhin nativ öffnen (kein preventDefault).

Folge-Events (`connected`/`ended`) von PhonerLite aktualisieren den Eintrag über die Last-8-Nummer (jüngster offener Eintrag).

## 4. Postfach-Eintrag „📞 Telefonate"

In der Email-Ordnerliste (links) virtuellen Ordner ergänzen:
- Label „📞 Telefonate", Badge = `count(*) where status='verpasst' and handled=false` (Realtime-Subscription auf `call_logs`).
- Auswahl rendert in der Mitte `CallLogList` statt EmailList.

`CallLogList`:
- Sortierung `started_at desc`. Verpasste/offene oben hervorgehoben (roter Akzent).
- Spalten/Zeile: Richtungs-Icon (↘ eingehend, ↗ ausgehend, rotes ✖ bei verpasst), Name (Kontakt sonst Nummer), Datum/Uhrzeit, Dauer (`mm:ss`).
- Aktionen pro Zeile: Rückruf (`toTelHref` → window.location), Notiz, Transkript, „Kontakt öffnen" (Route `/contacts?id=`), bei verpasst „Erledigt"-Haken (`handled=true, handled_at=now`).

Detail-Pane rechts: Anruf-Details, Notiz-Textarea (autosave debounced), Transkript-Anzeige + „Transkript hinzufügen".

## 5. Notiz & Transkript

- Notiz: `<Textarea>` → Update `call_logs.note`.
- Transkript-Dialog: zwei Tabs „HTML einfügen" / „HTML-Datei wählen". Client-Parsing:
  ```ts
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body?.textContent?.replace(/\s+\n/g,'\n').trim() ?? '';
  ```
  Nur `text` wird in `call_logs.transcript` gespeichert. HTML wird **nicht** persistiert/hochgeladen.

## 6. Wiederverwendbare Komponente `CallHistory`

Neue Komponente `src/components/calls/CallHistory.tsx` (Props: `contactId?`, `buildingId?`). Zeigt gefilterte Liste (gleiche Optik wie Postfach-Liste, kompakter).

Eingebunden in:
- `src/components/contacts/ContactDetail.tsx` – neuer Tab/Abschnitt „Telefonate".
- `src/components/contacts/BuildingContactsList.tsx` – aufklappbar pro Person oder gesamtgebäude­bezogen (`buildingId`).

## Technische Hinweise

- Normalisierung zentral in `src/lib/phone.ts` ergänzen: `lastDigits(raw, n=8)`.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;` für Live-Badge.
- Verpasste Anrufe nur via Rückruf-Liste – keine Todo-Integration.
- Design tokens beibehalten, keine harten Farben außer semantische `destructive` für verpasst-Akzente.

## Validierung

- Migration + Linter.
- `call-event` mit `curl_edge_functions` (incoming → connected → ended) testen, DB-Eintrag prüfen.
- UI: Postfach-Badge, Liste, Notiz/Transkript, Kontakt-/Gebäude-Tab.

## Offene Frage

PhonerLite-Webhook-URL und Secret muss der Nutzer in PhonerLite konfigurieren – ich liefere die URL (`https://eebphowrbarzawwixqcc.supabase.co/functions/v1/call-event`) und Beispiel-Payload nach Implementierung.
