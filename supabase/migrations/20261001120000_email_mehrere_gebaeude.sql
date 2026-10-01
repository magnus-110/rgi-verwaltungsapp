-- =====================================================================
--  Eine E-Mail kann mehrere Liegenschaften betreffen
--
--  emails.building_id bleibt das Haupt-Gebäude: daran hängen Vorgänge,
--  ETV-Relevanz und die Stammakte. Hier stehen nur die ZUSÄTZLICHEN
--  Gebäude — so bleibt alles Bestehende unberührt, und der Filter im
--  Postfach findet die Mail trotzdem unter jedem genannten Gebäude.
-- =====================================================================
create table if not exists public.email_buildings (
  email_id    uuid not null references public.emails(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (email_id, building_id)
);

create index if not exists idx_email_buildings_building on public.email_buildings(building_id);

alter table public.email_buildings enable row level security;

drop policy if exists "Admins can manage email_buildings" on public.email_buildings;
create policy "Admins can manage email_buildings"
  on public.email_buildings for all
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));
