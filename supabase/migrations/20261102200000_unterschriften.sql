-- Elektronische Unterschrift (Textform § 126b BGB): Vorgänge, Unterzeichner, Protokoll, Mail-Vorlagen.
-- Öffentliche Seiten laufen ausschließlich über die Edge-Funktion sign-public (Service-Rolle, Token-Hash);
-- die Tabellen sind nur für Büro-Mitarbeiter lesbar/schreibbar.

create sequence if not exists public.sign_request_nummer_seq;

create or replace function public.naechste_sign_nummer()
returns text language sql volatile set search_path = public as $$
  select 'SIG-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-' || lpad(nextval('public.sign_request_nummer_seq')::text, 4, '0')
$$;

create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  nummer text not null unique default public.naechste_sign_nummer(),
  typ text not null default 'ausgehend' check (typ in ('ausgehend', 'eingehend', 'etv_protokoll')),
  dokumentart text not null default 'sonstiges'
    check (dokumentart in ('verwaltervertrag','vollmacht','umlaufbeschluss','dienstleistervertrag','angebot','protokoll','abnahme','sonstiges')),
  titel text not null,
  building_id uuid references public.buildings(id) on delete set null,
  -- Woher das Dokument kommt (Klick in der Übersicht springt dorthin)
  quelle_typ text check (quelle_typ in ('building_file','email_attachment','offer','contract','etv_meeting','upload')),
  quelle_id uuid,
  quelle_label text,
  source_bucket text,
  source_path text,
  seitenzahl int,
  status text not null default 'offen' check (status in ('entwurf','offen','abgeschlossen','zurueckgezogen','abgelaufen')),
  frist date,
  reihenfolge text not null default 'gleichzeitig' check (reihenfolge in ('gleichzeitig','nacheinander')),
  mail_betreff text,
  mail_text text,
  erinnerung boolean not null default true,
  kopie_dms boolean not null default true,
  -- Ergebnis
  final_bucket text,
  final_path text,
  final_file_id uuid references public.building_files(id) on delete set null,
  final_sha256 text,
  zeitstempel_token text,
  zeitstempel_dienst text,
  zeitstempel_zeit timestamptz,
  completed_at timestamptz,
  -- Eingehende Dokumente (von uns zu unterschreiben)
  email_id uuid references public.emails(id) on delete set null,
  zugewiesen_an uuid,
  antwort_an text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sign_requests_quelle_idx on public.sign_requests (quelle_typ, quelle_id);
create index if not exists sign_requests_status_idx on public.sign_requests (status, frist);
create index if not exists sign_requests_building_idx on public.sign_requests (building_id);

create table if not exists public.sign_request_signers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  position int not null default 1,
  rolle text,                 -- Anzeige: „Beiratsvorsitz“, „Eigentümer“, „Versammlungsleiter“ …
  rolle_key text,             -- ETV: leiter | protokollant | eigentuemer | beirat
  contact_id uuid references public.contacts(id) on delete set null,
  user_id uuid,               -- interne Unterzeichner (RGI)
  name text not null,
  email text,
  anrede text,                -- z. B. „Guten Tag Herr Mustermann“
  methode text not null default 'online' check (methode in ('online','papier','intern')),
  status text not null default 'offen'
    check (status in ('wartet','offen','geoeffnet','unterschrieben','papier_eingegangen','papier_uebernommen','abgelehnt','zurueckgezogen')),
  token_hash text unique,
  expires_at timestamptz,
  eingeladen_at timestamptz,
  geoeffnet_at timestamptz,
  typed_name text,
  signature_png text,
  consent_text text,
  ip text,
  user_agent text,
  signed_at timestamptz,
  signed_by uuid,             -- intern: angemeldeter Mitarbeiter
  placements jsonb,           -- [{page,x,y,w,h}] in PDF-Punkten, Ursprung oben links (wie src/lib/pdfSign.ts)
  ort_datum boolean not null default true,
  ort text,                   -- intern: Ort vor dem Datum („Pfronten, 03.11.2026“)
  paper_bucket text,
  paper_path text,
  paper_page_count int,
  paper_eingang text check (paper_eingang in ('upload','email')),
  paper_email_id uuid references public.emails(id) on delete set null,
  paper_eingang_at timestamptz,
  paper_pruefung jsonb,
  copy_sent_at timestamptz,
  reminder_count int not null default 0,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sign_request_signers_request_idx on public.sign_request_signers (request_id, position);
create index if not exists sign_request_signers_contact_idx on public.sign_request_signers (contact_id);

create table if not exists public.sign_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  signer_id uuid references public.sign_request_signers(id) on delete cascade,
  ereignis text not null,     -- angelegt, versendet, geoeffnet, heruntergeladen, unterschrieben, kopie_versendet, scan_eingegangen, uebernommen, abgelehnt, erinnert, zurueckgezogen, abgeschlossen, endfassung_versendet, abgelaufen
  details jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists sign_request_events_request_idx on public.sign_request_events (request_id, created_at);
-- Eingehende Mails nur einmal verarbeiten (cron): Suche über details->>'email_id'
create index if not exists sign_request_events_email_idx on public.sign_request_events ((details->>'email_id')) where details ? 'email_id';

create table if not exists public.sign_mail_templates (
  dokumentart text primary key
    check (dokumentart in ('verwaltervertrag','vollmacht','umlaufbeschluss','dienstleistervertrag','angebot','protokoll','abnahme','sonstiges')),
  bezeichnung text not null,
  betreff text not null,
  text text not null,
  frist_tage int not null default 14,
  erinnerung_nach_tagen int not null default 5,
  updated_at timestamptz not null default now()
);

insert into public.sign_mail_templates (dokumentart, bezeichnung, betreff, text, frist_tage, erinnerung_nach_tagen) values
 ('verwaltervertrag','Verwaltervertrag','Bitte unterschreiben: {Dokument} – {Objekt}',
  E'{Anrede},\n\nanbei der Verwaltervertrag wie in der Eigentümerversammlung beschlossen. Bitte prüfen und unterschreiben Sie bis zum {Frist}.', 14, 5),
 ('vollmacht','Vollmacht','Bitte unterschreiben: {Dokument} – {Objekt}',
  E'{Anrede},\n\nanbei die Vollmacht zur Eigentümerversammlung. Bitte prüfen und unterschreiben Sie bis zum {Frist}.', 7, 3),
 ('umlaufbeschluss','Umlaufbeschluss','Bitte unterschreiben: {Dokument} – {Objekt}',
  E'{Anrede},\n\nanbei der Umlaufbeschluss. Bitte prüfen Sie den Beschlussvorschlag und unterschreiben Sie bis zum {Frist}.', 14, 5),
 ('dienstleistervertrag','Dienstleistervertrag','Bitte unterschreiben: {Dokument} – {Objekt}',
  E'{Anrede},\n\nanbei der Vertrag für das Objekt {Objekt}. Bitte prüfen und unterschreiben Sie bis zum {Frist}.', 14, 5),
 ('angebot','Angebot','Bitte unterschreiben: {Dokument} – {Objekt}',
  E'{Anrede},\n\nanbei unser Angebot. Wenn Sie einverstanden sind, unterschreiben Sie es bitte bis zum {Frist}.', 14, 5),
 ('protokoll','ETV-Protokoll','Bitte unterschreiben: Protokoll {Dokument} – {Objekt}',
  E'{Anrede},\n\nanbei die Niederschrift der Eigentümerversammlung. Bitte prüfen und unterschreiben Sie bis zum {Frist}.', 7, 3),
 ('abnahme','Abnahmeprotokoll','Bitte unterschreiben: {Dokument} – {Objekt}',
  E'{Anrede},\n\nanbei das Abnahmeprotokoll. Bitte prüfen und unterschreiben Sie bis zum {Frist}.', 7, 3),
 ('sonstiges','Sonstiges Dokument','Bitte unterschreiben: {Dokument} – {Objekt}',
  E'{Anrede},\n\nanbei das Dokument „{Dokument}“. Bitte prüfen und unterschreiben Sie bis zum {Frist}.', 14, 5)
on conflict (dokumentart) do nothing;

alter table public.sign_requests enable row level security;
alter table public.sign_request_signers enable row level security;
alter table public.sign_request_events enable row level security;
alter table public.sign_mail_templates enable row level security;

create policy "Büro: Unterschriften-Vorgänge" on public.sign_requests for all to authenticated using (public.is_rgi_staff()) with check (public.is_rgi_staff());
create policy "Büro: Unterzeichner" on public.sign_request_signers for all to authenticated using (public.is_rgi_staff()) with check (public.is_rgi_staff());
create policy "Büro: Unterschriften-Protokoll" on public.sign_request_events for all to authenticated using (public.is_rgi_staff()) with check (public.is_rgi_staff());
create policy "Büro: Unterschriften-Mailvorlagen" on public.sign_mail_templates for all to authenticated using (public.is_rgi_staff()) with check (public.is_rgi_staff());

create or replace function public.sign_requests_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger sign_requests_touch before update on public.sign_requests for each row execute function public.sign_requests_touch();

comment on table public.sign_requests is 'Unterschriften-Vorgänge (SIG-JJJJ-####): ausgehend, eingehend (von uns zu unterschreiben), etv_protokoll.';

-- Nachtrag (bereits ausgerollte Datenbank): Ort für interne Unterschriften
alter table public.sign_request_signers add column if not exists ort text;
