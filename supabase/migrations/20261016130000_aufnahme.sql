-- Aufnahme neuer Liegenschaften (16.10.2026)
-- Ersetzt die alte "Übernahme" im Gebäude: Antworten vom Termin vor Ort
-- stehen als ein JSON-Dokument je Gebäude in "aufnahmen"; was vor Ort
-- festgehalten wird (Notiz oder Vorgang mit Fotos) in "aufnahme_eintraege".
-- Dienstleister landen wie gewohnt in contact_building_assignments.

create table if not exists public.aufnahmen (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null unique references public.buildings(id) on delete cascade,
  termin_am date,
  gespraechspartner text,
  antworten jsonb not null default '{}'::jsonb,
  abgeschlossen_am timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aufnahme_eintraege (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  art text not null check (art in ('notiz', 'vorgang')),
  titel text not null,
  text text,
  ort text,
  gezeigt_von text,
  eile text check (eile in ('normal', 'bald', 'dringend')),
  fotos jsonb not null default '[]'::jsonb,
  case_id uuid references public.cases(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists aufnahme_eintraege_building on public.aufnahme_eintraege(building_id, created_at desc);

alter table public.aufnahmen enable row level security;
alter table public.aufnahme_eintraege enable row level security;

create policy "Büro liest Aufnahmen" on public.aufnahmen for select to authenticated using (public.is_rgi_staff());
create policy "Büro legt Aufnahmen an" on public.aufnahmen for insert to authenticated with check (public.is_rgi_staff());
create policy "Büro ändert Aufnahmen" on public.aufnahmen for update to authenticated using (public.is_rgi_staff()) with check (public.is_rgi_staff());

create policy "Büro liest Einträge" on public.aufnahme_eintraege for select to authenticated using (public.is_rgi_staff());
create policy "Büro legt Einträge an" on public.aufnahme_eintraege for insert to authenticated with check (public.is_rgi_staff());
create policy "Büro ändert Einträge" on public.aufnahme_eintraege for update to authenticated using (public.is_rgi_staff()) with check (public.is_rgi_staff());
create policy "Büro löscht Einträge" on public.aufnahme_eintraege for delete to authenticated using (public.is_rgi_staff());

create or replace function public.aufnahmen_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger aufnahmen_touch before update on public.aufnahmen for each row execute function public.aufnahmen_touch();

-- Fotos der Eigentümer aus dem Fragebogen darf das ganze Büro sehen
create policy "Onboarding: Büro liest Anhänge"
on storage.objects for select
to authenticated
using (bucket_id = 'onboarding-attachments' and public.is_rgi_staff());

-- Reihenfolge der Umsätze wie im Kontoauszug der Bank
alter table public.bank_transactions add column if not exists bank_reihenfolge bigint;
create index if not exists bank_transactions_reihenfolge on public.bank_transactions(booking_date desc, bank_reihenfolge desc);
create or replace function public.bank_reihenfolge_nachtragen(p_hashes text[], p_werte bigint[])
returns integer language sql security definer set search_path to 'public' as $$
  with x as (select unnest(p_hashes) h, unnest(p_werte) w),
  u as (
    update bank_transactions t set bank_reihenfolge = x.w
    from x where t.transaction_hash = x.h and t.bank_reihenfolge is null
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function public.bank_reihenfolge_nachtragen(text[], bigint[]) from public, anon, authenticated;
grant execute on function public.bank_reihenfolge_nachtragen(text[], bigint[]) to service_role;
