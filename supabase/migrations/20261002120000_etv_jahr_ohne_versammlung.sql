-- =====================================================================
--  Versammlungen – Jahr ohne Versammlung in der App als erledigt
--
--  Für WEGs, deren Versammlung im laufenden Jahr noch von der
--  Vorverwaltung oder vor Einführung der App abgehalten wurde.
--  Ein Eintrag je Liegenschaft und Jahr; im Jahresplan erscheint die
--  Liegenschaft dann unter „Abgeschlossen“ statt „Noch offen“.
--  Rein ergänzend, nichts Bestehendes wird verändert.
-- =====================================================================

create table if not exists public.etv_year_exemptions (
  building_id uuid not null references public.buildings(id) on delete cascade,
  year        integer not null check (year between 2000 and 2100),
  -- extern = Versammlung außerhalb der App (Vorverwaltung oder vor Einführung der App)
  reason      text not null default 'extern'
              check (reason in ('extern', 'sonstiges')),
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  primary key (building_id, year)
);

alter table public.etv_year_exemptions enable row level security;

drop policy if exists "Admins manage etv year exemptions" on public.etv_year_exemptions;
create policy "Admins manage etv year exemptions"
  on public.etv_year_exemptions for all
  to authenticated
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));

-- Bestand 2026: Versammlung durch Vorverwaltung bzw. vor der App abgehalten
insert into public.etv_year_exemptions (building_id, year, reason, created_by)
values
  ('5f0bf67e-ddc3-4e34-80c1-32fd88ba1dc4', 2026, 'extern', null), -- Marktoberdorferstr. 40-42
  ('463c4936-2a70-46a3-888b-923638166e9b', 2026, 'extern', null), -- Vilstalstr. 11/11a
  ('f3db9913-3329-4135-b541-5911ee99b308', 2026, 'extern', null), -- Tirolerstr. 125
  ('2ed44b23-36a3-48de-8472-46dddf660a5a', 2026, 'extern', null), -- Rudolfstrasse 2e
  ('f9a9566b-867d-48c6-86e5-70a8a6edfba3', 2026, 'extern', null), -- St.-Wolfgang-Str. 6
  ('063dbfb1-1717-4571-89ba-79570a80f15b', 2026, 'extern', null), -- König-Ludwig-Weg 19
  ('44899d2f-c916-4a00-ba9f-10914f73314a', 2026, 'extern', null)  -- Beispielgebäude
on conflict (building_id, year) do nothing;
