-- Je Auftrag wählbar: Eigentümer per E-Mail über Einzüge informieren (z. B. aus beim Umzug aus der Bank-App)
alter table public.payment_orders add column if not exists benachrichtigen boolean not null default true;
