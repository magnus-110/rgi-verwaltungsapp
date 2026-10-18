-- Maklerbereich neu: Stand, Website/Nutzer-App, Referenzen, Zuständige, Fotos,
-- Unterlagen, Rechte für mehrere Makler, öffentliche Liste für die Website.

-- ---------------------------------------------------------------------------
-- Objekte
-- ---------------------------------------------------------------------------
alter table public.broker_properties
  add column if not exists status text not null default 'vermarktung',
  add column if not exists website_state text not null default 'aktiv',
  add column if not exists show_on_website boolean not null default false,
  add column if not exists show_in_portal boolean not null default false,
  add column if not exists is_reference boolean not null default false,
  add column if not exists reference_order integer,
  add column if not exists display_order integer,
  add column if not exists display_hidden boolean not null default false,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists slug text,
  add column if not exists street text,
  add column if not exists house_number text,
  add column if not exists district text,
  add column if not exists property_subtype text,
  add column if not exists warm_rent_eur numeric,
  add column if not exists energy_certificate_type text,
  add column if not exists energy_source text,
  add column if not exists energy_certificate_date date,
  add column if not exists commission_text text,
  add column if not exists legacy_website_id uuid,
  add column if not exists closed_at timestamptz;

do $$ begin
  alter table public.broker_properties add constraint broker_properties_status_check
    check (status in ('entwurf','vermarktung','reserviert','abgeschlossen'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.broker_properties add constraint broker_properties_website_state_check
    check (website_state in ('aktiv','reserviert','verkauft','vermietet'));
exception when duplicate_object then null; end $$;

create unique index if not exists broker_properties_slug_key on public.broker_properties (slug) where slug is not null;
create unique index if not exists broker_properties_legacy_key on public.broker_properties (legacy_website_id) where legacy_website_id is not null;

-- Bestehende Objekte: aktiv → in Vermarktung, inaktiv → Entwurf; Zuständig = Ersteller.
update public.broker_properties set status = case when is_active then 'vermarktung' else 'entwurf' end
 where status = 'vermarktung' and not is_active;
update public.broker_properties set assigned_to = created_by where assigned_to is null;

-- ---------------------------------------------------------------------------
-- Einstellungen und Vertretungen
-- ---------------------------------------------------------------------------
create table if not exists public.broker_settings (
  id boolean primary key default true check (id),
  team_sees_all boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.broker_settings (id) values (true) on conflict do nothing;

create table if not exists public.broker_deputies (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references auth.users(id) on delete cascade,
  deputy_id uuid not null references auth.users(id) on delete cascade,
  until date,
  created_at timestamptz not null default now(),
  unique (broker_id, deputy_id)
);

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
-- Makler = Büro-Mitarbeiter (mit Zwei-Faktor) mit Makler-Freigabe, oder Admin.
create or replace function public.broker_is_broker()
returns boolean language sql stable security definer set search_path = public as $$
  select public.rgi_is_admin(auth.uid())
      or (public.is_rgi_staff() and exists (
            select 1 from public.profiles p where p.user_id = auth.uid() and p.broker_mode_enabled));
$$;

-- Darf die angemeldete Person dieses Objekt sehen/bearbeiten?
create or replace function public.broker_can_access(_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.rgi_is_admin(auth.uid())
      or (public.broker_is_broker() and exists (
            select 1 from public.broker_properties bp
             where bp.id = _property_id
               and (bp.assigned_to = auth.uid()
                    or bp.created_by = auth.uid()
                    or bp.assigned_to is null
                    or (select team_sees_all from public.broker_settings limit 1)
                    or exists (select 1 from public.broker_deputies d
                                where d.broker_id = bp.assigned_to and d.deputy_id = auth.uid()
                                  and (d.until is null or d.until >= current_date)))));
$$;

revoke execute on function public.broker_is_broker() from anon;
revoke execute on function public.broker_can_access(uuid) from anon;

alter table public.broker_properties enable row level security;
alter table public.broker_leads enable row level security;
alter table public.broker_lead_events enable row level security;
alter table public.broker_property_notes enable row level security;
alter table public.broker_settings enable row level security;
alter table public.broker_deputies enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('broker_properties','broker_leads','broker_lead_events','broker_property_notes')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "Makler Objekte lesen" on public.broker_properties for select to authenticated
  using (public.broker_can_access(id));
create policy "Makler Objekte anlegen" on public.broker_properties for insert to authenticated
  with check (public.broker_is_broker());
create policy "Makler Objekte ändern" on public.broker_properties for update to authenticated
  using (public.broker_can_access(id)) with check (public.broker_is_broker());
create policy "Makler Objekte löschen" on public.broker_properties for delete to authenticated
  using (public.rgi_is_admin(auth.uid()) or (public.broker_can_access(id) and status = 'entwurf' and created_by = auth.uid()));

create policy "Makler Interessenten" on public.broker_leads for all to authenticated
  using (public.broker_can_access(property_id)) with check (public.broker_can_access(property_id));
create policy "Makler Verlauf" on public.broker_lead_events for all to authenticated
  using (exists (select 1 from public.broker_leads l where l.id = lead_id and public.broker_can_access(l.property_id)))
  with check (exists (select 1 from public.broker_leads l where l.id = lead_id and public.broker_can_access(l.property_id)));
create policy "Makler Notizen" on public.broker_property_notes for all to authenticated
  using (public.broker_can_access(property_id)) with check (public.broker_can_access(property_id));

create policy "Makler-Einstellungen lesen" on public.broker_settings for select to authenticated using (public.broker_is_broker());
create policy "Makler-Einstellungen ändern" on public.broker_settings for update to authenticated
  using (public.rgi_is_admin(auth.uid())) with check (public.rgi_is_admin(auth.uid()));
create policy "Vertretungen lesen" on public.broker_deputies for select to authenticated using (public.broker_is_broker());
create policy "Vertretungen pflegen" on public.broker_deputies for all to authenticated
  using (public.rgi_is_admin(auth.uid()) or broker_id = auth.uid())
  with check (public.rgi_is_admin(auth.uid()) or broker_id = auth.uid());

revoke all on public.broker_properties, public.broker_leads, public.broker_lead_events,
  public.broker_property_notes, public.broker_settings, public.broker_deputies from anon;

-- ---------------------------------------------------------------------------
-- Interessenten: Herkunft, Anfrage, letzter Kontakt
-- ---------------------------------------------------------------------------
alter table public.broker_leads
  add column if not exists source text not null default 'manuell',
  add column if not exists inquiry_id uuid references public.inquiries(id) on delete set null,
  add column if not exists last_contact_at timestamptz,
  add column if not exists outcome_reason text;

create or replace function public.broker_lead_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.broker_leads set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at), updated_at = now()
   where id = new.lead_id;
  return new;
end $$;
drop trigger if exists broker_lead_touch on public.broker_lead_events;
create trigger broker_lead_touch after insert on public.broker_lead_events
  for each row execute function public.broker_lead_touch();

-- ---------------------------------------------------------------------------
-- Fotos (öffentlich, nur für Website/Nutzer-App/Exposé) und Unterlagen (intern)
-- ---------------------------------------------------------------------------
create table if not exists public.broker_property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.broker_properties(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  caption text,
  width integer,
  height integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists broker_property_images_prop_idx on public.broker_property_images (property_id, sort_order);

create table if not exists public.broker_property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.broker_properties(id) on delete cascade,
  category text not null default 'sonstiges',
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists broker_property_documents_prop_idx on public.broker_property_documents (property_id, category);

alter table public.broker_property_images enable row level security;
alter table public.broker_property_documents enable row level security;
create policy "Makler Fotos" on public.broker_property_images for all to authenticated
  using (public.broker_can_access(property_id)) with check (public.broker_can_access(property_id));
create policy "Makler Unterlagen" on public.broker_property_documents for all to authenticated
  using (public.broker_can_access(property_id)) with check (public.broker_can_access(property_id));
revoke all on public.broker_property_images, public.broker_property_documents from anon;

insert into storage.buckets (id, name, public) values ('makler-fotos', 'makler-fotos', true)
  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('makler-unterlagen', 'makler-unterlagen', false)
  on conflict (id) do nothing;

drop policy if exists "Makler Fotos hochladen" on storage.objects;
create policy "Makler Fotos hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'makler-fotos' and public.broker_is_broker());
drop policy if exists "Makler Fotos ändern" on storage.objects;
create policy "Makler Fotos ändern" on storage.objects for update to authenticated
  using (bucket_id = 'makler-fotos' and public.broker_is_broker());
drop policy if exists "Makler Fotos löschen" on storage.objects;
create policy "Makler Fotos löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'makler-fotos' and public.broker_is_broker());
drop policy if exists "Makler Unterlagen lesen" on storage.objects;
create policy "Makler Unterlagen lesen" on storage.objects for select to authenticated
  using (bucket_id = 'makler-unterlagen' and public.broker_is_broker());
drop policy if exists "Makler Unterlagen hochladen" on storage.objects;
create policy "Makler Unterlagen hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'makler-unterlagen' and public.broker_is_broker());
drop policy if exists "Makler Unterlagen löschen" on storage.objects;
create policy "Makler Unterlagen löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'makler-unterlagen' and public.broker_is_broker());

-- ---------------------------------------------------------------------------
-- Öffentliche Liste für Website, Schaufenster und Nutzer-App
-- (nur freigegebene Angaben – keine Eigentümer, keine internen Notizen)
-- ---------------------------------------------------------------------------
create or replace function public.public_listings(_channel text default 'website')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'sort_key'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', bp.id,
      'slug', bp.slug,
      'legacy_id', bp.legacy_website_id,
      'listing_type', bp.listing_type,
      'website_state', bp.website_state,
      'is_reference', bp.is_reference,
      'reference_order', bp.reference_order,
      'display_order', bp.display_order,
      'display_hidden', bp.display_hidden,
      'title', bp.title,
      'description', bp.description,
      'street', bp.street,
      'house_number', bp.house_number,
      'postal_code', bp.postal_code,
      'city', bp.city,
      'district', bp.district,
      'property_type', bp.property_type,
      'property_subtype', bp.property_subtype,
      'condition', bp.condition,
      'price_eur', bp.price_eur,
      'cold_rent_eur', bp.cold_rent_eur,
      'warm_rent_eur', bp.warm_rent_eur,
      'service_charge_eur', bp.service_charge_eur,
      'heating_cost_eur', bp.heating_cost_eur,
      'deposit_eur', bp.deposit_eur,
      'commission_text', bp.commission_text,
      'commission_buyer_pct', bp.commission_buyer_pct,
      'commission_tenant_pct', bp.commission_tenant_pct,
      'living_space_sqm', bp.living_space_sqm,
      'plot_size_sqm', bp.plot_size_sqm,
      'rooms', bp.rooms,
      'bedrooms', bp.bedrooms,
      'bathrooms', bp.bathrooms,
      'floor', bp.floor,
      'total_floors', bp.total_floors,
      'year_built', bp.year_built,
      'available_from', bp.available_from,
      'heating_type', bp.heating_type,
      'energy_source', bp.energy_source,
      'energy_class', bp.energy_class,
      'energy_value', bp.energy_value,
      'energy_certificate_type', bp.energy_certificate_type,
      'energy_certificate_date', bp.energy_certificate_date,
      'features', bp.features,
      'updated_at', bp.updated_at,
      'created_at', bp.created_at,
      'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.storage_path, 'caption', i.caption) order by i.sort_order, i.created_at)
                          from public.broker_property_images i where i.property_id = bp.id), '[]'::jsonb),
      'sort_key', lpad(coalesce(bp.reference_order, 9999)::text, 5, '0') || coalesce(to_char(bp.created_at, 'YYYYMMDDHH24MISS'), '')
    ) x
    from public.broker_properties bp
    where (
      (_channel = 'website' and (
         (bp.show_on_website and bp.status <> 'entwurf')
         or (bp.is_reference and bp.status = 'abgeschlossen')))
      or (_channel = 'portal' and bp.show_in_portal and bp.status in ('vermarktung','reserviert'))
      or (_channel = 'display' and bp.show_on_website and bp.status in ('vermarktung','reserviert') and not bp.display_hidden)
    )
  ) s;
$$;
grant execute on function public.public_listings(text) to anon, authenticated;

-- Nutzer-App: Angebote nur für angemeldete Nutzer.
create or replace function public.portal_listings()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then '[]'::jsonb else public.public_listings('portal') end;
$$;
revoke execute on function public.portal_listings() from anon;
grant execute on function public.portal_listings() to authenticated;

-- ---------------------------------------------------------------------------
-- Schaufenster-Folien (aus der Website-Datenbank übernommen)
-- ---------------------------------------------------------------------------
create table if not exists public.display_slides (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  duration_seconds integer,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.display_settings (
  id integer primary key default 1 check (id = 1),
  object_duration_seconds integer not null default 16,
  content_duration_seconds integer not null default 13,
  city_filter text,
  updated_at timestamptz not null default now()
);
insert into public.display_settings (id) values (1) on conflict do nothing;
alter table public.display_slides enable row level security;
alter table public.display_settings enable row level security;
create policy "Schaufenster pflegen" on public.display_slides for all to authenticated
  using (public.broker_is_broker()) with check (public.broker_is_broker());
create policy "Schaufenster-Einstellungen pflegen" on public.display_settings for all to authenticated
  using (public.broker_is_broker()) with check (public.broker_is_broker());
revoke all on public.display_slides, public.display_settings from anon;

create or replace function public.public_display()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(d) from public.display_settings d limit 1),
    'slides', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.display_slides s where s.is_active), '[]'::jsonb),
    'properties', public.public_listings('display')
  );
$$;
grant execute on function public.public_display() to anon, authenticated;
