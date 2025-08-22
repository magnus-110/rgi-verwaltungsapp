
-- 1) Gebäude-zuordnung zu Verwaltern (Admins)
create table if not exists public.building_managers (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null,
  user_id uuid not null, -- Verwalter (Admin) user_id (auth.uid)
  assigned_at timestamptz not null default now(),
  unique (building_id, user_id)
);

-- sinnvolle Indizes
create index if not exists idx_building_managers_building on public.building_managers (building_id);
create index if not exists idx_building_managers_user on public.building_managers (user_id);

alter table public.building_managers enable row level security;

-- Admins dürfen alles
create policy if not exists "Admins can manage building managers"
  on public.building_managers
  as restrictive
  for all
  using (get_user_role(auth.uid()) = 'admin')
  with check (get_user_role(auth.uid()) = 'admin');

-- Optional: Verwalter sehen eigene Zuweisungen (nur SELECT)
create policy if not exists "Managers can view their assignments"
  on public.building_managers
  as restrictive
  for select
  using (user_id = auth.uid());



-- 2) Web Push Subscriptions (pro User)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Nutzer verwalten ihre eigenen Subscriptions
create policy if not exists "Users can insert their own push subscriptions"
  on public.push_subscriptions
  as restrictive
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can select their own push subscriptions"
  on public.push_subscriptions
  as restrictive
  for select
  using (auth.uid() = user_id);

create policy if not exists "Users can update their own push subscriptions"
  on public.push_subscriptions
  as restrictive
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "Users can delete their own push subscriptions"
  on public.push_subscriptions
  as restrictive
  for delete
  using (auth.uid() = user_id);

-- Optional: Admins dürfen lesen (z. B. zur Fehlersuche)
create policy if not exists "Admins can read all push subscriptions"
  on public.push_subscriptions
  as restrictive
  for select
  using (get_user_role(auth.uid()) = 'admin');
