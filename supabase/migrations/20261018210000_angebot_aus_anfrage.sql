-- Angebot aus einer Website-Anfrage: Verknüpfung, damit die Anfrage ihr Angebot kennt.
alter table public.offers add column if not exists inquiry_id uuid references public.inquiries(id) on delete set null;
create index if not exists offers_inquiry_id_idx on public.offers (inquiry_id);
