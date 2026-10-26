-- Beim Hochladen wählbar: sollen Eigentümer über das neue Dokument per E-Mail informiert werden?
alter table public.building_files add column if not exists benachrichtigen boolean not null default true;
