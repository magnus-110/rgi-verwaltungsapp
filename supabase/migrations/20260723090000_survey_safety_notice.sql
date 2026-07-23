-- Anpassbarer Hinweistext für Sicherheits-/Pflichtpunkte (ohne Abstimmung)
alter table public.surveys
  add column if not exists safety_notice text
  default 'Diese Maßnahme wird aus Gründen der Verkehrssicherungspflicht ohnehin umgesetzt und steht daher nicht zur Abstimmung.';
update public.surveys
  set safety_notice = 'Diese Maßnahme wird aus Gründen der Verkehrssicherungspflicht ohnehin umgesetzt und steht daher nicht zur Abstimmung.'
  where safety_notice is null;
