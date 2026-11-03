-- Elektronische Unterschrift: Ausfüllfelder (Ankreuzfeld, Auswahlgruppe „genau eins“, Datum, Text).
--
-- Entscheidung: eigene Tabelle statt jsonb-Spalte am Vorgang.
--  - Mehrere Unterzeichner füllen gleichzeitig aus → zeilenweise Updates ohne Überschreiben
--    fremder Werte (kein Lesen-Ändern-Schreiben eines ganzen jsonb-Arrays).
--  - Je Feld nachweisbar, wer es wann ausgefüllt hat (wert_gesetzt_*), für Prüfblatt und Protokoll.
--  - Prüfungen (Typ, Gruppe, Ausfüller) als Constraints; Abfragen je Unterzeichner einfach.
-- Unterschriftsfelder bleiben wie bisher in sign_request_signers.placements (Rückwärtskompatibilität).
-- Zugriff: Büro (is_rgi_staff) über RLS; die öffentliche Seite liest/schreibt nur über sign-public.
create table if not exists public.sign_request_fields (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  feld_key text not null,
  typ text not null check (typ in ('ankreuz', 'auswahl', 'datum', 'text')),
  position integer not null default 0,
  -- Lage wie placements: PDF-Punkte, Ursprung oben links der angezeigten Seite, page 0-basiert
  page integer not null check (page >= 0),
  x numeric not null,
  y numeric not null,
  w numeric not null check (w > 0),
  h numeric not null check (h > 0),
  beschriftung text not null default '',
  -- Auswahlgruppe „genau eins“: gleiche gruppe, je Feld eine option
  gruppe text,
  option text,
  -- 'rgi' = vorab durch RGI (Wert steht beim Anlegen fest) · 'unterzeichner' = signer_id füllt beim Unterschreiben aus
  ausfueller text not null check (ausfueller in ('rgi', 'unterzeichner')),
  signer_id uuid references public.sign_request_signers(id) on delete cascade,
  ausfueller_rolle text,
  pflicht boolean not null default false,
  -- nur aktiv/Pflicht, wenn: {"feld_key": "…"} angekreuzt bzw. {"gruppe": "…", "option": "…"} gewählt
  abhaengig_von jsonb,
  max_laenge integer check (max_laenge is null or (max_laenge between 1 and 500)),
  -- Wert: ankreuz/auswahl 'ja' oder null · datum JJJJ-MM-TT · text
  wert text,
  wert_gesetzt_von text,
  wert_gesetzt_signer_id uuid references public.sign_request_signers(id) on delete set null,
  wert_gesetzt_user_id uuid,
  wert_gesetzt_am timestamptz,
  -- Herkunft: manuell · vorlage (Anker in unserer Vorlage) · vorschlag (Erkennung in fremden PDFs)
  quelle text not null default 'manuell' check (quelle in ('manuell', 'vorlage', 'vorschlag')),
  -- Lage des unsichtbaren Vorlagen-Ankers (wird im fertigen PDF überdeckt)
  anker jsonb,
  created_at timestamptz not null default now(),
  unique (request_id, feld_key),
  check (ausfueller = 'rgi' or signer_id is not null),
  check (typ <> 'auswahl' or (gruppe is not null and option is not null))
);

create index if not exists sign_request_fields_request_idx on public.sign_request_fields (request_id, position);
create index if not exists sign_request_fields_signer_idx on public.sign_request_fields (signer_id);

alter table public.sign_request_fields enable row level security;
create policy "Büro: Ausfüllfelder" on public.sign_request_fields for all to authenticated
  using (public.is_rgi_staff()) with check (public.is_rgi_staff());

comment on table public.sign_request_fields is
  'Ausfüllfelder eines Unterschriften-Vorgangs (Ankreuzfeld, Auswahl genau eins, Datum, Text). Werte von RGI vorab oder vom Unterzeichner beim Unterschreiben (sign-public sign). Unterschriftsfelder bleiben in sign_request_signers.placements.';
