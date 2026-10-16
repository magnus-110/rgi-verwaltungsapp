-- Büro-Rechte in der Datenbank nur mit Zwei-Faktor-Anmeldung (aal2)
create or replace function public.get_user_role(user_uuid uuid)
returns app_role language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select case
    when p.role in ('admin'::app_role, 'employee'::app_role)
         and user_uuid = auth.uid()
         and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
      then null
    else p.role
  end
  from public.profiles p where p.user_id = user_uuid;
$$;

create or replace function public.is_rgi_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role::text in ('admin','employee')
  ) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

alter policy "ba_admin_employee_all" on public.building_assessments using (public.is_rgi_staff()) with check (public.is_rgi_staff());
alter policy "bsp_admin_employee_all" on public.building_service_providers using (public.is_rgi_staff()) with check (public.is_rgi_staff());
alter policy "Staff can manage note categories" on public.building_note_categories using (public.is_rgi_staff()) with check (public.is_rgi_staff());
alter policy "Staff can view note categories" on public.building_note_categories using (public.is_rgi_staff());
alter policy "Staff can delete building notes" on public.building_notes using (public.is_rgi_staff());
alter policy "Staff can insert building notes" on public.building_notes with check (public.is_rgi_staff());
alter policy "Staff can update building notes" on public.building_notes using (public.is_rgi_staff());
alter policy "Staff can view building notes" on public.building_notes using (public.is_rgi_staff());
alter policy "Staff delete takeover answers" on public.building_takeover_answers using (public.is_rgi_staff());
alter policy "Staff insert takeover answers" on public.building_takeover_answers with check (public.is_rgi_staff());
alter policy "Staff update takeover answers" on public.building_takeover_answers using (public.is_rgi_staff()) with check (public.is_rgi_staff());
alter policy "Staff view takeover answers" on public.building_takeover_answers using (public.is_rgi_staff());
alter policy "Staff can update change notifications" on public.contact_change_notifications using (public.is_rgi_staff());
alter policy "Staff can view change notifications" on public.contact_change_notifications using (public.is_rgi_staff());
