-- Einzelne Termine eines Auftrags aus der Freigabe nehmen (z. B. eine Lastschrift
-- diesen Monat auslassen), ohne den Auftrag selbst zu ändern.
create table if not exists public.payment_order_skips (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.payment_order_items(id) on delete cascade,
  faellig_am date not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (order_item_id, faellig_am)
);
alter table public.payment_order_skips enable row level security;
create policy payment_order_skips_verwaltung on public.payment_order_skips
  for all to authenticated
  using (user_has_admin_access(auth.uid()))
  with check (user_has_admin_access(auth.uid()));
