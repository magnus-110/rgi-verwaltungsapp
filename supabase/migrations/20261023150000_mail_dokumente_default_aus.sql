-- „Neue Dokumente“ per E-Mail ist standardmäßig aus; Eigentümer schalten es selbst ein.
alter table public.owner_portal_einstellungen alter column mail_dokumente set default false;
update public.owner_portal_einstellungen set mail_dokumente = false where mail_dokumente = true;
