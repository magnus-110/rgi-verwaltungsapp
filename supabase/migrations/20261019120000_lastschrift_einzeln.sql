-- Umweg Einzellastschrift: je Posten festhalten, ob er schon gesendet wurde (nie doppelt einziehen)
alter table public.payment_run_items add column if not exists einzel_status text check (einzel_status in ('gesendet', 'unklar'));
alter table public.payment_run_items add column if not exists einzel_gesendet_am timestamptz;
