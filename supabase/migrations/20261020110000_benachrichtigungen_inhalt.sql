-- Versandte Benachrichtigungen nachlesen können: Empfänger, Betreff und Inhalt merken
alter table public.benachrichtigungen
  add column if not exists empfaenger text,
  add column if not exists betreff text,
  add column if not exists html text;
