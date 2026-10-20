-- Inhalt automatischer Mails zum Nachlesen (Passwörter werden vor dem Speichern unkenntlich gemacht)
alter table public.system_mail_log add column if not exists html text;
