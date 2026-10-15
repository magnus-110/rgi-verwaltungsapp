-- Phase 5: Mietkontrolle und Mahnwesen (15.10.2026)
--
-- Soll-Miete kommt aus den Kostenzeilen der Mieter (contact_building_costs),
-- das Ist aus den Kontobewegungen. Der Abgleich läuft in der Funktion
-- „mietkontrolle" nach festen Regeln; nur bei Abweichungen prüft die KI mit
-- den hinterlegten Infos. Mahnungen gehen als Standardschreiben per E-Mail
-- und App-Nachricht raus – nie per Post, die App kündigt nie selbst.

-- Infos je Mieter (für die KI-Prüfung)
create table if not exists public.tenant_infos (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  assignment_id uuid not null references public.contact_building_assignments(id) on delete cascade,
  art text not null default 'sonstiges' check (art in ('vereinbarung', 'ratenzahlung', 'widerspruch', 'minderung', 'zahlung_angekuendigt', 'sonstiges')),
  text text not null,
  gueltig_bis date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tenant_infos_assignment_idx on public.tenant_infos (assignment_id);

-- Mahnfälle
create table if not exists public.dunning_cases (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  assignment_id uuid not null references public.contact_building_assignments(id) on delete cascade,
  stufe text not null check (stufe in ('erinnerung', 'mahnung1', 'mahnung2')),
  betrag numeric not null default 0,
  posten jsonb not null default '[]'::jsonb,         -- [{monat, text, betrag}]
  geplant_am date not null,
  frist_bis date,
  status text not null default 'geplant' check (status in ('geplant', 'ausgesetzt', 'versendet', 'erledigt', 'fehler')),
  ausgesetzt_grund text,
  ausgesetzt_von uuid references auth.users(id) on delete set null,
  ki_pruefung jsonb,                                 -- {mahnen: bool, begruendung: text, am}
  versendet_am timestamptz,
  kanaele text[],
  email_an text,
  fehler text,
  kuendigung_pruefen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dunning_cases_assignment_idx on public.dunning_cases (assignment_id, status);

-- Einstellungen (eine Zeile)
create table if not exists public.mietkontrolle_einstellungen (
  id int primary key default 1 check (id = 1),
  auto_versand boolean not null default false,
  email_account_id uuid references public.email_accounts(id) on delete set null,
  erinnerung_nach_tagen int not null default 5,
  mahnung_abstand_tagen int not null default 14,
  zahlungsfrist_tagen int not null default 10,
  toleranz_euro numeric not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.mietkontrolle_einstellungen (id) values (1) on conflict do nothing;

alter table public.tenant_infos enable row level security;
alter table public.dunning_cases enable row level security;
alter table public.mietkontrolle_einstellungen enable row level security;

create policy tenant_infos_verwaltung on public.tenant_infos for all to authenticated
  using (public.user_has_admin_access(auth.uid())) with check (public.user_has_admin_access(auth.uid()));
create policy dunning_cases_verwaltung on public.dunning_cases for all to authenticated
  using (public.user_has_admin_access(auth.uid())) with check (public.user_has_admin_access(auth.uid()));
create policy mietkontrolle_einstellungen_verwaltung on public.mietkontrolle_einstellungen for all to authenticated
  using (public.user_has_admin_access(auth.uid())) with check (public.user_has_admin_access(auth.uid()));

revoke all on public.tenant_infos, public.dunning_cases, public.mietkontrolle_einstellungen from anon;
grant select, insert, update, delete on public.tenant_infos, public.dunning_cases to authenticated;
grant select, update on public.mietkontrolle_einstellungen to authenticated;

-- Täglicher Lauf um 8:00 Uhr (Berlin): Abgleich, KI-Prüfung, Versand (falls eingeschaltet)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mietkontrolle') then
    perform cron.unschedule('mietkontrolle');
  end if;
  perform cron.schedule(
    'mietkontrolle',
    '5 6,7 * * *',
    $job$
    select net.http_post(
      url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/mietkontrolle',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('aktion', 'lauf', 'token', (select decrypted_secret from vault.decrypted_secrets where name = 'fints_cron_token')),
      timeout_milliseconds := 300000
    )
    where extract(hour from now() at time zone 'Europe/Berlin') = 8;
    $job$
  );
end $$;
