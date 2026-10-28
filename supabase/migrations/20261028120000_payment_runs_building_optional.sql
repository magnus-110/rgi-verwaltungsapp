-- Zahlläufe vom RGI-Firmenkonto haben keine Liegenschaft.
alter table public.payment_runs alter column building_id drop not null;
