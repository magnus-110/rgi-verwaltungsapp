
create table public.key_closing_plan_files (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index key_closing_plan_files_building_idx on public.key_closing_plan_files(building_id);

grant select, insert, update, delete on public.key_closing_plan_files to authenticated;
grant all on public.key_closing_plan_files to service_role;

alter table public.key_closing_plan_files enable row level security;

create policy kcpf_access on public.key_closing_plan_files
  for all to authenticated
  using (public.user_can_access_building(auth.uid(), building_id))
  with check (public.user_can_access_building(auth.uid(), building_id));
