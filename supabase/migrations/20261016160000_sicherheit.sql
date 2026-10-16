-- Sicherheits-Härtung (Prüfung vom 16.10.2026)

-- Hilfsfunktion: Büro (admin/employee), Server (service_role) oder direkte DB-Aufrufe (Cron)
create or replace function public.rgi_staff_or_service()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin')
      or public.is_rgi_staff();
$$;

-- A/B: geschützte Profil-Spalten darf nur das Büro (oder der Server) ändern
create or replace function public.guard_profile_protected_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not coalesce(public.user_has_admin_access(auth.uid()), false) then
    if new.user_id is distinct from old.user_id
       or new.building_id is distinct from old.building_id
       or new.broker_mode_enabled is distinct from old.broker_mode_enabled
       or new.mfa_required is distinct from old.mfa_required then
      raise exception 'Keine Berechtigung, diese Profil-Angaben zu ändern';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_profile_protected_columns
  before update on public.profiles
  for each row execute function public.guard_profile_protected_columns();

-- C: Push-Anmeldung nur noch über die eigene Tabelle (RLS: nur eigene Einträge)
revoke execute on function public.save_push_subscription(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.remove_push_subscription(uuid, text) from public, anon, authenticated;

-- Funktionen nur fürs Büro
create or replace function public.find_contact_by_phone(p_num text)
returns table(contact_id uuid, name text, phone text, label text, objekte text)
language sql stable security definer set search_path = public as $$
  with key as (select right(regexp_replace(p_num, '\D', '', 'g'), 8) as k)
  select c.id,
         coalesce(nullif(trim(c.company_name), ''),
                  nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '')) as name,
         p.phone_number,
         p.label,
         (select string_agg(distinct b.name || coalesce(' · Whg ' || a.unit_number, ''), ', ')
            from contact_building_assignments a
            join buildings b on b.id = a.building_id
           where a.contact_id = c.id and a.is_active = true) as objekte
  from contact_phones p
  join contacts c on c.id = p.contact_id, key
  where public.rgi_staff_or_service()
    and length(key.k) >= 7
    and right(regexp_replace(p.phone_number, '\D', '', 'g'), 8) = key.k;
$$;

create or replace function public.count_building_managers(building_id_param uuid)
returns integer language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select count(*)::integer from public.building_managers
  where building_id = building_id_param and public.rgi_staff_or_service();
$$;

create or replace function public.get_building_manager_names(building_id_param uuid)
returns text[] language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select array_agg(concat(p.first_name, ' ', p.last_name))
  from public.building_managers bm
  join public.profiles p on bm.user_id = p.user_id
  where bm.building_id = building_id_param
    and p.first_name is not null and p.last_name is not null
    and public.rgi_staff_or_service();
$$;

create or replace function public.get_building_managers(building_id_param uuid)
returns table(manager_id uuid, user_id uuid, first_name text, last_name text, email text)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select bm.id, bm.user_id, p.first_name, p.last_name, p.email
  from public.building_managers bm
  join public.profiles p on bm.user_id = p.user_id
  where bm.building_id = building_id_param and public.rgi_staff_or_service();
$$;

-- plpgsql-Funktionen: Prüfung am Anfang einsetzen
do $$
declare
  r record;
  d text;
  pruefung text;
begin
  for r in
    select * from (values
      ('public.get_building_overview(uuid)'::regprocedure, 'public.rgi_staff_or_service()'),
      ('public.neue_mandatsreferenz(uuid, text)'::regprocedure, 'public.rgi_staff_or_service()'),
      ('public.ensure_stammakte_categories(uuid)'::regprocedure, 'public.rgi_staff_or_service()'),
      ('public.ensure_broker_categories(uuid)'::regprocedure, '(public.rgi_staff_or_service() or public.has_broker_access(auth.uid()))')
    ) v(fn, bedingung)
  loop
    d := pg_get_functiondef(r.fn);
    if position('rgi_staff_or_service' in d) > 0 then continue; end if;
    pruefung := E'BEGIN\n  IF NOT ' || r.bedingung || E' THEN RAISE EXCEPTION ''Nicht erlaubt''; END IF;\n';
    d := regexp_replace(d, E'\\m(BEGIN|begin)\\M\\s*\\n', pruefung);
    execute d;
  end loop;
end $$;

-- E: Eigentümer sehen nur noch ihre eigenen Gebäude
alter policy "WEG owners can view accessible buildings" on public.buildings
  using (
    get_user_role(auth.uid()) = 'weg_owner'::app_role
    and (
      id in (select public.get_user_building_ids(auth.uid()))
      or id in (select w.building_id from public.weg_owner_buildings w where w.user_id = auth.uid())
    )
  );

-- E: Eigentümer können sich nicht mehr selbst einem Gebäude zuordnen oder austragen
alter policy "WEG owners can manage their own building assignments" on public.weg_owner_buildings with check (false);
alter policy "WEG owners can delete their own building assignments" on public.weg_owner_buildings using (false);

-- F: interne Tabellen nur fürs Büro
alter policy "Authenticated users can view campaigns" on public.comm_campaigns using (public.is_rgi_staff());
alter policy "Authenticated users can view recipients" on public.comm_recipients using (public.is_rgi_staff());
alter policy "Authenticated users can view templates" on public.comm_templates using (public.is_rgi_staff());
alter policy "Authenticated users can view plan unit items" on public.economic_plan_unit_items using (public.is_rgi_staff());
alter policy "Authenticated can read account review notes" on public.account_review_notes using (public.is_rgi_staff());
alter policy "Auth users can view heating_units" on public.heating_units using (public.is_rgi_staff());
alter policy "Authenticated users can view vendor aliases" on public.vendor_aliases using (public.is_rgi_staff());

-- G/4: Ohne Login nur noch, was öffentliche Seiten wirklich brauchen.
-- Behalten: Token-Links (Kassenprüfung, Vollmacht) und Hilfsfunktionen, die in Zugriffsregeln stecken.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.proname !~ '_by_token$'
      and p.proname not in ('update_audit_by_token', 'get_proxy_meeting_state')
      and not exists (
        select 1 from pg_policies pol
        where coalesce(pol.qual, '') ~ ('\m' || p.proname || '\M')
           or coalesce(pol.with_check, '') ~ ('\m' || p.proname || '\M')
      )
  loop
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
    execute format('revoke execute on function %s from public, anon', r.fn);
  end loop;
end $$;

-- Funktionen, die nur intern (Server/Trigger) gebraucht werden
revoke execute on function public.find_vendor_memory(text, text, management_mode) from public, anon, authenticated;
revoke execute on function public.calculate_account_balance_at(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function public.ensure_stammakte_categories_raw(uuid) from public, anon, authenticated;
revoke execute on function public.generate_building_code(management_mode) from public, anon, authenticated;
revoke execute on function public.generate_sepa_mandate_ref() from public, anon, authenticated;
revoke execute on function public.find_similar_bookings(vector, uuid, management_mode, integer, double precision, boolean) from public, anon, authenticated;

-- 8: fester search_path
alter function public.normalize_phone_last8(text) set search_path = public;
alter function public.aufnahmen_touch() set search_path = public;
