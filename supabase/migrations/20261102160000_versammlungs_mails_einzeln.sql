-- Versammlungs-Mails einzeln einstellbar statt eines gemeinsamen Schalters „Versammlungen“:
--   Einladung    – Standard aus (Einladungen verschickt RGI selbst)
--   Erinnerung   – Standard an (3 Tage vor der Versammlung)
--   Terminumfrage – Standard an (inkl. Erinnerung kurz vor Fristende)
alter table public.owner_portal_einstellungen
  add column if not exists mail_einladung boolean not null default false,
  add column if not exists mail_erinnerung boolean not null default true,
  add column if not exists mail_terminumfrage boolean not null default true;

-- Bestand: wer „Versammlungen“ ausgeschaltet hatte, bleibt bei Erinnerung und Terminumfrage aus.
update public.owner_portal_einstellungen
   set mail_erinnerung = mail_versammlungen,
       mail_terminumfrage = mail_versammlungen
 where mail_versammlungen = false;

comment on column public.owner_portal_einstellungen.mail_versammlungen is
  'Veraltet seit 02.11.2026 – ersetzt durch mail_einladung, mail_erinnerung, mail_terminumfrage. Wird nicht mehr ausgewertet.';

-- „Neue Dokumente“ per E-Mail wieder standardmäßig an (Rücknahme von 20261023150000).
alter table public.owner_portal_einstellungen alter column mail_dokumente set default true;
update public.owner_portal_einstellungen set mail_dokumente = true where mail_dokumente = false;
