-- Elektronische Unterschrift: Unterzeichner dürfen – wenn RGI es freigibt – beim Unterschreiben
-- selbst Angaben im Dokument ERGÄNZEN (freier Text an beliebiger Stelle) oder KORRIGIEREN
-- (Bereich durchstreichen + „Richtig ist: …“).
--
-- Entscheidung: eigene Tabelle statt sign_request_fields wiederzuverwenden.
--  - Ausfüllfelder legt RGI VOR dem Versand an (Lage, Pflicht, Ausfüller, Abhängigkeiten stehen fest,
--    der Unterzeichner setzt nur den Wert). Ergänzungen entstehen erst beim Unterschreiben, gehören
--    immer genau einem Unterzeichner, sind danach unveränderlich und verändern den Inhalt des Dokuments.
--    In sign_request_fields müssten alle bestehenden Prüfungen (Pflicht, Gruppe, Ausfüller, feld_key
--    eindeutig, Vorab-Werte, Liste „Ausgefüllte Felder“) diese Zeilen jedes Mal ausnehmen.
--  - Eine Korrektur ist EIN Datensatz: durchgestrichener Bereich (bereich) + Ersatztext (x/y/w/h, text)
--    – kein Bezug zwischen zwei Zeilen nötig.
--  - Nur Lesen für das Büro (RLS); geschrieben wird ausschließlich von sign-public beim Unterschreiben.
create table if not exists public.sign_request_ergaenzungen (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  signer_id uuid not null references public.sign_request_signers(id) on delete cascade,
  art text not null check (art in ('ergaenzung', 'korrektur')),
  position integer not null default 0,
  -- Textfeld (Ergänzung bzw. Ersatztext der Korrektur): PDF-Punkte, Ursprung oben links der
  -- angezeigten Seite, page 0-basiert (wie placements / sign_request_fields)
  page integer not null check (page >= 0),
  x numeric not null,
  y numeric not null,
  w numeric not null check (w > 0),
  h numeric not null check (h > 0),
  -- nur Korrektur: durchgestrichener Bereich {x, y, w, h} auf derselben Seite
  bereich jsonb,
  text text not null check (char_length(text) between 1 and 300),
  erstellt_von text not null,
  erstellt_am timestamptz not null default now(),
  check ((art = 'ergaenzung' and bereich is null) or (art = 'korrektur' and bereich is not null))
);

create index if not exists sign_request_ergaenzungen_request_idx on public.sign_request_ergaenzungen (request_id, position);
create index if not exists sign_request_ergaenzungen_signer_idx on public.sign_request_ergaenzungen (signer_id);

alter table public.sign_request_ergaenzungen enable row level security;
create policy "Büro: Ergänzungen lesen" on public.sign_request_ergaenzungen for select to authenticated
  using (public.is_rgi_staff());

comment on table public.sign_request_ergaenzungen is
  'Ergänzungen/Korrekturen eines Unterzeichners beim elektronischen Unterschreiben (nur wenn sign_request_signers.darf_ergaenzen). Geschrieben nur von sign-public (sign), im PDF dunkelblau eingesetzt.';

-- Freigabe je Unterzeichner (Standard aus)
alter table public.sign_request_signers add column if not exists darf_ergaenzen boolean not null default false;
comment on column public.sign_request_signers.darf_ergaenzen is
  'true = darf beim elektronischen Unterschreiben eigene Angaben ergänzen/korrigieren (sign_request_ergaenzungen).';

-- Hinweis „Ergänzt – prüfen“ in /unterschriften, bis jemand „Geprüft“ klickt (Ereignis ergaenzungen_geprueft)
alter table public.sign_requests add column if not exists ergaenzungen_pruefen boolean not null default false;
comment on column public.sign_requests.ergaenzungen_pruefen is
  'true = ein Unterzeichner hat Angaben ergänzt/korrigiert, Prüfung durch RGI steht aus (sign-request ergaenzungen_geprueft setzt zurück).';
