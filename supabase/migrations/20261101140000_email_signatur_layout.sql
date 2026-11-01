-- Signatur: Aufbau (Layout) für alle Postfächer
alter table public.email_signature_settings add column if not exists layout text not null default 'name_links';
