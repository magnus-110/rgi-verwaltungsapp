-- Anfragen (Website, Nutzer-App, manuell) im Posteingang. Nur für Admins.

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  nummer bigint generated always as identity,
  kind text not null check (kind in ('verwaltung','bewertung','suchauftrag','kontakt','objekt')),
  source text not null default 'website' check (source in ('website','nutzer_app','manuell')),
  status text not null default 'neu' check (status in ('neu','in_bearbeitung','erledigt')),
  outcome text check (outcome in ('gewonnen','verloren')),
  assigned_to uuid references auth.users(id) on delete set null,
  name text,
  email text,
  phone text,
  data jsonb not null default '{}'::jsonb,
  attribution jsonb not null default '{}'::jsonb,
  page_url text,
  broker_property_id uuid references public.broker_properties(id) on delete set null,
  broker_lead_id uuid references public.broker_leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  consent_at timestamptz,
  ip_hash text,
  is_read boolean not null default false,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inquiries_status_idx on public.inquiries (status, created_at desc);
create index if not exists inquiries_ip_idx on public.inquiries (ip_hash, created_at desc);

create table if not exists public.inquiry_events (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  kind text not null check (kind in ('notiz','status','zuordnung','email','system')),
  body text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inquiry_events_inquiry_idx on public.inquiry_events (inquiry_id, created_at);

alter table public.inquiries enable row level security;
alter table public.inquiry_events enable row level security;

drop policy if exists "Anfragen nur Admins" on public.inquiries;
create policy "Anfragen nur Admins" on public.inquiries
  for all to authenticated
  using (public.rgi_is_admin(auth.uid()))
  with check (public.rgi_is_admin(auth.uid()));

drop policy if exists "Anfragen-Verlauf nur Admins" on public.inquiry_events;
create policy "Anfragen-Verlauf nur Admins" on public.inquiry_events
  for all to authenticated
  using (public.rgi_is_admin(auth.uid()))
  with check (public.rgi_is_admin(auth.uid()));

revoke all on public.inquiries, public.inquiry_events from anon;

create or replace function public.inquiries_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'erledigt' and (old.status is distinct from 'erledigt') then
    new.closed_at := now();
  elsif new.status <> 'erledigt' then
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists inquiries_touch on public.inquiries;
create trigger inquiries_touch before update on public.inquiries
  for each row execute function public.inquiries_touch();

-- Absender für automatische Mails der App (vorerst info@).
alter table public.rgi_company_settings
  add column if not exists system_mail_account_id uuid references public.email_accounts(id) on delete set null;

update public.rgi_company_settings s
   set system_mail_account_id = a.id
  from public.email_accounts a
 where a.email_address = 'info@rgi-immobilien.de'
   and s.system_mail_account_id is null;

-- Protokoll automatischer Mails (Willkommen, Passwort, Schlüssel, Anfragen …)
create table if not exists public.system_mail_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  recipient text not null,
  subject text,
  status text not null check (status in ('gesendet','fehler')),
  error text,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists system_mail_log_ref_idx on public.system_mail_log (ref_type, ref_id, created_at desc);
alter table public.system_mail_log enable row level security;
drop policy if exists "Mail-Protokoll Mitarbeiter lesen" on public.system_mail_log;
create policy "Mail-Protokoll Mitarbeiter lesen" on public.system_mail_log
  for select to authenticated using (public.is_rgi_staff());
revoke all on public.system_mail_log from anon;
